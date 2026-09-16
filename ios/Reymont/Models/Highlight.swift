import Foundation
import SwiftData

@Model
final class Highlight {
    @Attribute(.unique) var id: String
    var book: Book?
    var bookId: String

    var chapterIndex: Int
    var chapterHref: String
    var rangeStart: Int
    var rangeEnd: Int

    var quotedText: String
    var surroundingParagraph: String
    var colorRaw: String

    var translation: String?
    var translationLanguage: String?

    var createdAt: Date
    var updatedAt: Date

    /// True once this highlight has been pushed to Supabase (or doesn't need to be —
    /// e.g. the user isn't signed in). Flipped back on local edits so a background
    /// sync pass knows to re-upload it.
    var isSynced: Bool

    init(
        id: String = UUID().uuidString,
        book: Book,
        chapterIndex: Int,
        chapterHref: String,
        rangeStart: Int,
        rangeEnd: Int,
        quotedText: String,
        surroundingParagraph: String,
        color: HighlightColor = .terracotta
    ) {
        self.id = id
        self.book = book
        self.bookId = book.id
        self.chapterIndex = chapterIndex
        self.chapterHref = chapterHref
        self.rangeStart = rangeStart
        self.rangeEnd = rangeEnd
        self.quotedText = quotedText
        self.surroundingParagraph = surroundingParagraph
        self.colorRaw = color.rawValue
        self.translation = nil
        self.translationLanguage = nil
        self.createdAt = .now
        self.updatedAt = .now
        self.isSynced = false
    }

    var color: HighlightColor {
        get { HighlightColor(rawValue: colorRaw) ?? .terracotta }
        set { colorRaw = newValue.rawValue; updatedAt = .now; isSynced = false }
    }
}
