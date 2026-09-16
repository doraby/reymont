import Foundation

struct SupabaseSession: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
    let userId: String
    let email: String
}

enum AuthError: Error, LocalizedError {
    case notSignedIn
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Sign in required."
        case .server(let message): return message
        }
    }
}

/// Email one-time-code sign-in against Supabase Auth's REST API — the same
/// project the web app uses, but a code the reader types beats a magic link
/// on a phone (no juggling between Mail and the app, no universal-link setup).
@MainActor
final class SupabaseAuthService: ObservableObject {
    static let shared = SupabaseAuthService()

    @Published private(set) var session: SupabaseSession?
    @Published var isSendingCode = false
    @Published var isVerifying = false
    @Published var lastError: String?

    var isSignedIn: Bool { session != nil }
    var userEmail: String? { session?.email }

    private let sessionKey = "auth.session"

    private init() {
        session = Self.loadSession(key: sessionKey)
    }

    func sendCode(email: String) async {
        isSendingCode = true
        defer { isSendingCode = false }
        lastError = nil
        do {
            var request = URLRequest(url: SupabaseConfig.url.appendingPathComponent("auth/v1/otp"))
            request.httpMethod = "POST"
            request.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(OTPRequest(email: email, createUser: true))
            let (data, response) = try await URLSession.shared.data(for: request)
            try Self.throwIfError(data: data, response: response)
        } catch {
            lastError = error.localizedDescription
        }
    }

    func verifyCode(email: String, code: String) async -> Bool {
        isVerifying = true
        defer { isVerifying = false }
        lastError = nil
        do {
            var request = URLRequest(url: SupabaseConfig.url.appendingPathComponent("auth/v1/verify"))
            request.httpMethod = "POST"
            request.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(VerifyRequest(type: "email", email: email, token: code))
            let (data, response) = try await URLSession.shared.data(for: request)
            try Self.throwIfError(data: data, response: response)
            let decoded = try JSONDecoder().decode(TokenResponse.self, from: data)
            guard let newSession = decoded.asSession(fallback: nil) else { throw AuthError.server("Sign-in response was missing account details.") }
            session = newSession
            Self.saveSession(newSession, key: sessionKey)
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func signOut() {
        session = nil
        KeychainStore.remove(sessionKey)
    }

    /// Returns a usable access token, refreshing it first if it's expired or
    /// about to be.
    func validAccessToken() async throws -> String {
        guard let current = session else { throw AuthError.notSignedIn }
        if current.expiresAt.timeIntervalSinceNow > 60 { return current.accessToken }

        var request = URLRequest(url: SupabaseConfig.url.appendingPathComponent("auth/v1/token"))
        var components = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token")]
        request.url = components.url
        request.httpMethod = "POST"
        request.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["refresh_token": current.refreshToken])

        let (data, response) = try await URLSession.shared.data(for: request)
        try Self.throwIfError(data: data, response: response)
        let decoded = try JSONDecoder().decode(TokenResponse.self, from: data)
        guard let refreshed = decoded.asSession(fallback: current) else { throw AuthError.server("Could not refresh the session.") }
        session = refreshed
        Self.saveSession(refreshed, key: sessionKey)
        return refreshed.accessToken
    }

    // MARK: - Persistence

    private static func saveSession(_ session: SupabaseSession, key: String) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        KeychainStore.set(String(decoding: data, as: UTF8.self), for: key)
    }

    private static func loadSession(key: String) -> SupabaseSession? {
        guard let raw = KeychainStore.get(key), let data = raw.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(SupabaseSession.self, from: data)
    }

    private static func throwIfError(data: Data, response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard !(200...299).contains(http.statusCode) else { return }
        if let body = try? JSONDecoder().decode(SupabaseErrorBody.self, from: data) {
            throw AuthError.server(body.message ?? body.errorDescription ?? "HTTP \(http.statusCode)")
        }
        throw AuthError.server("HTTP \(http.statusCode)")
    }
}

private struct VerifyRequest: Codable {
    let type: String
    let email: String
    let token: String
}

private struct OTPRequest: Codable {
    let email: String
    let createUser: Bool

    enum CodingKeys: String, CodingKey {
        case email
        case createUser = "create_user"
    }
}

private struct SupabaseErrorBody: Codable {
    let message: String?
    let errorDescription: String?

    enum CodingKeys: String, CodingKey {
        case message
        case errorDescription = "error_description"
    }
}

private struct TokenResponse: Codable {
    let accessToken: String?
    let refreshToken: String?
    let expiresIn: Int?
    let user: UserInfo?

    struct UserInfo: Codable {
        let id: String
        let email: String?
    }

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case user
    }

    func asSession(fallback: SupabaseSession?) -> SupabaseSession? {
        guard let accessToken, let refreshToken, let expiresIn else { return nil }
        let userId = user?.id ?? fallback?.userId
        let email = user?.email ?? fallback?.email
        guard let userId, let email else { return nil }
        return SupabaseSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: Date().addingTimeInterval(TimeInterval(expiresIn)),
            userId: userId,
            email: email
        )
    }
}
