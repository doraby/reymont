import Foundation
import SwiftData

private struct SampleBook {
    let id: String
    let filename: String
    let title: String
    let author: String

    static let all: [SampleBook] = [
        SampleBook(id: "sample-chlopi", filename: "chlopi.epub", title: "Chłopi", author: "Władysław Reymont"),
        SampleBook(id: "sample-bernays-propaganda", filename: "bernays-propaganda.epub", title: "Propaganda", author: "Edward Bernays"),
        SampleBook(id: "sample-bernays-crystallizing", filename: "bernays-crystallizing.epub", title: "Crystallizing Public Opinion", author: "Edward Bernays"),
    ]
}

enum BookImporter {
    /// Adds the bundled sample books to the library exactly once (on first launch).
    @MainActor
    static func seedSampleBooksIfNeeded(context: ModelContext) {
        let existing = (try? context.fetch(FetchDescriptor<Book>())) ?? []
        let existingIds = Set(existing.map(\.id))
        for sample in SampleBook.all where !existingIds.contains(sample.id) {
            let book = Book(id: sample.id, title: sample.title, author: sample.author, storageKind: .bundled, storageRef: sample.filename)
            context.insert(book)
            if let url = try? book.resolveFileURL(),
               let package = try? EPUBParser.parse(fileURL: url, cacheKey: book.id) {
                book.coverImageData = package.coverImageData
                if !package.title.isEmpty { book.title = package.title }
                if !package.author.isEmpty { book.author = package.author }
            }
        }
        try? context.save()
    }

    /// Copies a user-picked .epub into the library, parses its metadata, and
    /// inserts a new `Book`.
    @MainActor
    @discardableResult
    static func importFile(at url: URL, context: ModelContext) throws -> Book {
        let (id, storageRef) = try BookStorage.importFile(from: url)
        let book = Book(id: id, title: url.deletingPathExtension().lastPathComponent, author: "", storageKind: .imported, storageRef: storageRef)
        let fileURL = try book.resolveFileURL()
        let package = try EPUBParser.parse(fileURL: fileURL, cacheKey: id)
        if !package.title.isEmpty { book.title = package.title }
        book.author = package.author
        book.coverImageData = package.coverImageData
        context.insert(book)
        try context.save()
        return book
    }

    @MainActor
    static func delete(_ book: Book, context: ModelContext) {
        if let extractDir = try? EPUBParser.extractionDirectory(for: book.id) {
            try? FileManager.default.removeItem(at: extractDir)
        }
        if book.storageKind == .imported, let url = try? book.resolveFileURL() {
            try? FileManager.default.removeItem(at: url)
        }
        context.delete(book)
        try? context.save()
    }
}
