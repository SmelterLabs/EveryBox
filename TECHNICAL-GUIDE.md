# EveryBox — Technical Guide

## Overview
EveryBox is an Electron + Vite + React 19 + TypeScript + Tailwind v4 desktop email and combined-calendar application for Windows, built for public/commercial distribution.

## Architecture
- **Main process (`src/main/`):**
  - `index.ts` — Electron lifecycle, window creation, IPC handlers, background sync loop.
  - `db/database.ts` — Local SQLite via built-in `node:sqlite` + FTS5 full-text search. Database lives at `%APPDATA%\everybox\glassmail.sqlite`.
  - `db/seed.ts` — Demo data seeded on first run when no accounts exist (cleared when a real account is connected).
  - `security/secrets.ts` — Windows DPAPI encryption via Electron `safeStorage` (`secrets.dpapi.json`).
  - `mail/` — Multi-Gmail OAuth2 (`gmail-oauth.ts`, `gmail-sync.ts`), IMAP/SMTP (`imap-sync.ts` via `imapflow` + `nodemailer`), `sync-manager.ts`, `classifier.ts` (People vs. Updates, 2FA code extraction, scam/tracker checks).
  - `calendar/` — `calendar-manager.ts` (unified coordinator), `google-calendar.ts` (two-way Google Calendar API), `caldav-sync.ts` (two-way CalDAV via `tsdav`, read-only ICS feeds, recurring ICS parsing via `ical.js`, RFC 5545 `.ics` export, meeting URL extraction), `outlook-import.ts` (Windows Classic Outlook COM/MAPI calendar discovery & deduplicated import via PowerShell `-EncodedCommand`).
  - `ai/` — Dual-tier zero-extra-cost AI layer:
    - **Writing & Assistant tier:** `provider.ts`, `assistant.ts`, `summarizer.ts`, `writer.ts`, `nl-search.ts`, `autopilot.ts` (Ollama / LM Studio / local OpenAI-compatible servers, Claude/Codex/Antigravity CLI subscription bridges, optional cloud API keys).
    - **Decision AI & background triage tier:** `decisions.ts` (fast structured classification across Jev / Gemini / OpenAI / OpenRouter / local fast models), `triage-worker.ts` (debounced Tier-0 fast-reject + Tier-1 background classifier triggered after sync and at startup, persisted in SQLite `thread_ai_meta`), and `extract-event.ts` (Tier-1B conditional extractor for implicit calendar events).
  - `updater.ts` — Lightweight GitHub Releases update checker (`checkForAppUpdates`) querying `SmelterLabs/EveryBox` latest release with semver comparison and 6s timeout, exposed via `app:getVersion` and `app:checkForUpdates` IPC.
  - `mcp/server.ts` — Built-in read-only local MCP server compiled to `out/main/mcp-server.js`.
- **Preload (`src/preload/index.ts`):** Exposes typed `window.glassmail` API via `contextBridge`.
- **Renderer (`src/renderer/src/`):** React 19 + Zustand (`store/useAppStore.ts`) + Tailwind v4 + 5 CSS variable themes (`styles/themes.css`).
- **Shared types (`src/shared/types.ts`):** Canonical interfaces shared across main, preload, and renderer.

## Build, Run & Package
```powershell
npm install
npm run typecheck   # tsc --noEmit on node + web tsconfigs
npm run build       # electron-vite build -> out/
npm run dev         # electron-vite dev
npm run package     # electron-builder --win -> dist/
```
To launch the built app directly on Windows, run `launch-everybox.bat` (or `.\node_modules\electron\dist\electron.exe .`).

## Releases & In-App Update Checker
- Pushing a version tag (`git tag v0.2.0 && git push origin v0.2.0`) triggers `.github/workflows/release.yml` on `windows-latest` (Node 22), which runs `npm ci`, `npm run typecheck`, `npm run package`, and publishes the NSIS installer and portable `.exe` (`dist/*.exe`) to a GitHub Release with auto-generated notes.
- In-app updates (`src/main/updater.ts`) run a quiet background check ~10 seconds after startup and on demand from **Settings › Check for Updates**. When a newer semver release is found, EveryBox shows a calm download link opening the GitHub Release page in the user's browser; `404` (no releases published yet) is treated cleanly as up to date.

## Key Decisions & Trade-Offs
- **Gmail incremental sync & persisted rate-limit backoff:** Gmail accounts sync incrementally via `users.history.list` using `accounts.gmail_history_id` (2 quota units when idle instead of re-downloading ~145 full messages every minute). Full/initial syncs and label syncs skip `remoteId`s already cached in SQLite, propagate API errors instead of wiping local folders, and persist `sync_backoff_until` / `sync_consecutive_errors` in SQLite so Google `429`/`403` `Retry-After` lockouts are honored across polls and restarts.
- **Local calendar enabled by default on IMAP accounts:** IMAP is email-only; many Windows users coming from Classic Outlook + IMAP (Network Solutions, GoDaddy, Namecheap, cPanel) store events in Outlook's local "Calendar (This computer only)" folder. EveryBox enables a local SQLite calendar by default for IMAP accounts, provides 1-click Classic Outlook COM import + universal `.ics` import/export, and keeps CalDAV/ICS feed URLs optional.
- **Deduplicated Outlook import:** Imported events use deterministic IDs (`${account.id}|local|outlook:${folderPath}|${uid}|${startAt}`) so users transitioning from Outlook can re-import without duplicates.
- **Public-app rule:** Zero hardcoded personal names, GPUs, or OAuth secrets in source code.

## Gotchas
- **Gmail OAuth:** Currently uses user-supplied Google OAuth Client ID/Secret in Settings › Accounts (stored in local settings). Before public launch, register a dedicated verified Google Cloud OAuth client for EveryBox.
- **Classic Outlook COM import:** Works with Classic Outlook Desktop on Windows (`Outlook.Application` MAPI COM). New Outlook (WebView2) and non-Windows platforms fall back cleanly to **Import .ics File**.
- **Launching GUI from headless agent shells on Windows:** Direct `Start-Process` from non-interactive terminals can spawn on a hidden desktop or exit with the shell; use a one-shot Interactive Scheduled Task when launching visibly for the user.
