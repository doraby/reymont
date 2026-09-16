import Foundation

/// One horizontally-swipeable unit in the reader's page view. Most slides are
/// a page of chapter text; at the very start/end of a chapter we splice in a
/// thin "transition" slide so swiping past the last page of chapter *N*
/// naturally continues into chapter *N+1* (and swiping back from its first
/// page returns to the end of chapter *N-1*), all through the same native
/// swipe gesture rather than a separate "next chapter" button.
enum ReaderSlide: Identifiable {
    case content(PaginatedPage, pageIndex: Int)
    case nextChapter(title: String)
    case previousChapter(title: String)

    var id: String {
        switch self {
        case .content(_, let pageIndex): return "content-\(pageIndex)"
        case .nextChapter: return "next-chapter"
        case .previousChapter: return "previous-chapter"
        }
    }
}

/// A highlight's location translated into character offsets local to one
/// page's attributed text (rather than the whole chapter).
struct PageHighlight {
    let highlight: Highlight
    let localStart: Int
    let localEnd: Int

    func contains(_ index: Int) -> Bool { index >= localStart && index < localEnd }
}
