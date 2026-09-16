import SwiftUI

/// Design tokens mirrored from the web app's `:root` CSS variables (index.html),
/// so the native app reads as the same product rather than a re-skin.
enum Theme {
    static let background = Color(hex: 0xF0EEE5)
    static let surface = Color(hex: 0xFAF9F4)
    static let surface2 = Color(hex: 0xE9E6DA)
    static let border = Color(hex: 0xDDD9C9)
    static let text = Color(hex: 0x3D3929)
    static let muted = Color(hex: 0x8A8778)
    static let accent = Color(hex: 0xC15F3C)
    static let accentSoft = Color(hex: 0xD97757)
    static let accentBackground = Color(hex: 0xD97757).opacity(0.10)

    static let serifTitle = Font.system(.title, design: .serif).weight(.semibold)
    static let serifHeadline = Font.system(.headline, design: .serif)
    static let serifBody = Font.system(.body, design: .serif)
    static let serifSubheadline = Font.system(.subheadline, design: .serif)
    static let serifCaption = Font.system(.caption, design: .serif)

    static func serifBody(ofSize size: CGFloat) -> Font {
        .system(size: size, weight: .regular, design: .serif)
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}
