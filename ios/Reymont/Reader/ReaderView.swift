import SwiftUI

struct ReaderView: View {
    let book: Book
    @Environment(\.modelContext) private var context
    @State private var viewModel: ReaderViewModel?

    var body: some View {
        Group {
            if let viewModel {
                ReaderContentView(viewModel: viewModel)
            } else {
                ZStack {
                    Theme.background.ignoresSafeArea()
                    ProgressView()
                }
            }
        }
        .task {
            guard viewModel == nil else { return }
            let vm = ReaderViewModel(book: book, context: context, fontSize: CGFloat(AppSettings.shared.fontSize))
            viewModel = vm
            await vm.start()
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

/// The reading area, topbar and bottombar are ordinary stacked siblings (not
/// floating overlays the way the web reader's chrome is) — so they always sit
/// in the same place and never need the show/hide-on-scroll logic that made
/// the web app's toolbar placement unreliable in mobile browsers.
private struct ReaderContentView: View {
    @ObservedObject var viewModel: ReaderViewModel
    @Environment(\.dismiss) private var dismiss

    private let horizontalMargin: CGFloat = 22
    private let verticalMargin: CGFloat = 18

    var body: some View {
        VStack(spacing: 0) {
            topBar
            readingArea
            bottomBar
        }
        .background(Theme.background.ignoresSafeArea())
        .sheet(isPresented: $viewModel.showingTOC) {
            TableOfContentsView(toc: viewModel.package?.toc ?? [], currentChapterIndex: viewModel.chapterIndex) { index in
                viewModel.jumpToChapter(index)
            }
        }
        .sheet(isPresented: $viewModel.showingHighlightsList) {
            HighlightsListView(book: viewModel.book) { highlight in
                viewModel.jumpToHighlight(highlight)
            }
        }
        .sheet(item: $viewModel.activeHighlight) { highlight in
            HighlightDetailView(viewModel: viewModel, highlight: highlight)
        }
        .sheet(isPresented: Binding(
            get: { viewModel.pendingSelection != nil },
            set: { if !$0 { viewModel.pendingSelection = nil } }
        )) {
            if let pending = viewModel.pendingSelection {
                NewHighlightSheet(quotedText: pending.quotedText) { color in
                    viewModel.confirmHighlight(color: color)
                }
            }
        }
        .alert("Couldn't open this book", isPresented: Binding(
            get: { viewModel.loadError != nil },
            set: { if !$0 { viewModel.loadError = nil } }
        )) {
            Button("OK", role: .cancel) { viewModel.loadError = nil }
        } message: {
            Text(viewModel.loadError ?? "")
        }
    }

    private var topBar: some View {
        HStack(spacing: 10) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 36, height: 36)
            }
            Text(viewModel.package?.title ?? viewModel.book.title)
                .font(Theme.serifSubheadline.italic())
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
            Button {
                viewModel.showingHighlightsList = true
            } label: {
                Image(systemName: "highlighter")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 36, height: 36)
            }
        }
        .padding(.horizontal, 10)
        .frame(height: 50)
        .background(Theme.surface)
        .overlay(alignment: .bottom) { Divider().background(Theme.border) }
    }

    private var readingArea: some View {
        GeometryReader { geo in
            TabView(selection: selectionBinding) {
                ForEach(Array(viewModel.slides.enumerated()), id: \.element.id) { index, slide in
                    PageContentView(slide: slide, viewModel: viewModel)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .onAppear { viewModel.containerSize = geo.size }
            .onChange(of: geo.size) { _, newSize in viewModel.containerSize = newSize }
        }
        .padding(.horizontal, horizontalMargin)
        .padding(.vertical, verticalMargin)
    }

    private var selectionBinding: Binding<Int> {
        Binding(
            get: { viewModel.selection },
            set: { newValue in
                viewModel.selection = newValue
                viewModel.selectionDidChange(to: newValue)
            }
        )
    }

    private var bottomBar: some View {
        HStack(spacing: 18) {
            Button {
                viewModel.showingTOC = true
            } label: {
                Image(systemName: "list.bullet")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.muted)
            }

            Text(progressLabel)
                .font(Theme.serifCaption.italic())
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 4) {
                Button {
                    viewModel.setFontSize(max(13, viewModel.fontSize - 1))
                } label: {
                    Text("A").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.muted)
                }
                Button {
                    viewModel.setFontSize(min(30, viewModel.fontSize + 1))
                } label: {
                    Text("A").font(.system(size: 19, weight: .semibold)).foregroundStyle(Theme.muted)
                }
            }
        }
        .padding(.horizontal, 18)
        .frame(height: 44)
        .background(Theme.surface)
        .overlay(alignment: .top) { Divider().background(Theme.border) }
    }

    private var progressLabel: String {
        guard let package, !package.spine.isEmpty else { return "" }
        let chapterTitle = package.toc.first(where: { $0.spineIndex == viewModel.chapterIndex })?.title
        let percent = Int((Double(viewModel.chapterIndex) / Double(package.spine.count) * 100).rounded())
        if let chapterTitle { return "\(chapterTitle) · \(percent)%" }
        return "\(percent)%"
    }

    private var package: EPUBPackage? { viewModel.package }
}
