# EveryBox — Agent Instructions

## Purpose
EveryBox is a **public / commercial Windows desktop email and combined-calendar app** ("Every inbox and calendar in one calm Windows desktop app — with multi-account focus toggles and $0 extra-cost private AI").

## Product Lens (Non-Negotiable)
- **Public-app rule:** Even when Casey is testing EveryBox with his own accounts, every feature, UI string, default, and workflow must be built for **any end user**. Never hardcode Casey's name, hardware (e.g. RTX 5090), email addresses, OAuth credentials, or personal paths into the codebase.
- **Keep `AGENTS.md` canonical:** `CLAUDE.md` imports `@AGENTS.md` and `@current-work.md`. Put durable architecture and decisions in `TECHNICAL-GUIDE.md`, user-facing docs in `USER-GUIDE.md`, unfinished work only in `current-work.md`, and dated completed history in `journal/YYYY-MM-DD.md`.

## Startup Reads
1. `current-work.md` — unfinished work, blockers, and next step
2. `TECHNICAL-GUIDE.md` — architecture, IPC, storage, build/run/package commands, and gotchas

## Commands
- `npm install` — install dependencies
- `npm run dev` — run Electron + Vite in dev mode
- `npm run typecheck` — TypeScript check (`tsconfig.node.json` + `tsconfig.web.json`)
- `npm run build` — production build to `out/`
- `npm run package` — build Windows NSIS installer & portable `.exe` (`dist/`)
- `npm run mcp` — run the built-in read-only local MCP server (`out/main/mcp-server.js`)
- `launch-everybox.bat` — launch the built Electron app on Windows

## Git & Remote
- Private development remote: `origin` → `https://github.com/SmelterLabs/EveryBox.git` (branch `main`).
- Never commit `%APPDATA%\everybox\`, SQLite files, `.env*`, or OAuth client secrets.
