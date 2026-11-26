# EveryBox — Agent Instructions

## Purpose
EveryBox is a **public / commercial Windows desktop email and combined-calendar app** ("Every inbox and calendar in one calm Windows desktop app — with multi-account focus toggles and $0 extra-cost private AI").

## Public Repository Rules (Non-Negotiable)
- **Product only, nothing personal:** Every feature, UI string, default, fixture, doc, and commit message must be built for **any end user** who downloads and installs EveryBox. Never hardcode personal names, personal hardware, real email addresses, OAuth credentials, or local machine paths into tracked files.
- **Keep `AGENTS.md` canonical:** `CLAUDE.md` imports `@AGENTS.md`. Put durable architecture and decisions in `TECHNICAL-GUIDE.md` and user-facing docs in `USER-GUIDE.md`. Maintainer-specific notes, journals, and WIP trackers belong in gitignored `.local/` (never committed).

## Startup Reads
1. `.local/current-work.md` (if present) — local unfinished work and next steps
2. `TECHNICAL-GUIDE.md` — architecture, IPC, storage, build/run/package commands, and gotchas

## Commands
- `npm install` — install dependencies
- `npm run dev` — run Electron + Vite in dev mode
- `npm run typecheck` — TypeScript check (`tsconfig.node.json` + `tsconfig.web.json`)
- `npm run build` — production build to `out/`
- `npm run package` — build Windows NSIS installer & portable `.exe` (`dist/`)
- `npm run mcp` — run the built-in read-only local MCP server (`out/main/mcp-server.js`)
- `launch-everybox.bat` — launch the built Electron app on Windows

## Git, PRs & CI Workflow
- Public repository remote: `origin` → `https://github.com/SmelterLabs/EveryBox.git` (branch `main`).
- **Every change ships via a GitHub PR and syncs live to `origin/main`:**
  1. Create a feature/fix branch from latest `main` (`feat/...` or `fix/...`), commit cleanly, and push to `origin`.
  2. Run `npm run typecheck && npm run build` locally and verify the live app before merging.
  3. Open a GitHub PR with `gh pr create` and squash-merge immediately once local checks pass (do not block waiting on long CI jobs — GitHub Actions `ci` and `security` run asynchronously on `main` after merge).
  4. Bring local `main` to the tip (`git checkout main && git pull --ff-only origin main`) and restart the local Electron build so local and GitHub stay in lockstep.
- Never commit `%APPDATA%\everybox\`, SQLite files, `.env*`, `.local/`, `journal/`, or OAuth client secrets.
