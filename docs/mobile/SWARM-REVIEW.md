# EveryBox Android — Swarm Audit, Impeccable Critique & Build-Readiness Sign-Off

**Method:** Hybrid verification — Impeccable Design Review + Native Android Audit (`critique-rubric.md`, `audit.native.md`, `android.md`, `craft-floor.md`) + Deterministic `impeccable detect --json` scan + Mathematical WCAG 2.1 AA contrast verification + Architecture stress-test across all 6 swarm deliverables.  
**Date:** 2026-11-26  
**Verdict:** **GO — BUILD READY (Phase 0 Approved)** — All P0 and P1 issues identified during the review loop were resolved and re-verified clean.

---

## 1. Executive Summary

The EveryBox Android planning and design swarm produced a cohesive, public-ready specification suite covering product strategy, design system tokens, native Android UX/UI, an interactive 4-screen HTML design board, and a concrete mobile engineering blueprint:

| Metric | Result | Status |
| :--- | :--- | :--- |
| **Public-App Compliance** | `0` personal names, hardware refs, real emails, local user paths, or secrets across all 6 files | **PASS** |
| **Cross-Doc Coherence** | `10 / 10` core product, token, nav, sync, gesture, and roadmap axes aligned after fix loop | **PASS** |
| **WCAG 2.1 AA Contrast (All 5 Themes)** | `0` failures (`85 / 85` foreground/surface pairs `>= 4.5:1` across `dark`, `black`, `graphite`, `light`, `paper`) | **PASS** |
| **Deterministic HTML Scan (`impeccable detect`)** | Exit code `0` — `0` errors, `0` warnings (down from `4` warnings in pass 1) | **PASS** |
| **Impeccable Context Health (`impeccable context`)** | `0` `CONTEXT_STALE` warnings; valid `schemaVersion: 2` `.impeccable/design.json` | **PASS** |
| **Impeccable Design Critique Score** | **35 / 40 (Good — top of band, pre-implementation spec ceiling)** | **PASS** |
| **Impeccable Native Android Audit Score** | **18 / 20 (Excellent — spec & preview readiness)** | **PASS** |
| **Open P0 / P1 Blockers** | **0 P0 / 0 P1** (`6` P1s and `3` P2s caught in pass 1 and verified fixed in pass 2) | **GO** |

---

## 2. Public-App Compliance Audit

Every deliverable (`PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `docs/mobile/ARCHITECTURE-PLAN.md`, `docs/mobile/ANDROID-DESIGN-SPEC.md`, `docs/mobile/screens-preview.html`) was scanned via case-insensitive pattern matching and manual inspection for:
- Personal names, family names, or employer/company names
- Personal workstation hardware names or GPUs
- Real email addresses, OAuth client secrets, or API keys
- Personal filesystem paths (`C:\Users\*`, local repo drive paths)

**Result:** **0 leaks.** All demo personas (`Alex Rivera`, `Maya Okafor`, `Devon Park`, `Priya Nair`, `Jordan Morales`) and demo domains (`northwind.co`, `foundry.studio`) are synthetic. Two literal workstation paths (`c:\dev\EveryBox` in `PRODUCT.md` and `ARCHITECTURE-PLAN.md`) were flagged in pass 1 and replaced with generic repository references in pass 2.

---

## 3. Cross-Doc Coherence Matrix & Fix-Loop Verification

### 3.1 Final Alignment Across All Deliverables

| Dimension | `PRODUCT.md` | `DESIGN.md` & `design.json` | `ANDROID-DESIGN-SPEC.md` | `screens-preview.html` | `ARCHITECTURE-PLAN.md` | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Platform Roadmap** | Adaptive: Windows → Android → macOS & iOS | Windows → Android M3 → macOS & iOS HIG | Android-first M3; desktop shells stay desktop-only | Android 390×844dp 4-screen board | Android first (RN/Expo+Kotlin) → Mac (Electron) → iOS (Swift module) | **Aligned** |
| **Compact Android Bottom Nav (4 Tabs)** | 3–4 native destinations | `Mail`, `Calendar`, `Brief`, `Search` | `Mail`, `Calendar`, `Brief`, `Search` | `Mail`, `Calendar`, `Brief`, `Search` | `(tabs)/index`, `calendar`, `brief`, `search` | **Aligned** |
| **Adaptive Breakpoints** | Phone / Foldable / Tablet | `<600dp` Bar / `600–839dp` Rail / `>=840dp` 2-pane | `<600dp` Bar / `600–839dp` Rail / `>=840dp` 2-pane | Compact 390×844dp frames | Foldable/Tablet adaptive 2-pane in Phase 4A | **Aligned** |
| **5 Curated Themes** | `dark`, `black`, `graphite`, `light`, `paper` | Exact 5-theme M3 table (0 AA fails) | Exact 5-theme M3 table (0 AA fails) | Live 5-theme switcher (exact hex parity) | Exported via `@everybox/shared/themes.ts` | **Aligned** |
| **Dynamic Color (Material You)** | Opt-in / secondary to account colors | Opt-in, **Off by default** | Opt-in, **Off by default** | Static Nordic Prism schemes | Matches `@everybox/shared` | **Aligned** |
| **Multi-Account Focus Coupling** | Coupled across Mail + Calendar | Single-focus suppression + 3 row styles | Sticky Focus Strip on Mail, Calendar & Brief | Synchronized `#focusStrip` + `#calFocusStrip` live filtering | `activeAccountIds: string[]` in `useMobileStore` | **Aligned** |
| **Account Visual Identity** | 10 swatches, 12 symbols, `gradient`/`bar`/`dot` | 10 swatches, 12 Lucide icons, OLED `14%` wash cap | 10 swatches, 12 icons, OLED `14%` wash cap | Live `Gradient`/`Bar`/`Dot` switcher, `14%` OLED wash | Shared `AccountIconId` & `AccountRowStyle` | **Aligned** |
| **Swipe Triage vs. Predictive Back** | Native OS Back honored | `>= 28dp` edge exclusion (`36dp` recommended) | `36dp` edge-safe gesture inset (`>= 28dp` floor) | Documented & footer-tagged (`36dp` inset) | `>= 28dp` (`36dp` recommended) in §5.3/Phase 1/§7 | **Aligned** |
| **Providers (No Windows COM on Mobile)** | Gmail, Graph OAuth, IMAP/CalDAV/ICS | N/A (UI layer) | Gmail PKCE, M365 Graph OAuth, IMAP presets | Synthetic Work/Studio/Personal accounts | Gmail PKCE, Graph Delta OAuth, Angus Mail IMAP, CalDAV/ICS | **Aligned** |
| **$0-Extra-Cost Private AI** | Local / Companion / BYO / graceful AI Off | AI Draft Ready card + Voice Profiles | 4-tier AI & Companion Pairing + graceful AI Off | AI Draft Ready + Voice pills + Composer tone chips | Tier 0 deterministic + Tiers 1–4 (Companion, AICore/GGUF, LAN, BYO) | **Aligned** |

### 3.2 Pass 1 → Pass 2 Fix-Loop Resolution Log

| ID | Owner | Severity | Issue Caught in Pass 1 | Resolution Verified in Pass 2 |
| :--- | :--- | :--- | :--- | :--- |
| **F1** | `@architect` | **P1** | Android 15 (API 35) enforces a hard 6-hour/24h rolling timeout on `foregroundServiceType="dataSync"`, risking `RemoteServiceException` crashes for all-day IMAP IDLE. | Scoped `dataSync` FGS to bounded sync bursts with mandatory `Service.onTimeout()` cleanup + fallback to 15-min `WorkManager`; documented `remoteMessaging` FGS evaluation (Play Console declaration) and elevated Phase 4 zero-knowledge FCM wake-up relay as the Play-Store-safe 24/7 push path. |
| **F2** | `@architect` | **P1** | Native Kotlin `WorkManager` opening `everybox.sqlite` via Android framework `SQLiteDatabase` risked FTS5 incompatibility/corruption against `expo-sqlite`'s bundled SQLite. | Explicitly forbade framework `SQLiteDatabase`; mandated a single bundled SQLite 3.46+ FTS5 binary (`io.requery:sqlite-android` → `net.zetetic:sqlcipher-android` in Phase 4), explicit canonical path `${context.filesDir}/SQLite/everybox.sqlite`, and lockstep `PRAGMA user_version` migrations. |
| **F3** | `@design-docs` | **P1** | `DESIGN.md` bottom nav listed `Inbox / Calendar / Brief / Autopilot or More`, conflicting with `ARCHITECTURE-PLAN.md` and `ANDROID-DESIGN-SPEC.md` (`Mail / Calendar / Brief / Search`). | Reconciled `DESIGN.md` (Layout, Navigation, Android §4) and `.impeccable/design.json` to the unified 4-tab topology (`Mail`, `Calendar`, `Brief`, `Search`). |
| **F4** | `@design-docs` | **P1** | `DESIGN.md` Android Token Mapping had 6 mathematical WCAG AA failures (`<4.5:1`: `light` success `#0d9488` at `3.40–3.74:1`, `graphite` muted `#8391a6` at `4.40:1`, elevated `error` on `graphite`/`light`/`paper` at `4.34–4.47:1`) and conflicted with `--accent-btn` `#2563eb`. | Unified `DESIGN.md` Android §1 with the AA-verified mobile tokens (`0` AA failures across all 5 themes, cross-theme `#2563eb`/`#ffffff` at `5.17:1`, `#7cb8ff` on dark tints, calibrated muted/error/success tokens, and OLED `0.12`/`0.18` borders). |
| **F5** | `@mobile-designer` | **P1** | `screens-preview.html` Frame 4 (Combined Calendar) omitted the Multi-Account Focus Pill Strip and did not filter when Inbox Focus Pills were tapped. | Added synchronized `#calFocusStrip` to Frame 4; tapping `All`/`Work`/`Studio`/`Personal` on either frame live-filters both Inbox threads and Calendar events (including All-Day strip and 3-Day view). |
| **F6** | `@mobile-designer` | **P1** | `screens-preview.html` emitted 4 `impeccable detect` warnings (`tiny-text` `11.5px` + 3× `nested-cards`) and rendered `36×36px` Star / `44px` icon buttons vs. its `>=48dp` footer claim. | Raised readable copy to `>=12px`, flattened `.ai-draft-band`/`.event-sheet`/`.phone-frame::before` (`impeccable detect` now exits `0` with `0` warnings), and enlarged `.icon-btn` (including Star) to `48×48px` and Join Meeting CTA to `46px`. |
| **F7–F9** | All 3 peers | **P2** | Minor coherence/hygiene: `24dp` vs. `28dp`/`36dp` edge exclusion (`ARCHITECTURE-PLAN.md`), `16%` vs. `14%` OLED wash (`ANDROID-DESIGN-SPEC.md`), literal `c:\dev\EveryBox` in `PRODUCT.md` & `ARCHITECTURE-PLAN.md`. | All three harmonized and verified clean (`>=28dp` / `36dp` recommended, `14%` OLED wash cap, zero local paths). |

---

## 4. Architecture Stress-Test (`docs/mobile/ARCHITECTURE-PLAN.md`)

Evaluated against real-world Android engineering failure modes for a commercial multi-account email + calendar client:

1. **Stack Selection (React Native New Arch + Expo SDK 53+ CNG + Kotlin `everybox-mail-native`):** **Strong & justified.** Avoids the two classic traps: (a) trying to run Node `imapflow`/`nodemailer` in Hermes or booting JS inside Android `WorkManager` (solved cleanly by putting Angus Mail + `WorkManager` + Keystore + Notifications in native Kotlin), and (b) abandoning ~45–55% shared TypeScript logic (`types`, `classifier`, `ics`, `presets`, `search-parser`, `themes`, React 19/Zustand mental model) or splitting Mac Desktop onto a separate codebase.
2. **Exchange / Microsoft 365 Without Windows COM:** **Pass.** Properly replaces Windows-only `outlook-local` COM with Entra ID OAuth 2.0 + PKCE (`common` tenant, Chrome Custom Tabs) + Microsoft Graph Delta queries + `inferenceClassification` Focused Inbox parity, and proactively flags enterprise tenant admin-consent friction + Microsoft Publisher Verification (MPN) + IMAP fallback.
3. **IMAP Background Sync & Android 15 Battery/Doze Limits:** **Pass (after F1 fix).** Honors the 15-min `WorkManager` periodic floor without booting JS, uses expedited outbox drain for sends, enforces persisted Gmail `429` backoff, handles Android 15 `dataSync` 6-hour `Service.onTimeout()` gracefully, and designates a Phase 4 zero-knowledge FCM push wake-up relay as the Play-Store-safe path to 24/7 instant push.
4. **Android Keystore & Device Security:** **Pass.** Correctly avoids deprecated `androidx.security:security-crypto` (`EncryptedSharedPreferences`) in favor of Google Tink AEAD (AES-256-GCM) backed by Android Keystore TEE/StrongBox + Jetpack DataStore, with `android:allowBackup="false"`, `data_extraction_rules.xml`, strict WebView CSP (`script-src 'none'`), and Phase 4 SQLCipher + `BiometricPrompt`.
5. **Offline Mutation Queue & Zombie-Email Race Guard:** **Pass (after F2 fix).** Upgrades desktop's in-memory 90s map to SQLite-persisted `mutation_guards` (`expires_at = NULL` while queued, stamped `+90s` on remote ack) + atomic single-transaction local optimism + strict FIFO drain-before-pull + single bundled SQLite 3.46+ FTS5 engine shared across JS and Kotlin. Includes an explicit **Zombie-Email Torture Test** (`am force-stop` in Airplane Mode) as a Phase 1 exit gate.
6. **Realistic $0-Extra-Cost Private AI on Phones:** **Pass.** Never assumes desktop GPUs or desktop CLI spawning on Android. Tier 0 deterministic intelligence runs at 0ms/$0; Tier 1 encrypted QR Companion Pairing (Noise_XX / mTLS) brings desktop-class local/CLI pre-drafts to mobile with near-zero battery drain; Tier 2 (AICore / Gemini Nano + opt-in foreground-only GGUF on `>=8GB` RAM), Tier 3 (self-hosted LAN/VPN), and Tier 4 (BYO keys) cover standalone users, with calm offline/AI-off degradation.
7. **Non-Breaking Monorepo Layout:** **Pass.** Root-preserving npm workspaces (`packages/shared` + `apps/mobile`, thin `src/shared/` shim, React 19 single-version alignment, existing `"files"` installer whitelist) keeps `npm run dev/typecheck/build/package/mcp` untouched.

*Remaining implementation watchouts (non-blocking, tracked for Phase 0–2):*
- Verify Node 24 vs. Node 22 LTS compatibility during Expo SDK 53+ prebuild (`npx expo prebuild`) on Windows; pin `.nvmrc` / Volta if any native RN Gradle script warns on Node 24.
- Begin Google OAuth restricted-scope CASA Tier 2 security assessment and Microsoft Publisher Verification early in Phase 2 so Play Store release in Phase 4 is not stalled by external review queues.

---

## 5. Impeccable Design Critique (`ANDROID-DESIGN-SPEC.md` & `screens-preview.html`)

### 5.1 Design Specificity Verdict
**LLM Assessment:** High product specificity — genuinely authored for EveryBox rather than a generic Gmail/Spark clone. EveryBox's two signature visual ideas — **peripheral multi-account identity** (coupled Focus Pill Strip + 3px inset rails + soft horizontal washes + 12-symbol `AccountBadge` + auto-suppression when soloed) and **calm, reversible Operate-mode triage** (Nordic Prism stepped tonal ladder, inline 2FA quick-copy pills, flattened AI Draft Ready band with learned Voice Profile pills, and the signature linear SVG Undo-Fuse Snackbar) — read unmistakably across all four screens while speaking fluent Material Design 3.

**Deterministic Scan (`impeccable detect --json` on `docs/mobile/screens-preview.html`):**
- **Errors:** `0` | **Warnings:** `0` (exit code `0`)
- **Advisories (`9` benign):** Phone hardware bezel radii (`28px`/`36px`), multi-account identity swatch colors (`#34C77B`, `#E87A48`), mobile-calibrated AA colors (`#7CB8FF`, `#8F9DB6`), and dense Operate-mode mobile type scale steps (`12.5px`, `18px`, `flat-type-hierarchy` where Operate-mode email headers intentionally avoid marketing-style display jumps). All advisories are verified intentional for a 390×844dp phone preview board.

### 5.2 Nielsen's 10 Usability Heuristics

| # | Heuristic | Score | Key Assessment |
| :---: | :--- | :---: | :--- |
| 1 | **Visibility of System Status** | **4 / 4** | Unread counts (`tabular-nums`), sync indicator, `Saved` autosave pill, `3 trackers blocked` shield, `Scheduled` banner, `Offline · N queued actions` pill, and animated linear `Undo Fuse` countdown make every state unambiguous. |
| 2 | **Match Between System & Real World** | **4 / 4** | Plain, calm Everyday language (`All clear here`, `Waiting on you`, `Merged`, `Quick reply to Maya…`, `Show all accounts`), familiar chronological date groups, and account labels (`Work`, `Studio`, `Personal`) instead of IMAP/protocol jargon. |
| 3 | **User Control and Freedom** | **4 / 4** | Predictive Back respected everywhere; `36dp` edge-safe swipe inset protects system Back; dirty drafts autosave silently on Back with `Discard` snackbar; `Undo` fuse on Send/Archive/Delete; `Revert` on AI tone rewrites; 1-tap `Show all accounts` reset. |
| 4 | **Consistency and Standards** | **4 / 4** | Strict Material 3 structural grammar (4-tab Bottom Bar, single Extended FAB, Modal Bottom Sheets, `48dp` targets, edge-to-edge insets) harmonized with EveryBox's 5 desktop themes and coupled Focus Strip across Mail and Calendar. |
| 5 | **Error Prevention** | **3 / 4** | Strong guardrails (3dp account hairline on Composer preventing wrong-account sends, invalid recipient chip highlight, 25MB attachment check, `Confirm before deleting` toggle, `mutation_guards`). *Minor gap:* No explicit "Missing attachment detector" when body says "attached" without a file (nice P3 addition during Phase 1). |
| 6 | **Recognition Rather Than Recall** | **4 / 4** | Visible coupled Focus Pills with colored icons, visible `All / People / Updates` filters, `Merged` badge with participating account dots, inline `482 917` 2FA copy pill, and labeled bottom nav destinations. |
| 7 | **Flexibility and Efficiency** | **4 / 4** | 1-tap solo focus + long-press multi-account focus + Workspaces sheet, configurable left/right swipe actions, 1-tap AI Draft Ready inline Send with Voice Profile pills, sticky Quick Reply bar, 1-tap 2FA copy, and 1-tap Join Meeting. |
| 8 | **Aesthetic and Minimalist Design** | **3 / 4** | Calm stepped tonal surfaces (`sidebar` → `list` → `main` → `elevated`), zero neon AI bloat, zero nested cards after pass 2. *Minor gap:* On compact 390dp screens, the Calendar frame stacks Top Bar + Focus Strip + Mode/Merge Bar + Week Strip + All-Day Strip (5 top bands before the timeline); in production, collapsing the Week Strip on scroll will preserve generous agenda breathing room. |
| 9 | **Error Recovery** | **3 / 4** | Non-blocking per-account auth/sync banners with `Sign in` / `Retry now`, graceful Companion-offline fallback preserving cached pre-drafts, and persistent outbox retry notifications. *Minor gap:* Ensure Phase 1 implements an explicit Outbox inspector view so a user can edit/cancel a permanently failed queued send (e.g., rejected recipient) without hunting in Drafts. |
| 10 | **Help and Documentation** | **2 / 4** | Onboarding + inline empty states + clear OEM battery/sync explanations are specified, and the UI is largely self-evident, though a lightweight Settings › Tips / Gestures cheat-sheet (explaining long-press multi-account focus and `36dp` interior swipe) is not yet explicitly itemized. |
| | **Total** | **35 / 40** | **Good (87.5% — top of Good band; pre-code ceiling before live device feel testing)** |

### 5.3 Cognitive Load Assessment (`critique-rubric.md`)
- **Single focus:** Pass — Each of the 4 screens has one clear primary job and at most 1 primary CTA / FAB.
- **Chunking (`<= 4` items/group):** Pass — 4 bottom nav destinations, 3 category tabs (`All`/`People`/`Updates`), 3–4 AI tone/voice pills.
- **Grouping:** Pass — Clear tonal separation and `1dp` hairlines separate chrome, filters, and content.
- **Visual hierarchy:** Pass — Weight-over-size unread contrast (`650`/`600` + cobalt dot) makes unread rows pop instantly without jitter.
- **One thing at a time:** Pass — Progressive disclosure via bottom sheets (`Move to Folder`, `Send From`, `Focus & Workspaces`, `Event Detail`).
- **Minimal choices (`<= 4` visible options per decision point):** Pass — Secondary actions cleanly tucked in overflow sheets.
- **Working memory:** Pass — Active account focus stays visibly pinned on Mail, Calendar, and Brief; `From` account hairline stays pinned in Composer.
- **Progressive disclosure:** Pass — Older thread messages collapse automatically; Cc/Bcc collapses until needed; AI UI hides cleanly when AI is Off.
- **Cognitive Load Score:** **0 / 8 failures (Low cognitive load — Good).**

### 5.4 Persona Red-Flag Walkthrough
- **Distracted Mobile User ("Sam/On-the-Go", one-handed thumb):** All primary actions (Bottom Nav, Compose FAB, Quick Reply bar, AI Draft Send, Join Meeting sheet, Focus Strip) sit cleanly in reach or require single taps; Undo Send fuse forgives thumb slips; offline queue preserves state across interruptions. *Watchout (P2):* Ensure the Calendar top chrome collapses smoothly on scroll so upcoming agenda cards stay in the thumb zone on smaller `360×780dp` phones.
- **Accessibility-Dependent User ("Sam", TalkBack & `font_scale = 1.3`):** Verified `0` WCAG AA contrast failures across all 5 themes (`>= 4.5:1`), `sp` typography ramp (`>= 11.5sp`), `48×48dp` targets, explicit TalkBack announcements in `ANDROID-DESIGN-SPEC.md` §4, and `Remove animations` fallback (`Undo (5s)`). *Watchout (P2):* In Phase 1, verify `Focus Strip` long-press multi-select has a non-gesture TalkBack custom action (`"Toggle in multi-account filter"`) in addition to the Workspaces sheet button.
- **Multi-Account Founder / Operator (derived from `PRODUCT.md` `## Users`):** Toggling `Work` vs. `Personal` across Mail and Calendar simultaneously, seeing `Work + Studio` merged calendar dots, and sending a voice-matched AI pre-draft from the correct `From` account (guaranteed by the 3dp top hairline) directly solve their core daily friction. *Watchout (P2):* Ensure the Settings › Swipe Gestures preview demonstrates the `36dp` interior swipe start visually during first run if a user tries swiping from the bezel edge.

---

## 6. Impeccable Native Android Audit (`audit.native.md` & `android.md`)

### 6.1 Audit Health Score

| # | Dimension | Score | Key Finding |
| :---: | :--- | :---: | :--- |
| 1 | **Accessibility (TalkBack & Contrast)** | **4 / 4** | `0` WCAG AA failures across all 5 themes (`85/85` pairs `>= 4.5:1`), `sp` scale tested against `font_scale=1.3` rule, `48×48dp` targets (`>=8dp` spacing), explicit TalkBack content descriptions, and `Remove animations` static `Undo (5s)` fallback. |
| 2 | **Performance** | **4 / 4** | New Architecture (Fabric/JSI) + `@shopify/flash-list` + UI-thread Reanimated/Gesture Handler swipe physics; native Kotlin `WorkManager` runs background sync without booting JS; cold-start `<1.5s` and FTS5 `<50ms` exit gates. |
| 3 | **Appearance & Theming** | **4 / 4** | All 5 hand-tuned Nordic Prism themes (`dark`, `black` true `#000000` OLED, `graphite`, `light`, `paper`) mapped to Material 3 color roles; Dynamic Color cleanly opt-in (default Off); OLED `black` guardrails (`14%` wash cap, `0.12`/`0.18` borders). |
| 4 | **Platform Conformance (CRITICAL)** | **3 / 4** | **PASSES the Android Slop Test:** Genuine Material 3 grammar (Bottom Nav → Rail → 2-pane, single Extended FAB, Modal Bottom Sheets, edge-to-edge `WindowInsets`, Predictive Back, `36dp` edge-safe swipe inset, `EXTRA_IS_SENSITIVE` 2FA clipboard masking, Android 15 FGS timeout handling). *Held at 3/4 only until verified on real Android hardware/emulator via `adb screencap` + `font_scale 1.3` in Phase 0.* |
| 5 | **Adaptivity** | **3 / 4** | Compact (`<600dp`), Medium (`600–839dp`), and Expanded (`>=840dp`) width classes plus `displayCutout` and `imePadding` are cleanly specified. *Held at 3/4 because foldable hinge posture (`WindowLayoutInfo`) and landscape phone ergonomics are slated for Phase 4A rather than Phase 0–1.* |
| | **Total** | **18 / 20** | **Excellent (Spec & Interactive Preview Readiness)** |

### 6.2 Platform Conformance Verdict
**PASS.** Both `ANDROID-DESIGN-SPEC.md` and `screens-preview.html` read unmistakably as a native Material Design 3 Android application — not a ported website or an iOS app wearing Material icons. Every Android-specific guardrail (Predictive Back coexistence, edge-to-edge insets, IME docking, Material 3 tonal surface stepping, single FAB discipline, Android 13+ `EXTRA_IS_SENSITIVE` 2FA masking, and Android 15 `dataSync` FGS quota safety) is explicitly engineered into both the design and architecture contracts.

---

## 7. Approved Deliverable Inventory & Phase 0 Kickoff Checklist

All deliverables are reconciled, verified, and approved for engineering handoff:

1. **Product Definition:** [`PRODUCT.md`](../../PRODUCT.md)
2. **Canonical Design System:** [`DESIGN.md`](../../DESIGN.md) & [`.impeccable/design.json`](../../.impeccable/design.json)
3. **Mobile Architecture & Build Plan:** [`docs/mobile/ARCHITECTURE-PLAN.md`](./ARCHITECTURE-PLAN.md)
4. **Android UX/UI Design Specification:** [`docs/mobile/ANDROID-DESIGN-SPEC.md`](./ANDROID-DESIGN-SPEC.md)
5. **Interactive 4-Screen Android Visual Board:** [`docs/mobile/screens-preview.html`](./screens-preview.html)
6. **Final Audit & Sign-Off Report:** [`docs/mobile/SWARM-REVIEW.md`](./SWARM-REVIEW.md) *(this document)*

### Ready-to-Execute Phase 0 Kickoff Steps
1. Install Temurin JDK 17 + Android SDK (API 35, `build-tools;35.0.0`, NDK) using the `winget`/`sdkmanager` commands in `ARCHITECTURE-PLAN.md` §2.
2. Add npm workspaces (`packages/shared` + `apps/mobile`) at repo root, extract `@everybox/shared` (leaving `src/shared/` shims), and verify desktop regression (`npm run typecheck && npm run build && npm run package`).
3. Scaffold `apps/mobile` (Expo SDK 53+ CNG, React 19, `everybox-mail-native` Kotlin stub, single bundled SQLite+FTS5 engine) and deploy the seeded 5-theme Inbox + coupled Focus Strip preview to an Android device via ADB.
4. Capture real-device verification screenshots (`adb exec-out screencap -p`) across `dark`, `black`, and `light` themes + `font_scale = 1.3` to confirm live hardware conformance.
