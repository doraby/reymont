import SwiftUI

/// Renders one slide: either a page of chapter text (with live highlighting
/// and selection), or a chapter-transition card that bridges two chapters.
struct PageContentView: View {
    let slide: ReaderSlide
    @ObservedObject var viewModel: ReaderViewModel

    var body: some View {
        switch slide {
        case .content(let page, _):
            HighlightableTextView(
                attributed: page.attributed,
                highlights: viewModel.pageHighlights(for: page),
                onRequestHighlight: { range, text in
                    let paragraph = Self.surroundingParagraph(in: page.attributed.string, around: range)
                    viewModel.requestHighlight(quotedText: text, surroundingParagraph: paragraph, localRange: range, page: page)
                },
                onTapHighlight: { highlight in
                    viewModel.activeHighlight = highlight
                }
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

        case .nextChapter(let title):
            ChapterTransitionCard(direction: "Next chapter", title: title, systemImage: "chevron.right")
        case .previousChapter(let title):
            ChapterTransitionCard(direction: "Previous chapter", title: title, systemImage: "chevron.left")
        }
    }

    /// Expands a selection out to the whole paragraph it sits in (bounded by
    /// blank lines), for extra context sent along with a translation request.
    static func surroundingParagraph(in text: String, around range: NSRange) -> String {
        let ns = text as NSString
        guard range.location != NSNotFound, range.location <= ns.length else { return "" }
        var start = range.location
        while start > 0 {
            let ch = ns.character(at: start - 1)
            if ch == 0x0A { break }
            start -= 1
        }
        var end = range.location + range.length
        while end < ns.length {
            let ch = ns.character(at: end)
            if ch == 0x0A { break }
            end += 1
        }
        guard start < end else { return "" }
        return ns.substring(with: NSRange(location: start, length: end - start)).trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private struct ChapterTransitionCard: View {
    let direction: String
    let title: String
    let systemImage: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 22, weight: .light))
                .foregroundStyle(Theme.muted)
            Text(direction.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.5)
                .foregroundStyle(Theme.muted)
            Text(title)
                .font(Theme.serifHeadline.italic())
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
