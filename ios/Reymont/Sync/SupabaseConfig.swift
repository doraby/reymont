import Foundation

/// Same public project the web app (index.html) talks to — the anon key is
/// public by design (row-level security does the actual access control), so
/// reusing it here lets highlights and the AI translator work the same way
/// on both platforms without standing up a second backend.
enum SupabaseConfig {
    static let url = URL(string: "https://onetabmtufauhulgjaxv.supabase.co")!
    static let anonKey = "sb_publishable_mRBZJDQylQ5nifnkbsDTCw_QKHNLtj8"
    static let stripePaymentLink = "https://buy.stripe.com/8x2fZh4wO2R14lH3dHbwk01"
}
