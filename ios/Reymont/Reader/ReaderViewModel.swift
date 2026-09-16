import Foundation
import SwiftData
import UIKit

@MainActor
final class ReaderViewModel: ObservableObject {
    let book: Book
    private let context: ModelContext

    @Published private(set) var package: EPUBPackage?
    @Published var loadError: String?
    @Published var isLoading = true

    @Published private(set) var chapterIndex: Int
    @Published private(set) var slides: [ReaderSlide] = []
    @Published var selection: Int = 0
    @Published var fontSize: CGFloat
    @Published var containerSize: CGSize = .zero {
        didSet {
            guard containerSize != oldValue, containerSize.width > 40, containerSize.height > 40 else { return }
            repaginateCurrentChapter(preserveOffset: true)
        }
    }

    @Published var showingTOC = false
    @Published var showingHighlightsList = false
    @Published var activeHighlight: Highlight?
    /// Set while the color-picker sheet is up, deciding what happens on a tap.
    @Published var pendingSelection: PendingSelection?

    struct PendingSelection {
        let quotedText: String
        let surroundingParagraph: String
        let chapterRangeStart: Int
        let chapterRangeEnd: Int
    }

    private var lastChapterOffsetAnchor = 0

    init(book: Book, context: ModelContext, fontSize: CGFloat) {
        self.book = book
        self.context = context
        self.chapterIndex = max(0, book.currentChapterIndex)
        self.fontSize = fontSize
    }

    func start() async {
        guard package == nil else { return }
        do {
            let fileURL = try book.resolveFileURL()
            let bookId = book.id
            let parsed = try EPUBParser.parse(fileURL: fileURL, cacheKey: bookId)
            self.package = parsed
            if chapterIndex >= parsed.spine.count { chapterIndex = 0 }
            lastChapterOffsetAnchor = book.currentCharOffset
            isLoading = false
            book.lastOpenedAt = .now
            try? context.save()
            if containerSize.width > 40 { repaginateCurrentChapter(preserveOffset: false) }
        } catch {
            loadError = error.localizedDescription
            isLoading = false
        }
    }

    // MARK: - Pagination

    func repaginateCurrentChapter(preserveOffset: Bool) {
        guard let package, chapterIndex < package.spine.count, containerSize.width > 40 else { return }
        let anchor = preserveOffset ? currentChapterOffset() : lastChapterOffsetAnchor
        do {
            let attributed = try ChapterLoader.load(package.spine[chapterIndex], fontSize: fontSize)
            let pages = Paginator.paginate(attributed, containerSize: containerSize)
            buildSlides(from: pages, package: package)
            selectPage(nearestTo: anchor, in: pages)
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func buildSlides(from pages: [PaginatedPage], package: EPUBPackage) {
        var result: [ReaderSlide] = []
        if chapterIndex > 0 {
            result.append(.previousChapter(title: chapterTitle(for: chapterIndex - 1, package: package)))
        }
        for (i, page) in pages.enumerated() {
            result.append(.content(page, pageIndex: i))
        }
        if chapterIndex < package.spine.count - 1 {
            result.append(.nextChapter(title: chapterTitle(for: chapterIndex + 1, package: package)))
        }
        slides = result
    }

    private func chapterTitle(for index: Int, package: EPUBPackage) -> String {
        package.toc.first(where: { $0.spineIndex == index })?.title ?? "Chapter \(index + 1)"
    }

    private func selectPage(nearestTo offset: Int, in pages: [PaginatedPage]) {
        let leadingOffset = chapterIndex > 0 ? 1 : 0
        guard !pages.isEmpty else { selection = 0; return }
        var bestIndex = 0
        for (i, page) in pages.enumerated() where page.chapterOffsetStart <= offset {
            bestIndex = i
        }
        selection = leadingOffset + bestIndex
    }

    private func currentChapterOffset() -> Int {
        guard case .content(let page, _) = slides[safe: selection] else { return lastChapterOffsetAnchor }
        return page.chapterOffsetStart
    }

    // MARK: - Navigation across chapters

    /// Called by the view whenever the swiped-to page changes (`selection` is
    /// already `newValue` by this point — SwiftUI updated the binding first).
    func selectionDidChange(to newValue: Int) {
        guard let slide = slides[safe: newValue] else { return }
        switch slide {
        case .content:
            persistPosition()
        case .nextChapter:
            goToChapter(chapterIndex + 1, landOnLastPage: false)
        case .previousChapter:
            goToChapter(chapterIndex - 1, landOnLastPage: true)
        }
    }

    private func goToChapter(_ index: Int, landOnLastPage: Bool) {
        guard let package, index >= 0, index < package.spine.count else { return }
        chapterIndex = index
        do {
            let attributed = try ChapterLoader.load(package.spine[index], fontSize: fontSize)
            let pages = Paginator.paginate(attributed, containerSize: containerSize)
            buildSlides(from: pages, package: package)
            let leadingOffset = index > 0 ? 1 : 0
            let target = landOnLastPage ? (slides.count - 1 - (index < package.spine.count - 1 ? 1 : 0)) : leadingOffset
            selection = min(max(0, target), max(0, slides.count - 1))
        } catch {
            loadError = error.localizedDescription
        }
        persistPosition()
    }

    func jumpToChapter(_ index: Int) {
        showingTOC = false
        goToChapter(index, landOnLastPage: false)
    }

    func jumpToHighlight(_ highlight: Highlight) {
        showingHighlightsList = false
        if highlight.chapterIndex != chapterIndex {
            chapterIndex = highlight.chapterIndex
            guard let package, chapterIndex < package.spine.count else { return }
            do {
                let attributed = try ChapterLoader.load(package.spine[chapterIndex], fontSize: fontSize)
                let pages = Paginator.paginate(attributed, containerSize: containerSize)
                buildSlides(from: pages, package: package)
                selectPage(nearestTo: highlight.rangeStart, in: pages)
            } catch {
                loadError = error.localizedDescription
            }
        } else {
            // Re-derive current pages to find the right one.
            let pages = slides.compactMap { slide -> PaginatedPage? in
                if case .content(let p, _) = slide { return p }
                return nil
            }
            selectPage(nearestTo: highlight.rangeStart, in: pages)
        }
        persistPosition()
    }

    private func persistPosition() {
        book.currentChapterIndex = chapterIndex
        book.currentCharOffset = currentChapterOffset()
        if let package, package.spine.count > 0 {
            let chapterFraction = Double(chapterIndex) / Double(package.spine.count)
            book.progressFraction = min(1, max(0, chapterFraction))
        }
        try? context.save()
    }

    func setFontSize(_ newSize: CGFloat) {
        fontSize = newSize
        AppSettings.shared.fontSize = Double(newSize)
        repaginateCurrentChapter(preserveOffset: true)
    }

    // MARK: - Highlights

    var chapterHighlights: [Highlight] {
        book.highlights.filter { $0.chapterIndex == chapterIndex }
    }

    func pageHighlights(for page: PaginatedPage) -> [PageHighlight] {
        let pageEnd = page.chapterOffsetStart + page.attributed.length
        return chapterHighlights.compactMap { h in
            let start = max(h.rangeStart, page.chapterOffsetStart)
            let end = min(h.rangeEnd, pageEnd)
            guard start < end else { return nil }
            return PageHighlight(highlight: h, localStart: start - page.chapterOffsetStart, localEnd: end - page.chapterOffsetStart)
        }
    }

    func requestHighlight(quotedText: String, surroundingParagraph: String, localRange: NSRange, page: PaginatedPage) {
        let start = page.chapterOffsetStart + localRange.location
        let end = start + localRange.length
        pendingSelection = PendingSelection(quotedText: quotedText, surroundingParagraph: surroundingParagraph, chapterRangeStart: start, chapterRangeEnd: end)
    }

    func confirmHighlight(color: HighlightColor) {
        guard let pending = pendingSelection, let package else { pendingSelection = nil; return }
        let highlight = Highlight(
            book: book,
            chapterIndex: chapterIndex,
            chapterHref: package.spine[chapterIndex].href,
            rangeStart: pending.chapterRangeStart,
            rangeEnd: pending.chapterRangeEnd,
            quotedText: pending.quotedText,
            surroundingParagraph: pending.surroundingParagraph,
            color: color
        )
        context.insert(highlight)
        try? context.save()
        pendingSelection = nil
        activeHighlight = highlight
        SupabaseHighlightSync.shared.enqueueUpsert(highlight)
    }

    func deleteHighlight(_ highlight: Highlight) {
        SupabaseHighlightSync.shared.enqueueDelete(id: highlight.id)
        book.highlights.removeAll { $0.id == highlight.id }
        context.delete(highlight)
        try? context.save()
        if activeHighlight?.id == highlight.id { activeHighlight = nil }
    }

    func setColor(_ color: HighlightColor, for highlight: Highlight) {
        highlight.color = color
        try? context.save()
        SupabaseHighlightSync.shared.enqueueUpsert(highlight)
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
