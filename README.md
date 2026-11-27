<div align="center">
  <img src="build/icon.png" alt="EveryBox Logo" width="96" height="96" />
  <h1>EveryBox</h1>
  <p><strong>Every inbox and calendar in one calm Windows desktop app — with multi-account focus toggles, private local AI, and a built-in MCP server.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?style=flat-square&logo=windows" alt="Windows" />
    <img src="https://img.shields.io/badge/Stack-Electron%20%2B%20React%2019%20%2B%20TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="Tech Stack" />
    <img src="https://img.shields.io/badge/Storage-Local%20SQLite%20%2B%20DPAPI-0F766E?style=flat-square" alt="Local-First" />
    <img src="https://img.shields.io/badge/AI-Local%20%2F%20CLI%20Subscriptions%20%2F%20BYOK-6D28D9?style=flat-square" alt="Private AI" />
    <img src="https://img.shields.io/badge/Agents-Built--in%20MCP%20Server-111827?style=flat-square" alt="MCP Server" />
    <a href="https://github.com/SmelterLabs/EveryBox/actions/workflows/ci.yml"><img src="https://github.com/SmelterLabs/EveryBox/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  </p>
</div>

---

## Why EveryBox?

Most modern email apps force an ugly trade-off: **pay \$20–\$40/month** to hand your entire mailbox to a third-party AI cloud, **fight browser tabs** across 5 different accounts, or **put up with sluggish web-wrapped clients** like New Outlook.

**EveryBox takes a different path:**

- **One Calm Workspace for Every Hat You Wear** — Combine multiple Gmail and IMAP/SMTP accounts alongside a unified calendar, then filter *both* mail and calendar together with 1-click account toggles and `Ctrl+1..9` Workspaces.
- **Private AI Without a Monthly AI Tax** — Run AI triage, thread summaries, natural-language search, and voice-matched drafts directly on your own PC via **Ollama / LM Studio / local OpenAI-compatible servers**, connect your existing **Claude CLI / Codex CLI / Antigravity CLI subscriptions** so you aren't double-paying for AI, or plug in your own API keys (Anthropic, Gemini, OpenAI, Grok). Zero third-party cloud mail proxy sits between you and your inbox.
- **Built for Windows & Classic Outlook Refugees** — Local-first SQLite + FTS5 speed, Windows DPAPI credential encryption, a familiar **Classic Outlook UI mode**, built-in local calendars for IMAP accounts, and **1-click Classic Outlook calendar import**.
- **Agent-Ready by Design (Local MCP Server)** — Give Claude Desktop, Cursor, or your own local AI agents safe, read-only access to your unified inbox and calendar via EveryBox's built-in **Model Context Protocol (MCP)** server — with `<email_content>` prompt-injection wrapping and per-account, per-folder, and per-sender privacy controls.

---

## Ways You Can Use EveryBox

| Persona / Workflow | How EveryBox Makes It Effortless |
| :--- | :--- |
| **Multi-Entity Founder / Fractional Exec** | Create Workspaces (`Ctrl+1` Personal, `Ctrl+2` Company A, `Ctrl+3` Client B). Toggle one account or any subset and watch both your inbox and combined calendar filter instantly. Train distinct **Voice Profiles** per account so replies always match the right tone. |
| **Classic Outlook Escape Hatch** | Switch the UI theme to **Classic Outlook**, import your local *"Calendar (This computer only)"* folders in one click via Windows COM/MAPI, and keep legacy IMAP accounts (Network Solutions, GoDaddy, Fastmail, cPanel) fast and offline-ready. |
| **5-Minute Morning Triage** | Open **Assistant** for a structured Today Brief (`Needs You`, `Worth a Look`, `Updates`), jump into full-window keyboard **Triage** (`T`, then `E` Archive / `H` Snooze / `R` Reply / `J` Next), and approve AI pre-drafted replies for VIP senders. |
| **Local-AI & Subscription Purist** | Point EveryBox at your local Ollama / LM Studio model (with automatic GPU detection) or connect your existing **Claude / Codex / Antigravity CLI subscription** for \$0 extra API cost. Tracking pixels and remote images are blocked by default, suspicious senders get scam warnings, and expired 2FA codes auto-clean themselves. |
| **AI Agent & MCP Power User** | Connect Claude Desktop, Cursor, or custom local agents to EveryBox's local MCP server (`npm run mcp`). Ask *"What am I waiting on from vendors this week?"* or *"Prep me for tomorrow's meetings"* across all accounts without handing raw Gmail OAuth tokens to every agent. |
| **Hands-Off Autopilot Organizer** | Write plain-English **Autopilot Rules** with conditions, actions, VIP auto-pre-drafting, an undoable audit log, and `onlyIfNoReply` follow-up reminders so nothing slips through the cracks. |

---

## Feature Highlights

### Multi-Account Mail & Focus
- **Multi-Gmail + IMAP/SMTP:** Native Gmail OAuth2 API sync plus universal IMAP/SMTP (`imapflow` + `nodemailer`).
- **Workspaces & Focus Toggles:** View all accounts, solo one account, or select any custom subset (`Ctrl+1..9`).
- **People vs. Updates Split:** Separates real human conversations from newsletters, receipts, and automated noise.
- **Built-in Utilities:** 1-click **2FA code copy pills**, **Waiting On You / Waiting On Others** tracking, **Snooze**, **Send Later**, **Undo Send**, **Snippets** (`Alt+Ctrl+S`), Markdown composer, and 1-click **Subscriptions Unsubscribe**.
- **Themes & Layouts:** 5 color themes (`Light`, `Paper`, `Dark`, `Black`, `Graphite`) plus `EveryBox`, `Classic Outlook`, and `Gmail` UI layouts.

### Combined Calendar
- **Unified Multi-Account Grid:** Day / Week / Month views obeying your active account focus toggles.
- **Two-Way Google Calendar + CalDAV + ICS Feeds:** Full Google Calendar sync, optional CalDAV/ICS subscriptions, inline `.ics` email invite RSVPs, and meeting-link extraction.
- **Local SQLite Calendars + Outlook Import:** Every IMAP account gets a built-in local calendar out of the box, with deduplicated **1-click Classic Outlook COM/MAPI import** and standard `.ics` import/export.

### Private AI, Voice Profiles & Autopilot
- **Flexible AI Backends (\$0 Extra Cost):** Run 100% locally via **Ollama**, **LM Studio**, or any local OpenAI-compatible server; bridge your existing **Claude CLI**, **Codex CLI**, or **Antigravity CLI** subscriptions; or bring your own API keys (Anthropic, Gemini, OpenAI, Grok).
- **Voice-Matched Drafting:** Learns your writing style per account (`personal`, `business`, `customer`, `colleague`, `executive`, `custom`) and can automatically pre-draft replies to VIP senders.
- **Natural-Language Search & Summaries:** Query locally with plain English (`"pdf from maya last week"`), get instant thread gists + action items + key dates, and chat with your inbox in **Assistant**.
- **Autopilot Rules Engine:** Natural-language rules with full execution logs and one-click undo.

### Privacy & Security First
- **100% Local Database:** All synced mail, calendar events, and FTS5 search indexes stay on your machine (`%APPDATA%\everybox\`).
- **Encrypted Credentials:** Passwords and OAuth tokens are encrypted at rest with Windows **DPAPI** (`Electron safeStorage`).
- **Inbox Hygiene:** Tracking-pixel stripping, remote-image blocking with trusted-sender allowlists, scam warnings, and automatic 2FA code cleanup.

---

## Quick Start

> **Try it immediately with Demo Data:** On first launch (before you connect any real accounts), EveryBox automatically seeds realistic demo accounts, threads, and calendar events so you can explore the UI, Workspaces, Triage, Calendar, and AI workflows right away. Demo data clears automatically as soon as you connect your first real account.

### Prerequisites
- **Windows 10 / 11**
- **Node.js 22+** (uses built-in `node:sqlite`)
- *(Optional)* **Ollama** or **LM Studio** for 100% local AI inference

### Run Locally
```powershell
git clone https://github.com/SmelterLabs/EveryBox.git
cd EveryBox
npm install
npm run dev
```

### Build & Package for Windows
```powershell
npm run typecheck  # TypeScript check (main + renderer)
npm run build      # Production build -> out/
npm run package    # Windows NSIS installer & portable .exe -> dist/
```

Or double-click `launch-everybox.bat` after building to launch the production Electron app directly.

---

## Connect AI Agents via Built-in MCP Server

EveryBox ships with a **read-only local MCP server** (`everybox-windows`) over stdio JSON-RPC 2.0. Enable it in **Settings › MCP**, choose which accounts, folders, or senders to hide, and point your MCP client (Claude Desktop, Cursor, etc.) at the built server:

```json
{
  "mcpServers": {
    "everybox": {
      "command": "node",
      "args": ["C:/path/to/EveryBox/out/main/mcp-server.js"]
    }
  }
}
```

**Exposed read-only tools:** `get_context`, `search_mail`, `overview`, `read_thread`, `list_waiting`, and `upcoming_calendar` — with every email snippet and body wrapped in `<email_content>` tags to defend against indirect prompt injection.

---

## Keyboard Shortcuts at a Glance

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+K` | Open Command Palette |
| `Ctrl+1..9` | Switch saved Workspaces |
| `T` | Start full-window Triage (`E` Archive · `H` Snooze · `R` Reply · `J` Next · `Esc` Exit) |
| `Alt+Ctrl+S` | Insert Snippet while composing |

---

## Roadmap

- **Microsoft 365 / Outlook.com OAuth2** (native Mail + Calendar sync alongside Classic Outlook COM import)
- **Standalone Calendars & Provider Presets** (Apple iCloud, Fastmail, Yahoo, Zoho, and decoupled CalDAV/ICS feeds)
- **Mobile Companion App** (Android & iOS companion synced with your desktop workflows)
- **Signed Public Windows Releases** (automated NSIS installer + verified Google Cloud OAuth client)

---

## Documentation

- [User Guide](USER-GUIDE.md) — Connecting accounts, Classic Outlook import, Workspaces, shortcuts, and AI setup
- [Technical Guide](TECHNICAL-GUIDE.md) — Architecture, SQLite/FTS5 storage, DPAPI security, IPC, and build commands
- [Product Spec](PRODUCT.md) — Product vision, user workflows, and feature specifications
- [Design System](DESIGN.md) — Visual language, themes, typography, and layout details
