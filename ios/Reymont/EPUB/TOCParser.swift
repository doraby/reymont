import Foundation

/// A TOC entry as read from nav.xhtml/NCX, before its href has been resolved
/// to a spine index (a TOC link can point at "chapter3.xhtml#section2" while
/// the spine only knows about "chapter3.xhtml").
struct RawTocEntry {
    let title: String
    let href: String
    let depth: Int
}

/// Parses an EPUB3 `nav.xhtml` navigation document, keeping only the links
/// inside the `epub:type="toc"` `<nav>` (a document can also carry landmarks
/// and page-list navs, which we ignore).
final class NavXHTMLParser: NSObject, XMLParserDelegate {
    private(set) var entries: [RawTocEntry] = []

    private var navDepth = 0
    private var tocNavDepth: Int?
    private var firstNavDepth: Int?
    private var olDepth = 0
    private var insideLink = false
    private var currentHref = ""
    private var currentText = ""

    func parse(data: Data) throws {
        let parser = XMLParser(data: data)
        parser.delegate = self
        parser.parse()
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        let local = OPFParser.localName(elementName)
        switch local {
        case "nav":
            navDepth += 1
            let type = attributeDict["epub:type"] ?? attributeDict["type"] ?? ""
            if type.contains("toc") {
                tocNavDepth = navDepth
            } else if firstNavDepth == nil {
                firstNavDepth = navDepth
            }
        case "ol":
            if isInsideTocNav { olDepth += 1 }
        case "a":
            if isInsideTocNav, let href = attributeDict["href"], !href.isEmpty {
                insideLink = true
                currentHref = href
                currentText = ""
            }
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if insideLink { currentText += string }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        let local = OPFParser.localName(elementName)
        switch local {
        case "nav":
            if tocNavDepth == navDepth { tocNavDepth = nil }
            navDepth -= 1
        case "ol":
            if isInsideTocNavForClosing { olDepth = max(0, olDepth - 1) }
        case "a":
            if insideLink {
                let text = currentText.trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty {
                    entries.append(RawTocEntry(title: text, href: currentHref, depth: max(0, olDepth - 1)))
                }
                insideLink = false
            }
        default:
            break
        }
    }

    /// Whether we're currently nested inside the TOC nav (falls back to the
    /// first `<nav>` seen if none declared `epub:type="toc"`).
    private var isInsideTocNav: Bool {
        if let tocNavDepth { return navDepth >= tocNavDepth }
        if tocNavDepth == nil, let firstNavDepth { return navDepth >= firstNavDepth }
        return false
    }
    /// Same check but evaluated on element close, after `navDepth` for a
    /// closing `<nav>` hasn't been decremented yet.
    private var isInsideTocNavForClosing: Bool { isInsideTocNav }
}

/// Parses an EPUB2 `toc.ncx` document (`navMap` → nested `navPoint`s).
final class NCXParser: NSObject, XMLParserDelegate {
    private(set) var entries: [RawTocEntry] = []

    private var depth = -1
    private var insideNavLabelText = false
    private var currentTitle = ""
    private var currentSrc = ""

    func parse(data: Data) throws {
        let parser = XMLParser(data: data)
        parser.delegate = self
        parser.parse()
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        let local = OPFParser.localName(elementName)
        switch local {
        case "navPoint":
            depth += 1
            currentTitle = ""
            currentSrc = ""
        case "text":
            insideNavLabelText = true
        case "content":
            if let src = attributeDict["src"] { currentSrc = src }
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if insideNavLabelText { currentTitle += string }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        let local = OPFParser.localName(elementName)
        switch local {
        case "text":
            insideNavLabelText = false
        case "navPoint":
            let title = currentTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            if !title.isEmpty, !currentSrc.isEmpty {
                entries.append(RawTocEntry(title: title, href: currentSrc, depth: max(0, depth)))
            }
            depth -= 1
        default:
            break
        }
    }
}
