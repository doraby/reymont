import SwiftUI
import SwiftData

@main
struct ReymontApp: App {
    var body: some Scene {
        WindowGroup {
            LibraryView()
        }
        .modelContainer(for: [Book.self, Highlight.self])
    }
}
