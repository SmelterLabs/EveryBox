# EveryBox

Every inbox and calendar in one calm Windows desktop app — with multi-account focus toggles and \$0 extra-cost private AI.

## Features
- **Multi-Account Mail:** Multiple Gmail accounts (OAuth2 Gmail API) + IMAP/SMTP (`imapflow` + `nodemailer`)
- **Account Focus Toggles & Workspaces:** Toggle all accounts, solo one account, or select any subset (`Ctrl+1..3` Workspaces). Both Email and Combined Calendar obey the active toggles.
- **Combined Calendar:** Day / Week / Month views, two-way Google Calendar sync, optional CalDAV & read-only ICS feeds for IMAP, inline `.ics` email invite RSVP, and Today's Schedule inside the Today Brief.
- **Full AI Suite (\$0 Extra API Cost):**
  - Local GPU / CPU inference via **Ollama / LM Studio / llama.cpp** (default)
  - Optional **Claude CLI / Codex CLI** subscription bridge
  - Optional API key slots (Anthropic / Gemini / OpenAI)
  - Ask Your Inbox (`Assistant`), `✨ Summarize`, Voice-Matched AI Writer, Natural-Language Search (`"pdf from maya last week"`), People vs. Updates split, 2FA code copy pills, tracker pixel stripping, scam warnings.
- **Keyboard-First Triage & Polish:** One-by-one Triage (`E`/`H`/`R`/`J`/`Esc`), `Ctrl+K` Command Palette, 5 themes (`Dark`, `Black`, `Graphite`, `Light`, `Paper`), `M↓` Markdown composer, Snippets (`Alt+Ctrl+S`), Undo Send, Send Later, Subscriptions 1-click Unsubscribe, and a built-in read-only local **MCP Server** (`npm run mcp`).

## Development
```powershell
npm install
npm run dev        # Run in dev mode
npm run typecheck  # TypeScript check
npm run build      # Production build
npm run package    # Build Windows NSIS installer & portable .exe
```

Or double-click `launch-everybox.bat` to launch the built app.
