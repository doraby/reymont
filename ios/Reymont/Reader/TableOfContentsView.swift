import SwiftUI

struct TableOfContentsView: View {
    let toc: [TocEntry]
    let currentChapterIndex: Int
    let onSelect: (Int) -> Void

    var body: some View {
        NavigationStack {
            List(toc) { entry in
                Button {
                    onSelect(entry.spineIndex)
                } label: {
                    HStack {
                        Text(entry.title)
                            .font(entry.spineIndex == currentChapterIndex ? Theme.serifBody.weight(.semibold) : Theme.serifBody)
                            .foregroundStyle(entry.spineIndex == currentChapterIndex ? Theme.accent : Theme.text)
                        Spacer()
                    }
                    .padding(.leading, CGFloat(entry.depth) * 16)
                }
                .listRowBackground(Theme.surface)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.surface)
            .navigationTitle("Contents")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
