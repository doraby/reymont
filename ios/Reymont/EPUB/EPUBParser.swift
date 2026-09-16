import Foundation
import ZIPFoundation
#if canImport(UIKit)
import UIKit
#endif

/// Reads container.xml/OPF/TOC/cover and unzips the .epub into a cache
/// directory so chapters can later be loaded straight from disk (which also
/// lets inline images/CSS referenced by relative paths resolve correctly).
enum EPUBParser {
    /// - Parameter cacheKey: a stable identifier (the Book's `id`) used to name
    ///   the extraction directory, so re-opening the same book reuses it.
    static func parse(fileURL: URL, cacheKey: String) throws -> EPUBPackage {
        let extractDir = try extractionDirectory(for: cacheKey)
        try extractIfNeeded(epubURL: fileURL, into: extractDir)

        let containerData = try Data(contentsOf: extractDir.appendingPathComponent("META-INF/container.xml"))
        let opfRelativePath = try parseContainer(data: containerData)
        let opfURL = extractDir.appendingPathComponent(opfRelativePath)
        let opfDirectory = opfURL.deletingLastPathComponent()

        let opfData = try Data(contentsOf: opfURL)
        let opf = OPFParser()
        try opf.parse(data: opfData)

        let spineChapters: [SpineChapter] = opf.spineIdrefs.compactMap { idref in
            guard let item = opf.manifest[idref] else { return nil }
            let url = opfDirectory.appendingPathComponent(item.href)
            return SpineChapter(href: item.href, fileURL: url)
        }
        guard !spineChapters.isEmpty else { throw EPUBParseError.noSpineItems }

        let hrefToSpineIndex: [String: Int] = Dictionary(
            spineChapters.enumerated().map { (normalizeHref($1.href), $0) },
            uniquingKeysWith: { first, _ in first }
        )

        let toc = resolveTOC(opf: opf, opfDirectory: opfDirectory, hrefToSpineIndex: hrefToSpineIndex, spineChapters: spineChapters)
        let cover = loadCoverImageData(opf: opf, opfDirectory: opfDirectory)

        return EPUBPackage(
            title: opf.title,
            author: opf.author,
            coverImageData: cover,
            spine: spineChapters,
            toc: toc,
            extractedDirectory: extractDir
        )
    }

    // MARK: - Extraction

    static func extractionDirectory(for cacheKey: String) throws -> URL {
        let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return caches.appendingPathComponent("EPUBExtract", isDirectory: true).appendingPathComponent(cacheKey, isDirectory: true)
    }

    private static func extractIfNeeded(epubURL: URL, into directory: URL) throws {
        let marker = directory.appendingPathComponent(".extracted")
        if FileManager.default.fileExists(atPath: marker.path) { return }

        if FileManager.default.fileExists(atPath: directory.path) {
            try? FileManager.default.removeItem(at: directory)
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try FileManager.default.unzipItem(at: epubURL, to: directory)
        try Data().write(to: marker)
    }

    // MARK: - container.xml

    private static func parseContainer(data: Data) throws -> String {
        let parser = ContainerParser()
        try parser.parse(data: data)
        guard let path = parser.fullPath else { throw EPUBParseError.missingOPF }
        return path
    }

    // MARK: - TOC

    private static func resolveTOC(opf: OPFParser, opfDirectory: URL, hrefToSpineIndex: [String: Int], spineChapters: [SpineChapter]) -> [TocEntry] {
        var raw: [RawTocEntry] = []

        if let navItem = opf.manifest.values.first(where: { $0.properties.contains("nav") }) {
            let navURL = opfDirectory.appendingPathComponent(navItem.href)
            if let data = try? Data(contentsOf: navURL) {
                let navParser = NavXHTMLParser()
                try? navParser.parse(data: data)
                raw = navParser.entries.map { entry in
                    // hrefs in nav.xhtml are relative to the nav file itself, not the OPF.
                    let resolved = resolveRelative(entry.href, against: navItem.href)
                    return RawTocEntry(title: entry.title, href: resolved, depth: entry.depth)
                }
            }
        }

        if raw.isEmpty, let ncxId = opf.ncxId, let ncxItem = opf.manifest[ncxId] {
            let ncxURL = opfDirectory.appendingPathComponent(ncxItem.href)
            if let data = try? Data(contentsOf: ncxURL) {
                let ncxParser = NCXParser()
                try? ncxParser.parse(data: data)
                raw = ncxParser.entries.map { entry in
                    let resolved = resolveRelative(entry.href, against: ncxItem.href)
                    return RawTocEntry(title: entry.title, href: resolved, depth: entry.depth)
                }
            }
        }

        var seenSpineIndices = Set<Int>()
        var result: [TocEntry] = []
        for entry in raw {
            guard let spineIndex = hrefToSpineIndex[normalizeHref(entry.href)] else { continue }
            // Collapse multiple sub-section links that land on the same spine
            // document down to its first (top-level) mention, since we can only
            // navigate to a whole chapter, not a mid-chapter anchor.
            if seenSpineIndices.contains(spineIndex) { continue }
            seenSpineIndices.insert(spineIndex)
            result.append(TocEntry(title: entry.title, spineIndex: spineIndex, depth: entry.depth))
        }

        if result.isEmpty {
            // Last resort: one TOC entry per spine chapter, unlabeled.
            result = spineChapters.enumerated().map { index, chapter in
                TocEntry(title: "Chapter \(index + 1)", spineIndex: index, depth: 0)
            }
        }
        return result
    }

    // MARK: - Cover

    private static func loadCoverImageData(opf: OPFParser, opfDirectory: URL) -> Data? {
        var candidate: OPFManifestItem?
        if let item = opf.manifest.values.first(where: { $0.properties.contains("cover-image") }) {
            candidate = item
        } else if let coverId = opf.coverMetaId, let item = opf.manifest[coverId] {
            candidate = item
        } else if let item = opf.manifest.values.first(where: { $0.id.lowercased().contains("cover") && $0.mediaType.hasPrefix("image/") }) {
            candidate = item
        }
        guard let item = candidate else { return nil }
        let url = opfDirectory.appendingPathComponent(item.href)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return downscaledThumbnail(from: data)
    }

    private static func downscaledThumbnail(from data: Data) -> Data? {
        #if canImport(UIKit)
        guard let image = UIImage(data: data) else { return data }
        let maxDimension: CGFloat = 640
        let scale = min(1, maxDimension / max(image.size.width, image.size.height))
        guard scale < 1 else { return image.jpegData(compressionQuality: 0.85) ?? data }
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        let resized = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
        return resized.jpegData(compressionQuality: 0.85) ?? data
        #else
        return data
        #endif
    }

    // MARK: - href helpers

    /// Drops any `#fragment` and percent-decodes so TOC links and manifest
    /// hrefs compare equal regardless of encoding quirks.
    private static func normalizeHref(_ href: String) -> String {
        let withoutFragment = href.split(separator: "#", maxSplits: 1).first.map(String.init) ?? href
        return withoutFragment.removingPercentEncoding ?? withoutFragment
    }

    /// Resolves `href` (found inside `basePath`'s document) into a path
    /// relative to the OPF directory, matching how manifest hrefs are stored.
    private static func resolveRelative(_ href: String, against basePath: String) -> String {
        if href.hasPrefix("/") { return href }
        var baseComponents = basePath.split(separator: "/").map(String.init)
        baseComponents.removeLast()
        var hrefComponents = href.split(separator: "/").map(String.init)
        while hrefComponents.first == ".." {
            hrefComponents.removeFirst()
            if !baseComponents.isEmpty { baseComponents.removeLast() }
        }
        return (baseComponents + hrefComponents).joined(separator: "/")
    }
}

/// Minimal parser for `META-INF/container.xml`, just enough to find the OPF path.
private final class ContainerParser: NSObject, XMLParserDelegate {
    private(set) var fullPath: String?

    func parse(data: Data) throws {
        let parser = XMLParser(data: data)
        parser.delegate = self
        if !parser.parse() { throw EPUBParseError.invalidContainer }
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        if OPFParser.localName(elementName) == "rootfile", fullPath == nil {
            fullPath = attributeDict["full-path"]
        }
    }
}
