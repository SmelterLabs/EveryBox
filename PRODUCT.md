# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

EveryBox is a multi-platform commercial application that adapts its navigation, controls, and system integration to each operating system while sharing a single calm product model:
- **Windows desktop** (shipped incumbent — Electron + React 19 + TypeScript + local SQLite/FTS5).
- **Android** (next primary target — native Android / Material Design 3 structural conventions, touch ergonomics, edge-to-edge insets, and system Back behavior).
- **macOS desktop & iPhone (iOS)** (planned future expansion — honoring macOS desktop ergonomics and iOS HIG safe areas, edge-swipe Back, and Reduce Motion).

## Users

- **Primary users:** Busy individuals, founders, operators, consultants, and knowledge workers who juggle **multiple email accounts and calendars** across personal and work lives (for example, several Gmail accounts, custom-domain IMAP/SMTP mailboxes, and Microsoft 365 / Outlook calendars) and feel overwhelmed by context-switching across separate web tabs and noisy mail clients.
- **Usage situation:** High-frequency, Operate-mode daily triage — scanning incoming messages across accounts, focusing down to a single role or workspace (e.g., Work vs. Personal), checking the day's combined schedule, replying quickly without losing context, and clearing inbox clutter with zero friction.
- **Core jobs to be done:**
  1. See every inbox and every calendar in one calm place — and slice down to any single account or saved account group in one click or tap.
  2. Triage mail rapidly (People vs. Updates, one-by-one Triage mode, 1-click 2FA code copy, snooze, reminders, bulk actions) without accidentally losing messages or breaking server sync.
  3. Draft, summarize, and automate routine email handling using private, **$0 extra-cost AI** (local models, existing CLI subscriptions, or optional user-supplied API keys) without surrendering mailbox data to a mandatory paid cloud AI subscription.

## Product Purpose

EveryBox exists to replace fragmented, loud, subscription-bloated email and calendar workflows with **one calm, fast, privacy-respecting client** where every inbox and calendar lives together, multi-account focus is effortless, and AI stays strictly helpful, optional, and under the user's control.

Success for an end user means:
- Reaching clarity on what needs their attention today (Unread from People, Waiting on You, Today's combined schedule, active 2FA codes) within seconds of opening the app.
- Switching mental contexts cleanly between all accounts, a single account, or a saved Workspace across both Mail and Calendar simultaneously.
- Moving between desktop and mobile (starting with Android) with consistent account identity, reliable sync, offline resilience, and zero duplicate-event or phantom-email friction.

## Positioning

**"Every inbox and calendar in one calm app — with instant multi-account focus toggles and $0 extra-cost private AI."**

What neighboring email apps cannot truthfully copy as a single package:
- **Unified multi-account focus coupled across Mail and Calendar:** Toggling any single account, subset of accounts, or saved Workspace filters both the inbox and the combined calendar together — paired with optional cross-account duplicate-event merging and per-account visual identity (color, symbol, and row tint).
- **$0 extra-cost, bring-your-own private AI:** No mandatory AI upsell or forced cloud relay. Desktop supports local inference (Ollama, LM Studio, local OpenAI-compatible servers), existing CLI subscriptions (Claude CLI, Codex CLI), and optional BYO API keys, while remaining 100% functional with AI disabled.
- **Local-first speed and privacy:** Local SQLite + FTS5 full-text search, encrypted OS credential storage, tracker-pixel blocking, remote-image control, scam warnings, and a built-in read-only local MCP server on desktop.
- **Zero-migration friction for legacy and mixed providers:** Supports Gmail + two-way Google Calendar, universal IMAP/SMTP (with built-in local calendar + optional CalDAV / ICS feeds), `.ics` import/export, and Windows Classic Outlook COM import on desktop (with Microsoft Graph OAuth planned for cross-platform Microsoft 365 / Outlook.com support).

## Operating Context

- **Daily rituals:** Morning/midday Today Brief review ("Waiting on you", today's merged schedule, recent 2FA codes), focused single-account or Workspace sessions, rapid one-by-one Triage sessions, and quick-capture reminders tied to email threads ("in 2 days if no reply").
- **Environments:**
  - *Desktop (Windows today, macOS later):* Keyboard-driven and pointer-driven multi-pane workspace (resizable sidebar, message list, reading pane, optional right-hand AI Assistant panel, floating draggable Composer).
  - *Mobile (Android first, iOS later):* One-handed thumb triage on the move, OLED night reading, instant 2FA code notifications, lock-screen/quick-reply flows, offline/spotty-network resilience, and background sync under OS battery constraints (Android Doze / WorkManager).
- **Connected ecosystem:** Gmail API (OAuth2), IMAP/SMTP providers (with presets & custom hosts), Google Calendar, CalDAV, ICS feeds, Microsoft 365 / Outlook (Classic Outlook COM on Windows desktop; Microsoft Graph OAuth required for cross-platform/mobile), and local AI runtimes or optional desktop-companion pairing on mobile.

## Capabilities and Constraints

### Confirmed Capabilities (Incumbent Desktop Baseline)
- **Multi-account Mail:** Unified inbox + per-account folder trees, People / Updates / All classification, date grouping, 3 list densities (`compact`, `comfortable`, `expanded`), multi-select bulk actions, natural-language search + scoped account search, 1-click inline 2FA code extraction/copy, Undo Send with configurable countdown, scheduled send, snippets, rich-text Composer with continuous autosave, and full-window Triage mode.
- **Combined Calendar:** Day / Week / Month views obeying active account focus, cross-account duplicate event merging (`Merged` vs. `Raw`), two-way Google Calendar & CalDAV sync, local SQLite calendar for IMAP accounts, meeting link detection & 1-click Join, and `.ics` import/export.
- **Private AI & Autopilot:** Inline AI thread summaries, Background AI Pre-Drafts (with VIP "Always auto-draft" and muted-sender controls), learned Voice Profiles (Personal, Business, Customer, Colleague, Executive), plain-English Autopilot Rules with 1-click undo activity log, and an on-demand AI Assistant panel.
- **Privacy & Security:** Tracker blocking, remote-image blocking with trusted-sender allowlist, phishing/scam warning banners, OS-level encrypted secret storage (Windows DPAPI today; Android Keystore on Android), and optional local read-only MCP server with account/folder/sender privacy filters.
- **Appearance & Customization:** 5 EveryBox color themes (`dark`, `black`, `graphite`, `light`, `paper`), system-theme sync, 3 account row styles (`gradient`, `bar`, `dot`), 12 per-account symbols, customizable keyboard shortcuts, and optional familiar experience shells on desktop (`everybox`, `outlook-classic`, `gmail`).

### Durable Constraints
- **Public-app rule (non-negotiable):** Every feature, default, copy string, onboarding flow, and credential mechanism must be built for **any end user**. Never hardcode personal names, personal hardware specs, personal email addresses, personal file paths, or developer OAuth secrets.
- **Offline & sync integrity:** Local mutations (delete, archive, move, draft send) must never resurrect stale emails during concurrent background syncs; mobile must queue offline mutations cleanly and honor provider rate limits.
- **Zero forced AI cost:** AI features must degrade gracefully when unconfigured or offline, and mobile must provide realistic zero-extra-cost or BYO paths rather than assuming desktop-class local GPUs on a phone.
- **Platform honesty:** Mobile does not have Windows COM/MAPI; cross-platform Microsoft 365 / Outlook.com requires standard OAuth (Microsoft Graph) or IMAP/SMTP, and mobile UI must follow native OS conventions rather than shrinking the 3-pane desktop layout.

### Explicitly Undecided Product Facts *(open for future confirmation)*
- **Commercial pricing / distribution model:** Pricing tiers, trial terms, and Store listing copy (Microsoft Store, Google Play, Apple App Store) are not yet finalized.
- **Public OAuth & domain identity:** Final production domain (e.g., `everybox.app` / `geteverybox.com`), verified public Google Cloud OAuth client, and Microsoft Entra / Azure AD app registration are pending pre-launch.
- **Mobile companion sync vs. standalone-first scope:** Exact rollout phasing between standalone direct-sync mobile and optional encrypted desktop-companion AI pairing is being specified in the mobile architecture plan.
- **Desktop experience-shell parity on mobile:** Whether `outlook-classic` / `gmail` layout shells remain desktop-only (recommended: keep mobile strictly native EveryBox + Material 3 / HIG) is not yet formally ratified.

## Brand Commitments

- **Product name:** **EveryBox** (package/app ID `app.everybox.desktop` on Windows; mobile app ID to follow `app.everybox.*` convention).
- **Tagline / promise:** *"Every inbox and calendar in one calm place — with multi-account focus toggles and $0 extra-cost private AI."*
- **Brand mark (binding asset):** The **Nordic Prism** app icon (`build/icon.png`, `build/icon.ico`) — a dark midnight-slate rounded squircle with a cool blue rim highlight, holding three fanned inbox cards (soft lavender, mint teal, and cobalt blue envelope) nestled inside a frosted translucent glass pocket. It visually embodies multiple distinct accounts resting calmly in one unified vessel.
- **Voice & tone:** Calm, direct, pragmatic, and respectful of user attention. Short action labels ("Start triage", "All clear here", "Up to date", "Waiting on you"). Never hyperbolic, never nagging, never condescending about privacy or AI.

## Evidence on Hand

- **Working Windows desktop application:** This repository (Electron 35, React 19, TypeScript 5.7, Tailwind CSS v4, Zustand 5, local SQLite + FTS5) — full working implementation across Mail, Calendar, Triage, Autopilot, AI Assistant, Composer, and Settings.
- **Brand & visual assets:** `build/icon.png`, `build/icon.ico`, `src/renderer/src/assets/icon.png`, `src/renderer/src/styles/themes.css`, `src/renderer/src/components/AccountIcon.tsx`.
- **Product & technical documentation:** `AGENTS.md`, `TECHNICAL-GUIDE.md`, `USER-GUIDE.md`, `current-work.md`.
- **Absences future work must not fabricate:** No public customer testimonials, press quotes, benchmark scores, download counts, third-party security certifications, or published pricing exist yet. Do not invent them.

## Product Principles

1. **Calm clarity over chrome:** Every screen exists to help the user decide and act quickly. Keep surfaces quiet so real email content, account identity, and calendar time blocks carry the visual signal.
2. **Account focus is a first-class lens:** Switching between All Accounts, a single account, or a saved Workspace must be instant, obvious, and consistent across Mail, Search, and Combined Calendar.
3. **Private and $0-extra-cost by default:** Local-first storage, tracker blocking, encrypted OS secrets, and zero-mandatory-subscription AI are structural commitments, not marketing toggles.
4. **Reversible, forgiving triage:** Fast actions (send, archive, delete, Autopilot rules, draft close) pair with undo fuses, autosave, and non-destructive safeguards so users can move at high speed without anxiety.
5. **Native citizen on every OS:** Share the core product model, themes, and account identity across Windows, Android, macOS, and iOS — while respecting each platform's own navigation, gestures, touch targets, and system controls.

## Accessibility & Inclusion

- **Keyboard-first desktop navigation:** Full single-key and modifier shortcut system (`J`/`K`, `E`, `H`, `R`, `C`, `Ctrl+K`, customizable bindings), visible `2px` focus rings on all interactive controls, ARIA roles (`listbox`, `option`, `menu`, `menuitem`, `dialog`, `status`, `aria-live="polite"`), and per-pane zoom controls.
- **Mobile & cross-platform accessibility targets:** WCAG 2.1 AA contrast (`≥4.5:1` normal text, `≥3:1` large text and UI controls) across all 5 color themes, minimum `48×48 dp` touch targets with `≥8 dp` spacing on Android, scalable `sp` typography respecting system font scale (`1.3×`+ without truncation collapse), TalkBack / VoiceOver content descriptions, and reduced-motion fallbacks (`Remove animations` / `prefers-reduced-motion`).
- **Reading & visual comfort:** Five curated themes spanning crisp daylight (`light`), low-glare warm stone (`paper`), cool night slate (`dark`), medium-contrast charcoal (`graphite`), and true-black OLED (`black`), plus configurable list density and reader line-width modes.

---
*Note on provenance: Authored directly from confirmed repository evidence (`AGENTS.md`, `TECHNICAL-GUIDE.md`, `USER-GUIDE.md`, `package.json`, `src/shared/types.ts`, and renderer components) plus the multi-platform expansion brief (Android first, macOS & iOS later). Undecided commercial and rollout items are explicitly flagged above.*
