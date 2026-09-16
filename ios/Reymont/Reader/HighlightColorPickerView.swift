import SwiftUI

/// A row of color swatches — the "customizable highlights" picker. Used both
/// right after making a selection and to recolor an existing highlight.
struct HighlightColorPickerView: View {
    var selected: HighlightColor?
    let onPick: (HighlightColor) -> Void

    var body: some View {
        HStack(spacing: 16) {
            ForEach(HighlightColor.allCases) { color in
                Button {
                    onPick(color)
                } label: {
                    Circle()
                        .fill(color.fill)
                        .frame(width: 34, height: 34)
                        .overlay {
                            if selected == color {
                                Circle().strokeBorder(Theme.text, lineWidth: 2)
                                    .padding(-3)
                            }
                        }
                }
                .accessibilityLabel(color.label)
            }
        }
    }
}

/// Presented right after the user taps "Highlight" in the text selection
/// menu — pick a color to save it, or dismiss to cancel.
struct NewHighlightSheet: View {
    let quotedText: String
    let onPick: (HighlightColor) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 22) {
            Capsule().fill(Theme.border).frame(width: 36, height: 4).padding(.top, 10)
            Text(quotedText)
                .font(Theme.serifBody.italic())
                .foregroundStyle(Theme.text)
                .lineLimit(4)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)
            Text("Choose a highlight color")
                .font(.system(size: 12, weight: .semibold))
                .tracking(1)
                .foregroundStyle(Theme.muted)
            HighlightColorPickerView(selected: nil) { color in
                onPick(color)
                dismiss()
            }
            .padding(.bottom, 12)
        }
        .padding(.horizontal, 20)
        .presentationDetents([.height(220)])
        .presentationBackground(Theme.surface)
        .presentationDragIndicator(.hidden)
    }
}
