import SwiftUI

struct HighlightsListView: View {
    let book: Book
    let onSelect: (Highlight) -> Void

    private var highlights: [Highlight] {
        book.highlights.sorted { $0.createdAt > $1.createdAt }
    }

    var body: some View {
        NavigationStack {
            Group {
                if highlights.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "highlighter").font(.system(size: 30)).foregroundStyle(Theme.muted)
                        Text("Select text in the book to create a highlight.")
                            .font(Theme.serifSubheadline.italic())
                            .foregroundStyle(Theme.muted)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Theme.surface)
                } else {
                    List(highlights) { highlight in
                        Button {
                            onSelect(highlight)
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                RoundedRectangle(cornerRadius: 2).fill(highlight.color.fill).frame(width: 4)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(highlight.quotedText)
                                        .font(Theme.serifBody.italic())
                                        .foregroundStyle(Theme.text)
                                        .lineLimit(3)
                                    if let translation = highlight.translation, !translation.isEmpty {
                                        Text(translation)
                                            .font(Theme.serifCaption)
                                            .foregroundStyle(Theme.muted)
                                            .lineLimit(1)
                                    }
                                }
                            }
                        }
                        .listRowBackground(Theme.surface)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .background(Theme.surface)
                }
            }
            .navigationTitle("Highlights")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
