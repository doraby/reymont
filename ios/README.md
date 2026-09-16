# Reymont for iPhone

A native SwiftUI reader, built alongside (not instead of) the web app in the
repo root. Same books, same Supabase backend for sign-in/translation/
highlight sync — different interaction model, because a browser-based EPUB
reader can only get so close to how iOS actually wants to work.

Why this exists: on Android especially, the web reader's chrome (top/bottom
bars) has to fight the browser's own collapsing toolbars and viewport
resizing, which is exactly the kind of thing native UIKit/SwiftUI layout
doesn't have to work around at all. This app trades the single-HTML-file,
loads-anywhere convenience of the web version for real iOS text selection,
swipe paging, and toolbars that never move.

## What's different from the web app

- **Real swipe paging.** Pages turn with a native horizontal swipe
  (`TabView(.page)`), not a tap zone or a JS touch handler. Swiping past the
  last page of a chapter continues into the next one; swiping back from the
  first page returns to the end of the previous one.
- **Native text selection.** Selecting text uses iOS's own selection UI (the
  loupe, drag handles, the system edit menu) via `UITextView`, with a
  "Highlight" action added to that menu — not a custom-drawn selection layer.
- **Customizable highlight colors.** The web app has one fixed highlight
  color. Here you pick from a palette when you make a highlight, and can
  recolor it later.
- **Toolbars that don't move.** Top and bottom bars are laid out as normal
  siblings around the reading area (not floating/auto-hiding overlays), so
  they're always in the same place — no show/hide-on-scroll logic to get
  "weird" on any platform.

## Architecture

- **EPUB parsing** (`EPUB/`): unzips the `.epub` (ZIPFoundation) into
  `Caches/EPUBExtract/<bookId>/` once, then parses `container.xml`, the OPF
  (metadata/manifest/spine), and the TOC (EPUB3 `nav.xhtml` or EPUB2
  `toc.ncx`) straight off disk. Chapters are loaded with Apple's HTML→
  `NSAttributedString` importer and restyled to the app's serif reading
  theme (`ChapterLoader`).
- **Pagination** (`Reader/Paginator.swift`): classic TextKit pagination —
  lay a chapter's attributed text into a `NSTextContainer` sized to the
  reading area, take however much fits as one page, repeat with what's left.
- **Reading position & highlights**: this app does *not* use EPUB CFI (the
  web app's addressing scheme, tied to epub.js's DOM). It uses its own
  scheme — chapter index + character offset into that chapter's extracted
  text — which is simpler to reason about natively but isn't
  cross-readable with the web app's highlight positions (see below).
- **Data** (`Models/`): SwiftData (`Book`, `Highlight`). Local-first; nothing
  requires an account to read, highlight, or take notes.
- **Auth & AI** (`Auth/`, `AI/`, `Sync/`): talks to the *same* public
  Supabase project the web app uses (`onetabmtufauhulgjaxv`) — sign-in
  (email one-time code instead of a magic link, since a 6-digit code beats
  bouncing to Mail and back on a phone), the `ai` edge function for
  highlight translation, and a best-effort push of highlights to the shared
  `highlights` table.

## Known gaps vs. the web app (v1)

This is a first pass, scoped to prove out the native interaction model —
not full feature parity:

- **Cross-platform highlight sync is one-way and best-effort.** Highlights
  made in the app are pushed to Supabase (so they can sync across your own
  iOS devices) but the app doesn't yet pull/merge highlights made on the
  web, and — since this app doesn't compute EPUB CFI ranges — a highlight
  made here won't visually line up if the same book is opened in the web
  reader, or vice versa.
- **No Wikipedia card, web-search context, or AI illustrations** — the web
  app's "From the web" panel and cover/illustration generation aren't
  ported. Only the core translate-a-highlight flow is.
- **No in-app Stripe checkout.** Settings links out to the same Stripe
  payment link in Safari instead of an embedded flow.
- **Inline chapter images may not render.** Chapters are converted with
  Apple's HTML importer; most classic-text EPUBs are fine, but complex CSS
  layouts won't look like a real browser's rendering.
- Not compiled or run — see below.

## Building

This was written in a Linux container with no Xcode/macOS available, so it
has **not been compiled or run**. To build it:

1. Install [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`).
2. From `ios/`, run `xcodegen generate` — this reads `project.yml` and
   produces `Reymont.xcodeproj` (not checked in; XcodeGen output shouldn't
   be committed).
3. Open `Reymont.xcodeproj` in Xcode 15+, pick a run destination (iOS 17+),
   and build.
4. First launch seeds the library with the same three sample books from
   `../books/` (`chlopi.epub` and the two Bernays titles); use the **+**
   tile to import any other `.epub`.

Expect some amount of "first compile, fix the actual errors" — Swift/
SwiftUI/SwiftData APIs were used as documented, but nothing here has been
run against a real toolchain yet. `AppIcon.appiconset` currently reuses the
web app's 512×512 icon in the 1024×1024 slot — swap in a real 1024×1024 PNG
before shipping to the App Store.

## Backend

No new backend was stood up — this points at the same Supabase project
(`supabase/functions/ai`) already deployed for the web app. The anon key
baked into `Sync/SupabaseConfig.swift` is the same public, RLS-scoped key
already shipped in `index.html`.
