# Current Work — EveryBox

## Optional Sync Cadence & IMAP IDLE Tuning (opened 2026-11-25)

Background polling currently runs every 45s with a 60s per-account cooldown (~60–90s effective cadence). Casey deferred tightening the poll interval (e.g., 30s or configurable setting) and adding IMAP IDLE live push for IMAP accounts until later.
- **Owner:** Casey (decide when/if wanted)
- **Done when:** Either implemented in `src/main/mail/sync-manager.ts` / `src/main/mail/imap-sync.ts` or explicitly dropped.
- **Pointers:** `src/main/mail/sync-manager.ts`, `src/main/mail/imap-sync.ts`

## Phase 2 — Public Account, Calendar & Release Readiness (opened 2026-11-23)

Remaining pre-launch roadmap items:
- Standalone calendars (Apple iCloud, CalDAV, subscribed `.ics` feeds decoupled from email accounts).
- Provider presets & auto-discovery in **Settings › Accounts** (iCloud, Fastmail, Yahoo, Zoho, Network Solutions, Custom IMAP).
- Sign in with Microsoft (OAuth2 for Outlook.com / Microsoft 365 Mail + Calendar).
- Verify Windows packaging (`npm run package`) with the Nordic Prism app icon (`build/icon.ico` & `build/icon.png`).
- *(Pre-public launch)*: Register domain (`everybox.app` / `geteverybox.com`) and create a dedicated verified Google Cloud OAuth client for EveryBox.
- **Owner:** Casey / future sessions
- **Done when:** Packaged Windows installer tested cleanly on a non-dev profile with public OAuth credentials.
- **Pointers:** `TECHNICAL-GUIDE.md`, `package.json`, `build/`
