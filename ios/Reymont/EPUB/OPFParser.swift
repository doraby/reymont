import Foundation

/// One `<manifest><item>` entry.
struct OPFManifestItem {
    let id: String
    let href: String
    let mediaType: String
    let properties: String
}

/// Parses the package (.opf) document: `dc:title`/`dc:creator`, the manifest
/// (id → href/media-type table) and the spine (reading order, by idref).
final class OPFParser: NSObject, XMLParserDelegate {
    private(set) var title: String = "Untitled"
    private(set) var author: String = ""
    private(set) var manifest: [String: OPFManifestItem] = [:]
    private(set) var spineIdrefs: [String] = []
    /// idref of the NCX manifest item, from `<spine toc="...">` (EPUB2).
    private(set) var ncxId: String?
    /// The manifest item id whose `content` a `<meta name="cover">` points at (EPUB2 cover convention).
    private(set) var coverMetaId: String?

    private var currentElementPath: [String] = []
    private var currentText = ""
    private var inMetadata = false

    func parse(data: Data) throws {
        let parser = XMLParser(data: data)
        parser.delegate = self
        if !parser.parse() {
            throw EPUBParseError.invalidOPF
        }
        if manifest.isEmpty || spineIdrefs.isEmpty {
            throw EPUBParseError.invalidOPF
        }
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        let local = Self.localName(elementName)
        currentElementPath.append(local)
        currentText = ""

        switch local {
        case "metadata":
            inMetadata = true
        case "item":
            guard let id = attributeDict["id"], let href = attributeDict["href"] else { return }
            manifest[id] = OPFManifestItem(
                id: id,
                href: href,
                mediaType: attributeDict["media-type"] ?? "",
                properties: attributeDict["properties"] ?? ""
            )
        case "itemref":
            if let idref = attributeDict["idref"] {
                spineIdrefs.append(idref)
            }
        case "spine":
            ncxId = attributeDict["toc"]
        case "meta":
            if inMetadata, attributeDict["name"] == "cover", let content = attributeDict["content"] {
                coverMetaId = content
            }
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        currentText += string
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        let local = Self.localName(elementName)
        let text = currentText.trimmingCharacters(in: .whitespacesAndNewlines)

        switch local {
        case "title":
            if inMetadata, !text.isEmpty { title = text }
        case "creator":
            if inMetadata, !text.isEmpty {
                author = author.isEmpty ? text : author + ", " + text
            }
        case "metadata":
            inMetadata = false
        default:
            break
        }

        currentText = ""
        if !currentElementPath.isEmpty { currentElementPath.removeLast() }
    }

    /// Strips a namespace prefix like "dc:title" → "title".
    static func localName(_ qualified: String) -> String {
        if let range = qualified.range(of: ":") {
            return String(qualified[range.upperBound...])
        }
        return qualified
    }
}
