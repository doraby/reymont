import Foundation

enum AIError: Error, LocalizedError {
    case signInRequired
    case freeLimitReached
    case server(String)

    var errorDescription: String? {
        switch self {
        case .signInRequired: return "Sign in (or add your own OpenAI key in Settings) to translate highlights."
        case .freeLimitReached: return "Free plan limit reached — 10 highlights translated. See Reymont Premium in Settings."
        case .server(let message): return message
        }
    }
}

/// Talks to the same OpenAI-backed translation the web app uses: either the
/// Supabase edge function (signed-in readers, free-tier metered) or, if the
/// reader added their own key in Settings, straight to OpenAI.
@MainActor
enum AIService {
    static func translate(text: String, paragraph: String, targetLanguage: String, isShort: Bool) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let request = try await buildRequest(text: text, paragraph: paragraph, targetLanguage: targetLanguage, isShort: isShort)
                    try await stream(request: request, continuation: continuation)
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private static func buildRequest(text: String, paragraph: String, targetLanguage: String, isShort: Bool) async throws -> URLRequest {
        let ownKey = AppSettings.shared.openAIKey
        if !ownKey.isEmpty {
            var request = URLRequest(url: URL(string: "https://api.openai.com/v1/chat/completions")!)
            request.httpMethod = "POST"
            request.setValue("Bearer \(ownKey)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(OpenAIChatBody(
                model: "gpt-4o-mini",
                stream: true,
                temperature: 0.3,
                messages: [
                    .init(role: "system", content: systemPrompt(targetLanguage: targetLanguage, isShort: isShort, hasParagraph: !paragraph.isEmpty)),
                    .init(role: "user", content: userMessage(text: text, paragraph: paragraph)),
                ]
            ))
            return request
        }

        guard SupabaseAuthService.shared.isSignedIn else { throw AIError.signInRequired }
        let token = try await SupabaseAuthService.shared.validAccessToken()
        var request = URLRequest(url: SupabaseConfig.url.appendingPathComponent("functions/v1/ai"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(EdgeFunctionBody(
            action: "translate", text: text, para: paragraph, lang: targetLanguage, short: isShort
        ))
        return request
    }

    private static func systemPrompt(targetLanguage: String, isShort: Bool, hasParagraph: Bool) -> String {
        var sys = "You are an expert literary translator. Translate the text inside <text> tags into \(targetLanguage). Output ONLY the translation, no comments, tags or quotes."
        sys += isShort
            ? " Since the text is a single word or short phrase: first line — the best translation as used in this context; then a new line in parentheses with the part of speech and 2–4 alternative meanings in \(targetLanguage), comma-separated."
            : " Preserve the tone and style of the original."
        if hasParagraph {
            sys += " A <context> tag contains the surrounding paragraph — use it only to disambiguate meaning; never translate or mention it."
        }
        return sys
    }

    private static func userMessage(text: String, paragraph: String) -> String {
        paragraph.isEmpty ? "<text>\(text)</text>" : "<text>\(text)</text>\n<context>\(paragraph)</context>"
    }

    private static func stream(request: URLRequest, continuation: AsyncThrowingStream<String, Error>.Continuation) async throws {
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 200

        switch status {
        case 200:
            break
        case 402:
            _ = try? await drain(bytes)
            throw AIError.freeLimitReached
        case 401:
            _ = try? await drain(bytes)
            throw AIError.signInRequired
        default:
            let body = try await drain(bytes)
            throw AIError.server(Self.errorMessage(from: body) ?? "HTTP \(status)")
        }

        for try await line in bytes.lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("data:") else { continue }
            let payload = trimmed.dropFirst(5).trimmingCharacters(in: .whitespaces)
            if payload == "[DONE]" { continue }
            guard let data = payload.data(using: .utf8),
                  let chunk = try? JSONDecoder().decode(OpenAIStreamChunk.self, from: data),
                  let delta = chunk.choices?.first?.delta?.content else { continue }
            continuation.yield(delta)
        }
    }

    private static func drain(_ bytes: URLSession.AsyncBytes) async throws -> String {
        var text = ""
        for try await line in bytes.lines { text += line }
        return text
    }

    private static func errorMessage(from body: String) -> String? {
        guard let data = body.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(EdgeErrorBody.self, from: data).error.message
    }
}

private struct OpenAIChatBody: Codable {
    struct Message: Codable { let role: String; let content: String }
    let model: String
    let stream: Bool
    let temperature: Double
    let messages: [Message]
}

private struct EdgeFunctionBody: Codable {
    let action: String
    let text: String
    let para: String
    let lang: String
    let short: Bool
}

private struct OpenAIStreamChunk: Codable {
    struct Choice: Codable {
        struct Delta: Codable { let content: String? }
        let delta: Delta?
    }
    let choices: [Choice]?
}

private struct EdgeErrorBody: Codable {
    struct Inner: Codable { let message: String }
    let error: Inner
}
