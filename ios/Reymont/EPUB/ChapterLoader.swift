import Foundation
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Converts a chapter's XHTML into an `NSAttributedString`, styled to match
/// the app's reading theme. Apple's HTML importer is WebKit-backed and must
/// only be driven from the main thread, so every call here does too.
@MainActor
enum ChapterLoader {
    static func load(_ chapter: SpineChapter, fontSize: CGFloat) throws -> NSAttributedString {
        let data = try Data(contentsOf: chapter.fileURL)
        let options: [NSAttributedString.DocumentReadingOptionKey: Any] = [
            .documentType: NSAttributedString.DocumentType.html,
            .characterEncoding: String.Encoding.utf8.rawValue,
            .baseURL: chapter.fileURL.deletingLastPathComponent(),
        ]
        let raw = try NSAttributedString(data: data, options: options, documentAttributes: nil)
        return restyle(raw, fontSize: fontSize)
    }

    /// The HTML importer brings its own (usually sans-serif, black-on-white)
    /// fonts and colors along with each paragraph's structure. We keep the
    /// structure (paragraph spacing, bold/italic, headings) but repaint every
    /// run with the app's serif reading theme.
    private static func restyle(_ input: NSAttributedString, fontSize: CGFloat) -> NSAttributedString {
        let result = NSMutableAttributedString(attributedString: input)
        let fullRange = NSRange(location: 0, length: result.length)
        let textColor = UIColor(Theme.text)

        result.beginEditing()
        result.enumerateAttribute(.font, in: fullRange, options: []) { value, range, _ in
            let sourceFont = value as? UIFont
            let isBold = sourceFont?.fontDescriptor.symbolicTraits.contains(.traitBold) ?? false
            let isItalic = sourceFont?.fontDescriptor.symbolicTraits.contains(.traitItalic) ?? false
            // Headings in HTML come through noticeably larger than body text;
            // keep that relative size bump, scaled to the reader's chosen size.
            let sourcePointSize = sourceFont?.pointSize ?? 17
            let relativeScale = sourcePointSize / 17
            let scaledSize = max(fontSize, fontSize * min(relativeScale, 2.2))

            var descriptor = UIFontDescriptor.preferredFontDescriptor(withTextStyle: .body)
                .withDesign(.serif) ?? UIFontDescriptor.preferredFontDescriptor(withTextStyle: .body)
            var traits: UIFontDescriptor.SymbolicTraits = []
            if isBold { traits.insert(.traitBold) }
            if isItalic { traits.insert(.traitItalic) }
            if !traits.isEmpty, let withTraits = descriptor.withSymbolicTraits(traits) {
                descriptor = withTraits
            }
            let font = UIFont(descriptor: descriptor, size: scaledSize)
            result.addAttribute(.font, value: font, range: range)
        }
        result.addAttribute(.foregroundColor, value: textColor, range: fullRange)

        result.enumerateAttribute(.paragraphStyle, in: fullRange, options: []) { value, range, _ in
            let style = (value as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle ?? NSMutableParagraphStyle()
            style.lineSpacing = fontSize * 0.28
            style.paragraphSpacing = fontSize * 0.9
            result.addAttribute(.paragraphStyle, value: style, range: range)
        }
        result.endEditing()
        return result
    }
}
