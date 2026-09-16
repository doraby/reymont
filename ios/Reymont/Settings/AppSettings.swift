import Foundation
import Combine

/// Reader-wide preferences. Font size and language are plain UserDefaults;
/// the OpenAI key (if the reader supplies their own instead of signing in)
/// lives in the Keychain.
@MainActor
final class AppSettings: ObservableObject {
    static let shared = AppSettings()

    @Published var fontSize: Double {
        didSet { UserDefaults.standard.set(fontSize, forKey: Keys.fontSize) }
    }
    @Published var targetLanguage: String {
        didSet { UserDefaults.standard.set(targetLanguage, forKey: Keys.language) }
    }
    @Published var openAIKey: String {
        didSet {
            if openAIKey.isEmpty { KeychainStore.remove(Keys.openAIKey) }
            else { KeychainStore.set(openAIKey, for: Keys.openAIKey) }
        }
    }

    static let availableLanguages = ["English", "Russian", "Polish", "Spanish", "French", "German", "Ukrainian"]

    private enum Keys {
        static let fontSize = "settings.fontSize"
        static let language = "settings.language"
        static let openAIKey = "settings.openAIKey"
    }

    private init() {
        let storedFontSize = UserDefaults.standard.object(forKey: Keys.fontSize) as? Double
        self.fontSize = storedFontSize ?? 19
        self.targetLanguage = UserDefaults.standard.string(forKey: Keys.language) ?? "English"
        self.openAIKey = KeychainStore.get(Keys.openAIKey) ?? ""
    }
}
