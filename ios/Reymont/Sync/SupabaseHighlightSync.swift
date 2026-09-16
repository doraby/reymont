import Foundation

/// Best-effort push of highlights to the same `highlights` table the web app
/// reads and writes (see `noteToRow`/`rowToNote` in index.html for the row
/// shape). Fire-and-forget: failures are logged, not surfaced, since a
/// highlight is already safely saved locally either way.
///
/// Note: the web app anchors a highlight with an EPUB CFI range, which this
/// app doesn't compute (it uses its own chapter-index + character-offset
/// scheme instead, stored in the same `cfi_range` column as an opaque
/// string). That keeps a reader's highlights synced across their own iOS
/// devices, but a highlight made here won't visually line up if opened in
/// the web reader, and vice versa — full cross-platform position sync isn't
/// implemented yet.
@MainActor
final class SupabaseHighlightSync {
    static let shared = SupabaseHighlightSync()
    private init() {}

    func enqueueUpsert(_ highlight: Highlight) {
        guard SupabaseAuthService.shared.isSignedIn else { return }
        let row = HighlightRow(highlight: highlight)
        Task {
            do {
                var request = try await authorizedRequest(path: "rest/v1/highlights", method: "POST")
                request.setValue("resolution=merge-duplicates", forHTTPHeaderField: "Prefer")
                request.httpBody = try JSONEncoder().encode(row)
                let (_, response) = try await URLSession.shared.data(for: request)
                logIfFailed(response)
            } catch {
                print("SupabaseHighlightSync upsert failed:", error.localizedDescription)
            }
        }
    }

    func enqueueDelete(id: String) {
        guard SupabaseAuthService.shared.isSignedIn else { return }
        Task {
            do {
                var request = try await authorizedRequest(path: "rest/v1/highlights?id=eq.\(id)", method: "DELETE")
                let (_, response) = try await URLSession.shared.data(for: request)
                logIfFailed(response)
            } catch {
                print("SupabaseHighlightSync delete failed:", error.localizedDescription)
            }
        }
    }

    private func authorizedRequest(path: String, method: String) async throws -> URLRequest {
        let token = try await SupabaseAuthService.shared.validAccessToken()
        var request = URLRequest(url: SupabaseConfig.url.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }

    private func logIfFailed(_ response: URLResponse) {
        guard let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) else { return }
        print("SupabaseHighlightSync: HTTP \(http.statusCode)")
    }
}

private struct HighlightRow: Codable {
    let id: String
    let book_id: String
    let cfi_range: String
    let text: String
    let para: String
    let created: Int
    let updated: Int

    init(highlight: Highlight) {
        id = highlight.id
        book_id = highlight.bookId
        cfi_range = "ios:\(highlight.chapterIndex):\(highlight.rangeStart)-\(highlight.rangeEnd)"
        text = highlight.quotedText
        para = highlight.surroundingParagraph
        created = Int(highlight.createdAt.timeIntervalSince1970 * 1000)
        updated = Int(highlight.updatedAt.timeIntervalSince1970 * 1000)
    }
}
