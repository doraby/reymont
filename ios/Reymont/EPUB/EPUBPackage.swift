import Foundation

/// One entry in the book's table of contents.
struct TocEntry: Identifiable, Hashable {
    var id: String { "\(spineIndex)-\(title)" }
    let title: String
    let spineIndex: Int
    /// Nesting depth for indentation (0 = top level).
    let depth: Int
}

/// A single spine (reading-order) document.
struct SpineChapter {
    let href: String
    let fileURL: URL
}

/// The result of parsing an .epub file: metadata plus everything needed to
/// render chapters and a table of contents, without touching the zip again.
struct EPUBPackage {
    let title: String
    let author: String
    let coverImageData: Data?
    let spine: [SpineChapter]
    let toc: [TocEntry]
    /// Directory the .epub was unzipped into (Caches/EPUBExtract/<id>). Chapter
    /// files and any images/CSS they reference on relative paths live here, so
    /// loading a chapter with this as its base URL resolves inline images.
    let extractedDirectory: URL
}

enum EPUBParseError: Error, LocalizedError {
    case invalidContainer
    case missingOPF
    case invalidOPF
    case noSpineItems

    var errorDescription: String? {
        switch self {
        case .invalidContainer: return "This file's META-INF/container.xml is missing or malformed."
        case .missingOPF: return "Could not find the book's package (.opf) file."
        case .invalidOPF: return "The book's package (.opf) file could not be parsed."
        case .noSpineItems: return "This book has no readable chapters."
        }
    }
}
