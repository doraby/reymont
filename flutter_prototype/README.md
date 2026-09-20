# Reymont — Flutter reader prototype

A small, focused prototype answering one question: can Flutter give us real
swipe paging and fully customizable highlight colors — the two reasons for
building a separate mobile app at all — without the tradeoffs of the SwiftUI
attempt in `../ios/`?

This is **not** a rewrite of the app. It's one screen, real (public-domain)
text from `books/bernays-propaganda.epub`, no backend, no library, no auth.

## What's proven here

Unlike `../ios/` (written without access to Xcode/macOS, so never compiled),
this one **was actually built and driven end-to-end**: `flutter analyze`
clean, `flutter build web` succeeds, and it was exercised with real
synthesized touch/mouse events in a headless Chromium to confirm the
interactions genuinely work, not just that the code compiles.

- **Swipe paging** (`PageView`) — confirmed via touch-drag events; pages
  turn with a real horizontal swipe.
- **Gesture disambiguation** — a plain drag pages the book; a **long-press**
  starts text selection. This is the same split iOS itself uses, and
  Flutter reproduces it correctly out of the box once the browser context is
  told it's a touch device — no custom gesture-arena code needed.
- **Customizable highlight colors** — selecting text and confirming a color
  applies that exact color as a background span on just that text, and it
  persists across page navigation. Six-color palette, same as the SwiftUI
  prototype's.
- **Tap an existing highlight to reopen it** (recolor/delete) — wired via a
  `TapGestureRecognizer` per highlighted `TextSpan`.

## Known gaps / honesty notes

- **The system text-selection toolbar's "Highlight" button never showed up
  in headless-browser screenshots**, even though the code (`contextMenuBuilder`
  on `SelectableText`) is standard, documented Flutter API and `flutter
  analyze` is clean. This looks like a headless-Chromium-without-window-focus
  limitation (a known class of issue for OS-level selection UI under
  automation), not a bug in the app — but it means that one specific piece
  (the menu button itself, as opposed to the color-picker and highlight
  rendering it triggers) hasn't been visually confirmed. **Verify on a real
  device/browser before treating that piece as proven.** Every other
  interaction in the list above was directly observed working.
- Only one chapter's worth of hardcoded text, one screen, no persistence,
  no backend — this answers the interaction-feel question, nothing else.

## Running it

### On the web (quickest, but still inside a browser)

```
cd flutter_prototype
flutter pub get
flutter run -d chrome     # or: flutter build web && serve build/web
```

Good for a quick look, but it's still a page in a browser tab — browser
chrome (address bar, its own swipe-back/pull-to-refresh gestures) can get in
the way, which is exactly the category of problem a native app avoids. Open
the built `build/web` on an actual phone's browser (same network) to feel
the real touch gestures; a desktop mouse click-drag selects text instead of
paging, since Flutter treats mouse and touch input differently.

### As a real iOS app (the actual test — requires a Mac)

The `ios/` platform folder here was generated with `flutter create
--platforms=ios`, Flutter's own official scaffolding — unlike `../ios/`
(the SwiftUI attempt, hand-written without Xcode access), this one is a
real, tool-generated Xcode project.

1. On a Mac: install [Xcode](https://apps.apple.com/app/xcode/id497799835)
   and [CocoaPods](https://cocoapods.org) (`sudo gem install cocoapods`, or
   `brew install cocoapods`).
2. Install the [Flutter SDK](https://docs.flutter.dev/get-started/install/macos).
3. `cd flutter_prototype && flutter pub get`
4. Plug in an iPhone (or use a Simulator) and run `flutter devices` to
   confirm it's detected.
5. `flutter run -d <device-id>` — this builds the real `.app`, installs it,
   and launches it. First run also does `pod install` automatically.

This is the one that actually answers the original question: no browser
chrome at all, gestures go straight to the app, installed like any other
app on the phone.

## Design tokens

`lib/theme.dart` mirrors the same colors as the web app's CSS variables and
the SwiftUI prototype's `Theme.swift` — same cream/terracotta palette, same
six highlight colors — so this reads as the same product, not a fourth
design.
