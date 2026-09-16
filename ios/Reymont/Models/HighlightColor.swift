import SwiftUI
import UIKit

/// The palette a reader can choose from when marking a highlight.
/// Unlike the web app (a single fixed accent-orange highlight), the native
/// app lets each highlight carry its own color — tap a highlight to change it.
enum HighlightColor: String, CaseIterable, Codable, Identifiable {
    case amber
    case terracotta
    case sage
    case sky
    case lilac
    case rose

    var id: String { rawValue }

    var fill: Color {
        switch self {
        case .amber: return Color(hex: 0xE9C46A)
        case .terracotta: return Color(hex: 0xD97757)
        case .sage: return Color(hex: 0x8C9A6E)
        case .sky: return Color(hex: 0x7FA6C4)
        case .lilac: return Color(hex: 0xA88BC4)
        case .rose: return Color(hex: 0xD98098)
        }
    }

    var label: String {
        switch self {
        case .amber: return "Amber"
        case .terracotta: return "Terracotta"
        case .sage: return "Sage"
        case .sky: return "Sky"
        case .lilac: return "Lilac"
        case .rose: return "Rose"
        }
    }

    var uiColor: UIColor { UIColor(fill) }
}
