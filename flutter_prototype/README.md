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

```
cd flutter_prototype
flutter pub get
flutter run -d chrome     # or: flutter build web && serve build/web
```

Requires the Flutter SDK (this was built and tested against stable 3.35.5).
No Android/iOS toolchain needed for the web target used here.

## Design tokens

`lib/theme.dart` mirrors the same colors as the web app's CSS variables and
the SwiftUI prototype's `Theme.swift` — same cream/terracotta palette, same
six highlight colors — so this reads as the same product, not a fourth
design.
