import SwiftUI

struct SettingsView: View {
    @ObservedObject private var settings = AppSettings.shared
    @ObservedObject private var auth = SupabaseAuthService.shared
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var code = ""
    @State private var codeSent = false
    @State private var showKey = false

    var body: some View {
        NavigationStack {
            Form {
                accountSection
                Section("Translation language") {
                    Picker("Language", selection: $settings.targetLanguage) {
                        ForEach(AppSettings.availableLanguages, id: \.self) { Text($0) }
                    }
                    .pickerStyle(.menu)
                }
                Section {
                    HStack {
                        Text("Font size")
                        Spacer()
                        Stepper(value: $settings.fontSize, in: 13...30, step: 1) {
                            Text("\(Int(settings.fontSize)) pt").foregroundStyle(Theme.muted)
                        }
                    }
                } header: {
                    Text("Reading")
                }
                Section {
                    HStack {
                        if showKey { TextField("sk-...", text: $settings.openAIKey) }
                        else { SecureField("sk-...", text: $settings.openAIKey) }
                        Button { showKey.toggle() } label: {
                            Image(systemName: showKey ? "eye.slash" : "eye").foregroundStyle(Theme.muted)
                        }
                    }
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                } header: {
                    Text("Your own OpenAI key (optional)")
                } footer: {
                    Text("Skip signing in and translate using your own key instead. Stored securely on this device only.")
                }
                Section {
                    Link(destination: URL(string: SupabaseConfig.stripePaymentLink)!) {
                        Label("Reymont Premium", systemImage: "sparkles")
                    }
                } footer: {
                    Text("Free plan: 10 AI-translated highlights. Premium removes the limit.")
                }
                Section {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0").foregroundStyle(Theme.muted)
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .tint(Theme.accentSoft)
    }

    @ViewBuilder private var accountSection: some View {
        Section {
            if let userEmail = auth.userEmail {
                HStack {
                    Text(userEmail)
                    Spacer()
                    Button("Sign out", role: .destructive) { auth.signOut() }
                }
            } else if codeSent {
                TextField("6-digit code", text: $code)
                    .keyboardType(.numberPad)
                Button {
                    Task {
                        if await auth.verifyCode(email: email, code: code) { code = ""; codeSent = false }
                    }
                } label: {
                    if auth.isVerifying { ProgressView() } else { Text("Verify") }
                }
                Button("Send a new code") {
                    Task { await auth.sendCode(email: email) }
                }
            } else {
                TextField("you@example.com", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button {
                    Task {
                        await auth.sendCode(email: email)
                        if auth.lastError == nil { codeSent = true }
                    }
                } label: {
                    if auth.isSendingCode { ProgressView() } else { Text("Sign in with email") }
                }
                .disabled(email.isEmpty)
            }
            if let error = auth.lastError {
                Text(error).font(.footnote).foregroundStyle(Color(hex: 0xA03A20))
            }
        } header: {
            Text("Account")
        } footer: {
            Text("Sign in to sync highlights and translate without your own key. We'll email you a one-time code — no password.")
        }
    }
}
