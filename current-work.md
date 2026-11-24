# EveryBox — Current Work

**Repo:** `C:\dev\EveryBox` (initialized on `main`, moved from scratch on 2026-11-23)
**User Data / SQLite DB:** `%APPDATA%\everybox\glassmail.sqlite` (already wired with Casey's personal `gws` Google Desktop OAuth client for personal testing)

## Completed
- Full Electron + Vite + React 19 + TypeScript + Tailwind v4 app shell with `node:sqlite` + FTS5 + Windows DPAPI (`safeStorage`)
- Multi-Gmail OAuth2 (Gmail API + Google Calendar API) & IMAP/SMTP (`imapflow` + `nodemailer`) + CalDAV/ICS (`tsdav` + `ical.js`)
- Multi-account focus toggles & Workspaces filtering both Mail and Combined Calendar together
- Full Glassmail-style UI (5 themes, Today Brief, Thread List w/ 2FA pills, Thread Reader, Full-Window Triage, Assistant, Combined Calendar, Subscriptions, Composer w/ Markdown + Snippets + Undo Send + Send Later, `Ctrl+K` Command Palette, Settings Modal)
- Hybrid AI layer (Ollama / LM Studio local RTX 5090 default, Claude/Codex CLI subscription bridge, optional API keys)
- Built-in read-only local MCP server (`out/main/mcp-server.js`)

## Next Up
- Connect Casey's real Gmail accounts + IMAP account in **Settings › Accounts** and verify live sync & calendar round-trip
- Configure preferred local Ollama model (or Claude CLI) in **Settings › AI** and test Assistant / Summarize / Voice-Matched Drafts on real threads
- Design custom EveryBox app icon & polish Windows packaging (`npm run package`)
- *(If shipping publicly later)*: Register `everybox.app` / `geteverybox.com` and create a dedicated Google Cloud OAuth client for EveryBox
