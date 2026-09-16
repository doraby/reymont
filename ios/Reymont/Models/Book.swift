import Foundation
import SwiftData

/// Where a book's .epub file actually lives on disk.
enum BookStorageKind: String, Codable {
    /// Ships inside the app bundle (Resources/SampleBooks).
    case bundled
    /// Copied into the app's Documents/Books folder when the reader imported it.
    case imported
}

@Model
final class Book {
    /// Stable identifier. Bundled sample books use a fixed slug so re-launches
    /// (and, once wired up, cloud highlight sync) recognize the same book;
    /// imported books get a fresh UUID string.
    @Attribute(.unique) var id: String
    var title: String
    var author: String
    var storageKindRaw: String
    /// Bundled: the resource filename (e.g. "chlopi.epub").
    /// Imported: the filename inside Documents/Books.
    var storageRef: String

    var coverImageData: Data?
    var addedAt: Date
    var lastOpenedAt: Date?

    /// Reading position, in our own scheme (not EPUB CFI): spine index + a
    /// character offset into that chapter's extracted plain text.
    var currentChapterIndex: Int
    var currentCharOffset: Int
    var progressFraction: Double

    @Relationship(deleteRule: .cascade, inverse: \Highlight.book)
    var highlights: [Highlight] = []

    var storageKind: BookStorageKind {
        get { BookStorageKind(rawValue: storageKindRaw) ?? .imported }
        set { storageKindRaw = newValue.rawValue }
    }

    init(
        id: String,
        title: String,
        author: String,
        storageKind: BookStorageKind,
        storageRef: String,
        coverImageData: Data? = nil,
        addedAt: Date = .now
    ) {
        self.id = id
        self.title = title
        self.author = author
        self.storageKindRaw = storageKind.rawValue
        self.storageRef = storageRef
        self.coverImageData = coverImageData
        self.addedAt = addedAt
        self.lastOpenedAt = nil
        self.currentChapterIndex = 0
        self.currentCharOffset = 0
        self.progressFraction = 0
    }

    /// Resolves the on-disk location of the .epub, copying bundled samples
    /// into Documents on first access so ZIPFoundation can open a plain file URL.
    func resolveFileURL() throws -> URL {
        switch storageKind {
        case .imported:
            return try BookStorage.importedBooksDirectory().appendingPathComponent(storageRef)
        case .bundled:
            guard let url = Bundle.main.url(forResource: (storageRef as NSString).deletingPathExtension, withExtension: "epub", subdirectory: "SampleBooks") else {
                throw BookStorageError.bundledResourceMissing(storageRef)
            }
            return url
        }
    }
}

enum BookStorageError: Error, LocalizedError {
    case bundledResourceMissing(String)
    case couldNotAccessSecurityScopedResource

    var errorDescription: String? {
        switch self {
        case .bundledResourceMissing(let name):
            return "Bundled sample book \(name) is missing from the app bundle."
        case .couldNotAccessSecurityScopedResource:
            return "Could not read the selected file."
        }
    }
}

enum BookStorage {
    static func importedBooksDirectory() throws -> URL {
        let dir = try FileManager.default
            .url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("Books", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    /// Copies a picked file into Documents/Books under a fresh UUID-based name
    /// and returns (bookId, storageRef) for a new Book.
    static func importFile(from sourceURL: URL) throws -> (id: String, storageRef: String) {
        let didStartAccessing = sourceURL.startAccessingSecurityScopedResource()
        defer { if didStartAccessing { sourceURL.stopAccessingSecurityScopedResource() } }

        let id = UUID().uuidString
        let filename = "\(id).epub"
        let destination = try importedBooksDirectory().appendingPathComponent(filename)
        try FileManager.default.copyItem(at: sourceURL, to: destination)
        return (id, filename)
    }
}
