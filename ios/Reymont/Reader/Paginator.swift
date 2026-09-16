import UIKit

/// One page's worth of a chapter, plus where it starts within the chapter's
/// full attributed string — needed to translate a highlight made inside this
/// page's text view back into chapter-relative character offsets.
struct PaginatedPage {
    let attributed: NSAttributedString
    let chapterOffsetStart: Int
}

/// Splits a chapter's `NSAttributedString` into page-sized chunks using
/// TextKit: lay the text out into a container sized to the reading area, ask
/// how many glyphs fit, slice that off as one page, and repeat with what's
/// left. This is the standard TextKit pagination technique (as used by
/// Apple's own WWDC sample code for building a paginated reader).
enum Paginator {
    static func paginate(_ attributed: NSAttributedString, containerSize: CGSize) -> [PaginatedPage] {
        guard attributed.length > 0, containerSize.width > 0, containerSize.height > 0 else {
            return attributed.length > 0 ? [PaginatedPage(attributed: attributed, chapterOffsetStart: 0)] : []
        }

        var pages: [PaginatedPage] = []
        var remaining = attributed
        var absoluteOffset = 0

        while remaining.length > 0 {
            let textStorage = NSTextStorage(attributedString: remaining)
            let layoutManager = NSLayoutManager()
            textStorage.addLayoutManager(layoutManager)
            let textContainer = NSTextContainer(size: containerSize)
            textContainer.lineFragmentPadding = 0
            layoutManager.addTextContainer(textContainer)

            let glyphRange = layoutManager.glyphRange(for: textContainer)
            var charRange = layoutManager.characterRange(forGlyphRange: glyphRange, actualGlyphRange: nil)
            if charRange.length == 0 {
                // Nothing fit at all (e.g. a single oversized attachment) —
                // force at least one character through so we make progress.
                charRange = NSRange(location: 0, length: 1)
            }

            let pageString = remaining.attributedSubstring(from: charRange)
            pages.append(PaginatedPage(attributed: pageString, chapterOffsetStart: absoluteOffset))

            let consumed = charRange.location + charRange.length
            absoluteOffset += consumed
            guard consumed < remaining.length else { break }
            remaining = remaining.attributedSubstring(from: NSRange(location: consumed, length: remaining.length - consumed))
        }
        return pages
    }
}
