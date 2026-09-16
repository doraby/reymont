import SwiftUI
import SwiftData
import UniformTypeIdentifiers
import UIKit

struct LibraryView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Book.addedAt, order: .reverse) private var books: [Book]

    @State private var showingImporter = false
    @State private var showingSettings = false
    @State private var openedBook: Book?
    @State private var importError: String?
    @State private var bookPendingDeletion: Book?

    private let columns = [GridItem(.adaptive(minimum: 140, maximum: 180), spacing: 24)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    header
                    LazyVGrid(columns: columns, spacing: 28) {
                        ForEach(books) { book in
                            BookCoverButton(book: book) { openedBook = book }
                                .contextMenu {
                                    Button(role: .destructive) {
                                        bookPendingDeletion = book
                                    } label: {
                                        Label("Remove from Library", systemImage: "trash")
                                    }
                                }
                        }
                        AddBookTile { showingImporter = true }
                    }
                }
                .padding(24)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationBarHidden(true)
            .navigationDestination(item: $openedBook) { book in
                ReaderView(book: book)
            }
            .fileImporter(isPresented: $showingImporter, allowedContentTypes: [epubType], allowsMultipleSelection: false) { result in
                handleImport(result)
            }
            .alert("Couldn't add book", isPresented: Binding(get: { importError != nil }, set: { if !$0 { importError = nil } })) {
                Button("OK", role: .cancel) { importError = nil }
            } message: {
                Text(importError ?? "")
            }
            .confirmationDialog(
                "Remove “\(bookPendingDeletion?.title ?? "")” and its highlights?",
                isPresented: Binding(get: { bookPendingDeletion != nil }, set: { if !$0 { bookPendingDeletion = nil } }),
                titleVisibility: .visible
            ) {
                Button("Remove", role: .destructive) {
                    if let book = bookPendingDeletion { BookImporter.delete(book, context: context) }
                    bookPendingDeletion = nil
                }
                Button("Cancel", role: .cancel) { bookPendingDeletion = nil }
            }
            .sheet(isPresented: $showingSettings) { SettingsView() }
            .task {
                BookImporter.seedSampleBooksIfNeeded(context: context)
            }
        }
        .tint(Theme.accentSoft)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Reymont").font(Theme.serifTitle).foregroundStyle(Theme.text)
                Text("Your library").font(Theme.serifSubheadline.italic()).foregroundStyle(Theme.muted)
            }
            Spacer()
            // Settings always lives in the same top-right spot, unlike the
            // web app's icon row which can reflow depending on sign-in state.
            Button {
                showingSettings = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 36, height: 36)
                    .background(Theme.surface2, in: Circle())
            }
        }
        .padding(.bottom, 12)
    }

    private var epubType: UTType {
        UTType(filenameExtension: "epub") ?? .data
    }

    private func handleImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            do {
                _ = try BookImporter.importFile(at: url, context: context)
            } catch {
                importError = error.localizedDescription
            }
        case .failure(let error):
            importError = error.localizedDescription
        }
    }
}

private struct BookCoverButton: View {
    let book: Book
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack(alignment: .bottom) {
                    cover
                    if book.progressFraction > 0.005 {
                        GeometryReader { proxy in
                            Rectangle()
                                .fill(Theme.accentSoft)
                                .frame(width: proxy.size.width * book.progressFraction, height: 3)
                        }
                        .frame(height: 3)
                    }
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(book.title)
                        .font(Theme.serifSubheadline.weight(.semibold))
                        .foregroundStyle(Theme.text)
                        .lineLimit(2)
                    if !book.author.isEmpty {
                        Text(book.author)
                            .font(Theme.serifCaption.italic())
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var cover: some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(LinearGradient(colors: [Color(hex: 0xCB8552), Color(hex: 0xA14D2B)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .aspectRatio(2.0/3.0, contentMode: .fit)
            .overlay {
                if let data = book.coverImageData, let uiImage = UIImage(data: data) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                } else {
                    Text(book.title)
                        .font(Theme.serifSubheadline.italic().weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(14)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .shadow(color: .black.opacity(0.18), radius: 8, y: 4)
    }
}

private struct AddBookTile: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(Theme.border, style: StrokeStyle(lineWidth: 1.5, dash: [5]))
                    .background(Theme.surface.clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous)))
                    .aspectRatio(2.0/3.0, contentMode: .fit)
                    .overlay {
                        Image(systemName: "plus")
                            .font(.system(size: 28, weight: .light))
                            .foregroundStyle(Theme.muted)
                    }
                Text("Add a book")
                    .font(Theme.serifSubheadline.weight(.semibold))
                    .foregroundStyle(Theme.muted)
            }
        }
        .buttonStyle(.plain)
    }
}
