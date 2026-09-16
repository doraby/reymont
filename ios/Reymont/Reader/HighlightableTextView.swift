import SwiftUI
import UIKit

/// A read-only `UITextView` that gives the reader real iOS text selection
/// (the system loupe, selection handles and edit menu) plus two custom
/// behaviors layered on top: a "Highlight" entry in the selection menu, and
/// tapping an already-highlighted span opens it instead of starting a new
/// selection.
struct HighlightableTextView: UIViewRepresentable {
    let attributed: NSAttributedString
    let highlights: [PageHighlight]
    let onRequestHighlight: (_ localRange: NSRange, _ text: String) -> Void
    let onTapHighlight: (Highlight) -> Void

    func makeUIView(context: Context) -> UITextView {
        let textView = UITextView()
        textView.isEditable = false
        textView.isSelectable = true
        textView.isScrollEnabled = false
        textView.backgroundColor = .clear
        textView.textContainerInset = .zero
        textView.textContainer.lineFragmentPadding = 0
        textView.delegate = context.coordinator
        textView.adjustsFontForContentSizeCategory = false

        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        tap.delegate = context.coordinator
        textView.addGestureRecognizer(tap)

        return textView
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        context.coordinator.onRequestHighlight = onRequestHighlight
        context.coordinator.onTapHighlight = onTapHighlight
        context.coordinator.pageHighlights = highlights

        // Re-applying identical content would reset the user's in-progress
        // selection every time some unrelated @Published property on the
        // view model changes (this view redraws whenever its owning page's
        // ReaderViewModel does). Only touch attributedText when it actually differs.
        let restyled = applyingHighlights(to: attributed)
        if uiView.attributedText == nil || !uiView.attributedText.isEqual(to: restyled) {
            uiView.attributedText = restyled
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    private func applyingHighlights(to base: NSAttributedString) -> NSAttributedString {
        guard !highlights.isEmpty else { return base }
        let mutable = NSMutableAttributedString(attributedString: base)
        let length = mutable.length
        for h in highlights {
            let start = max(0, h.localStart)
            let end = min(length, h.localEnd)
            guard start < end else { continue }
            mutable.addAttribute(.backgroundColor, value: h.highlight.color.uiColor.withAlphaComponent(0.55), range: NSRange(location: start, length: end - start))
        }
        return mutable
    }

    final class Coordinator: NSObject, UITextViewDelegate, UIGestureRecognizerDelegate {
        var onRequestHighlight: ((NSRange, String) -> Void)?
        var onTapHighlight: ((Highlight) -> Void)?
        var pageHighlights: [PageHighlight] = []

        func textView(_ textView: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
            guard range.length > 0, range.location != NSNotFound else {
                return UIMenu(children: suggestedActions)
            }
            let text = textView.textStorage.attributedSubstring(from: range).string
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return UIMenu(children: suggestedActions)
            }
            let highlightAction = UIAction(title: "Highlight", image: UIImage(systemName: "highlighter")) { [weak self] _ in
                self?.onRequestHighlight?(range, text)
            }
            return UIMenu(children: [highlightAction] + suggestedActions)
        }

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let textView = gesture.view as? UITextView, textView.selectedRange.length == 0 else { return }
            let point = gesture.location(in: textView)
            guard let position = textView.closestPosition(to: point) else { return }
            let index = textView.offset(from: textView.beginningOfDocument, to: position)
            if let hit = pageHighlights.first(where: { $0.contains(index) }) {
                onTapHighlight?(hit.highlight)
            }
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
            true
        }
    }
}
