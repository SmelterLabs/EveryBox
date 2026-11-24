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
  - `ai/` — Hybrid zero-extra-cost AI layer (`provider.ts`, `assistant.ts`, `summarizer.ts`, `writer.ts`, `nl-search.ts`): Ollama / LM Studio local inference, Claude/Codex CLI subscription bridge, optional API keys.
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

## Key Decisions & Trade-Offs
- **Local calendar enabled by default on IMAP accounts:** IMAP is email-only; many Windows users coming from Classic Outlook + IMAP (Network Solutions, GoDaddy, Namecheap, cPanel) store events in Outlook's local "Calendar (This computer only)" folder. EveryBox enables a local SQLite calendar by default for IMAP accounts, provides 1-click Classic Outlook COM import + universal `.ics` import/export, and keeps CalDAV/ICS feed URLs optional.
- **Deduplicated Outlook import:** Imported events use deterministic IDs (`${account.id}|local|outlook:${folderPath}|${uid}|${startAt}`) so users transitioning from Outlook can re-import without duplicates.
- **Public-app rule:** Zero hardcoded personal names, GPUs, or OAuth secrets in source code.

## Gotchas
- **Gmail OAuth:** Currently uses user-supplied Google OAuth Client ID/Secret in Settings › Accounts (stored in local settings). Before public launch, register a dedicated verified Google Cloud OAuth client for EveryBox.
- **Classic Outlook COM import:** Works with Classic Outlook Desktop on Windows (`Outlook.Application` MAPI COM). New Outlook (WebView2) and non-Windows platforms fall back cleanly to **Import .ics File**.
- **Launching GUI from headless agent shells on Windows:** Direct `Start-Process` from non-interactive terminals can spawn on a hidden desktop or exit with the shell; use a one-shot Interactive Scheduled Task when launching visibly for the user.
