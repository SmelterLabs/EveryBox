# EveryBox — User Guide

EveryBox brings all of your email accounts and calendars into one calm Windows desktop app, with multi-account focus toggles and private local AI.

## Getting Started

### Connecting Email & Calendars
Open **Settings › Accounts** (gear icon in the sidebar):
- **Gmail + Google Calendar:** Click **Sign in with Google** to link both Gmail and two-way Google Calendar in one step. Repeat for as many Gmail accounts as you like.
- **IMAP / SMTP (Network Solutions, GoDaddy, Fastmail, cPanel, etc.):** Enter your email, password (or app password), and IMAP/SMTP host. Every IMAP account automatically gets a **built-in local calendar** in EveryBox — you can optionally add a CalDAV URL (two-way sync) or a read-only ICS feed URL if your provider hosts one.

### Importing Your Calendar from Classic Outlook or `.ics`
Open the **Calendar** tab and click **Import / Export**:
1. Choose which EveryBox account should own the imported events.
2. **Import from Classic Outlook (Windows):** Click **Scan Outlook** to detect your local Outlook Desktop calendars (including *"Calendar (This computer only)"*), then click **Import** next to any calendar. You can re-run this anytime — existing events update without creating duplicates.
3. **Import `.ics` File:** Import any `.ics` calendar export from Outlook, Apple Calendar, Thunderbird, Google Calendar, or webmail.
4. **Export `.ics` Backup:** Save your currently visible calendar(s) to a standard `.ics` file.

## Multi-Account Focus & Workspaces
- Use the sidebar account toggles to view **All accounts**, solo a single account, or select any subset.
- Both **Mail** and **Combined Calendar** obey the active account selection.
- Switch saved **Workspaces** with `Ctrl+1`, `Ctrl+2`, `Ctrl+3`.

## Keyboard Shortcuts
- `Ctrl+K` — Command Palette
- `T` / **Start triage** — One-by-one full-window Triage (`E` Archive, `H` Snooze, `R` Reply, `J` Next, `Esc` Exit)
- `Alt+Ctrl+S` — Insert Snippet while composing

## Private AI ($0 Extra API Cost)
Open **Settings › AI** to choose your preferred engine:
- **Ollama / LM Studio** (100% local on your PC)
- **Claude CLI / Codex CLI** (uses your existing subscription)
- Optional **Anthropic / Gemini / OpenAI** API keys
