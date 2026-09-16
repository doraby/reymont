import SwiftUI

/// Shown for a highlight — right after creating one, or when tapping an
/// existing one in the text or in the highlights list. Lets the reader
/// re-color it, translate it, or delete it.
struct HighlightDetailView: View {
    @ObservedObject var viewModel: ReaderViewModel
    let highlight: Highlight
    @ObservedObject private var settings = AppSettings.shared

    @State private var translation: String = ""
    @State private var isTranslating = false
    @State private var translationError: String?
    @State private var translateTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(highlight.quotedText)
                    .font(Theme.serifBody.italic())
                    .foregroundStyle(Theme.text)
                    .padding(.leading, 12)
                    .overlay(alignment: .leading) {
                        Rectangle().fill(highlight.color.fill).frame(width: 3)
                    }

                VStack(alignment: .leading, spacing: 10) {
                    sectionTitle("Color")
                    HighlightColorPickerView(selected: highlight.color) { color in
                        viewModel.setColor(color, for: highlight)
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    sectionTitle("Translation")
                    if isTranslating && translation.isEmpty {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text("Translating…").font(Theme.serifCaption.italic()).foregroundStyle(Theme.muted)
                        }
                    } else if let translationError {
                        Text(translationError)
                            .font(Theme.serifCaption)
                            .foregroundStyle(Color(hex: 0xA03A20))
                    } else if !translation.isEmpty {
                        Text(translation).font(Theme.serifBody(ofSize: 16.5)).foregroundStyle(Theme.text)
                    } else {
                        Button {
                            runTranslation()
                        } label: {
                            Label("Translate into \(settings.targetLanguage)", systemImage: "sparkles")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Theme.accentSoft)
                    }
                }

                Button(role: .destructive) {
                    viewModel.deleteHighlight(highlight)
                } label: {
                    Label("Delete highlight", systemImage: "trash")
                }
                .padding(.top, 8)
            }
            .padding(22)
        }
        .background(Theme.surface.ignoresSafeArea())
        .onAppear {
            translation = highlight.translation ?? ""
            if translation.isEmpty { runTranslation() }
        }
        .onDisappear { translateTask?.cancel() }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11.5, weight: .semibold))
            .tracking(1.2)
            .foregroundStyle(Theme.accent)
    }

    private func runTranslation() {
        translateTask?.cancel()
        translationError = nil
        translation = ""
        isTranslating = true
        let words = highlight.quotedText.split(separator: " ").count
        translateTask = Task {
            do {
                for try await chunk in AIService.translate(
                    text: highlight.quotedText,
                    paragraph: highlight.surroundingParagraph,
                    targetLanguage: settings.targetLanguage,
                    isShort: words <= 4
                ) {
                    translation += chunk
                }
                isTranslating = false
                if !translation.isEmpty {
                    highlight.translation = translation
                    highlight.translationLanguage = settings.targetLanguage
                }
            } catch is CancellationError {
                isTranslating = false
            } catch {
                isTranslating = false
                translationError = error.localizedDescription
            }
        }
    }
}
