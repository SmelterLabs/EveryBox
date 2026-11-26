---
name: EveryBox
description: Calm Nordic Prism multi-account email and combined-calendar design system for Windows desktop and native Android (expanding to macOS and iOS).
colors:
  nordic-cobalt: "#3b82f6"
  nordic-cobalt-light: "#2563eb"
  nordic-sky-text: "#60a5fa"
  nordic-deep-text: "#1d4ed8"
  nordic-cobalt-soft-dark: "rgba(59, 130, 246, 0.18)"
  nordic-cobalt-soft-light: "rgba(37, 99, 235, 0.12)"
  prism-mint: "#2dd4bf"
  prism-mint-light: "#0d9488"
  prism-lavender: "#a78bfa"
  autopilot-amber: "#f5b841"
  autopilot-amber-stroke: "#e5a424"
  signal-coral: "#f06060"
  signal-crimson: "#d13438"
  dark-sidebar: "#11151d"
  dark-list: "#151a24"
  dark-main: "#181e29"
  dark-elevated: "#202837"
  dark-hover: "#263042"
  dark-selected: "#1c2f4f"
  dark-border-subtle: "rgba(210, 225, 255, 0.08)"
  dark-border-strong: "rgba(210, 225, 255, 0.14)"
  dark-text-primary: "#eef2f9"
  dark-text-secondary: "#9aa7bc"
  dark-text-muted: "#6b7890"
  black-sidebar: "#000000"
  black-list: "#07080a"
  black-main: "#0b0d11"
  black-elevated: "#14171f"
  black-hover: "#1c212c"
  black-selected: "#162642"
  black-text-primary: "#f4f7fb"
  black-text-secondary: "#9aa5b6"
  black-text-muted: "#687386"
  graphite-sidebar: "#14181f"
  graphite-list: "#181d26"
  graphite-main: "#1c222c"
  graphite-elevated: "#242c38"
  graphite-hover: "#2b3442"
  graphite-selected: "#20324d"
  light-sidebar: "#f4f6fa"
  light-list: "#fafbfd"
  light-main: "#ffffff"
  light-elevated: "#f1f4f9"
  light-hover: "#e7ecf4"
  light-selected: "#dbeafe"
  light-border-subtle: "rgba(15, 23, 42, 0.07)"
  light-border-strong: "rgba(15, 23, 42, 0.13)"
  light-text-primary: "#0f172a"
  light-text-secondary: "#475569"
  light-text-muted: "#7c8aa0"
  paper-sidebar: "#f0eee9"
  paper-list: "#f6f5f0"
  paper-main: "#fbfaf7"
  paper-elevated: "#eceae3"
  paper-hover: "#e4e1d8"
  paper-selected: "#dce8fb"
  paper-text-primary: "#1c222b"
  paper-text-secondary: "#525d6d"
  paper-text-muted: "#828d9c"
  paper-danger: "#c63838"
  paper-success: "#0f766e"
typography:
  display:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "15.5px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0em"
  label:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
  mono:
    fontFamily: 'ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace'
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.02em"
rounded:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.nordic-cobalt}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-pill-primary:
    backgroundColor: "{colors.nordic-cobalt}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
  button-secondary-pill:
    backgroundColor: "{colors.dark-elevated}"
    textColor: "{colors.dark-text-primary}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.dark-text-secondary}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  button-ghost-hover:
    backgroundColor: "{colors.dark-hover}"
    textColor: "{colors.dark-text-primary}"
  chip-filter:
    backgroundColor: "{colors.dark-elevated}"
    textColor: "{colors.dark-text-primary}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  chip-accent:
    backgroundColor: "{colors.nordic-cobalt-soft-dark}"
    textColor: "{colors.nordic-sky-text}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  card-surface:
    backgroundColor: "{colors.dark-elevated}"
    textColor: "{colors.dark-text-primary}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input-search-pill:
    backgroundColor: "{colors.dark-elevated}"
    textColor: "{colors.dark-text-primary}"
    rounded: "{rounded.pill}"
    padding: "4px 12px 4px 6px"
  badge-2fa-code:
    backgroundColor: "{colors.nordic-cobalt-soft-dark}"
    textColor: "{colors.nordic-sky-text}"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
---

# Design System: EveryBox

## Overview

**Creative North Star: "The Calm Nordic Tray"**

EveryBox is an Operate-mode instrument designed to feel like a quiet, precision-machined tray holding multiple lively mail streams without visual noise. Inspired directly by the **Nordic Prism** app mark (`build/icon.png`) — three fanned color-coded cards (lavender, mint teal, and cobalt blue) resting cleanly inside a frosted midnight-slate vessel — EveryBox keeps its own chrome calm, tonal, and low-glare so that only two things ever command immediate eye movement: the user's actual message/calendar content and the subtle color identity telling them which account it belongs to.

The system rejects heavy borders, saturated full-bleed headers, drop-shadow soup, and decorative AI neon gradients. Instead, spatial hierarchy comes from subtle, stepped tonal planes (`--bg-sidebar` → `--bg-list` → `--bg-main` → `--bg-elevated`), whisper-thin translucent hairlines (`--border-subtle`), crisp tabular numerals for unread/total counts, and purposeful bursts of semantic color — Nordic Cobalt for primary action and unread state, Autopilot Amber for stars and ready AI drafts, Prism Mint for synced/verified safety states, and user-chosen per-account colors rendered as delicate 3px rails and soft horizontal washes.

Across platforms, this identity stays unmistakable while obeying each OS's structural grammar: resizable 3-pane calm on Windows (and later macOS), and crisp Material Design 3 touch ergonomics, edge-to-edge system bars, and true-black OLED craft on Android (and later iOS HIG).

**Key Characteristics:**
- **Stepped tonal layering over heavy chrome:** Four distinct background planes separate navigation, list, reading canvas, and elevated cards using subtle luminance shifts rather than thick dividers.
- **Nordic Prism brand restrained to functional focal points:** Cobalt blue anchors primary CTAs, focus rings, unread indicators, and active states; lavender and mint live harmoniously inside the brand icon and account palette.
- **Peripheral multi-account legibility:** Every account carries a color from a curated 10-swatch palette and an optional symbol from 12 Lucide icons, expressed in three user-selectable row styles (`gradient`, `bar`, `dot`).
- **Five first-class themes:** Curated light (`light`, `paper`) and dark (`dark`, `black`, `graphite`) palettes designed individually — never lazy CSS inversions — including a genuine `#000000` OLED `black` theme.
- **Forgiving, linear motion:** Quiet state transitions (`150ms`), zero gratuitous bounce, and a signature linear SVG **Undo Fuse** border that visibly burns down around the Undo button before a queued send fires.

## Colors

EveryBox's color system pairs a cool, quiet Nordic neutral ladder with a single cobalt primary accent, restrained semantic signals, and a user-assigned multi-account color layer.

### Primary
- **Nordic Cobalt** (`#3b82f6` on dark/black/graphite; `#2563eb` on light/paper — `--accent`): Primary action fills (New Message, Send, Start Triage, Create Rule), unread indicator dots, active toggles, `2px` keyboard focus outlines, and the Undo Fuse countdown stroke.
- **Nordic Sky / Deep Text** (`#60a5fa` on dark themes; `#1d4ed8` on light/paper — `--accent-text`): High-contrast text links, AI summary/draft headers, active nav labels, inline 2FA code text, and selected pill text.
- **Nordic Cobalt Wash** (`rgba(59, 130, 246, 0.18)` dark/graphite, `0.20` black; `rgba(37, 99, 235, 0.12)` light, `0.13` paper — `--accent-soft`): Soft translucent tint for selected chips, AI Assist pills, 2FA code copy badges, and active Undo buttons.

### Secondary & Semantic Signals
- **Prism Mint** (`#2dd4bf` dark/black/graphite; `#0d9488` light; `#0f766e` paper — `--success`): "Up to date" sync status dot, tracker-blocking verification shield (`ShieldCheck`), "Worth a look" AI assistant rail, and Inbox Zero completion mark.
- **Autopilot Amber** (`#f5b841` fill, `#e5a424` stroke): Starred messages, Autopilot lightning bolt icon, and "AI reply draft ready" row indicator sparkle (`rgba(245, 184, 65, 0.18)` pill background with `#d99a1e` / `#e5a424` icon).
- **Signal Coral / Crimson** (`#f06060` dark/black/graphite; `#d13438` light; `#c63838` paper — `--danger`): Destructive actions (Delete, Empty Trash/Junk), unsent Draft badges, overdue reminders, invalid recipient chips, and scam warning banners (`rgba(229, 83, 75, 0.12–0.14)` soft fill).

### Neutral — Complete 5-Theme Token Matrix

Extracted directly from `src/renderer/src/styles/themes.css`:

| CSS Token | `dark` (Default) | `black` (OLED) | `graphite` | `light` | `paper` (Warm Stone) | Role |
|---|---|---|---|---|---|---|
| `--bg-sidebar` | `#11151d` | `#000000` | `#14181f` | `#f4f6fa` | `#f0eee9` | Navigation rail / top app chrome |
| `--bg-list` | `#151a24` | `#07080a` | `#181d26` | `#fafbfd` | `#f6f5f0` | Message list & inactive calendar day wells |
| `--bg-main` | `#181e29` | `#0b0d11` | `#1c222c` | `#ffffff` | `#fbfaf7` | Primary reading canvas, composer body, calendar canvas |
| `--bg-elevated` | `#202837` | `#14171f` | `#242c38` | `#f1f4f9` | `#eceae3` | Cards, search pill, AI panels, popovers, today well |
| `--bg-hover` | `#263042` | `#1c212c` | `#2b3442` | `#e7ecf4` | `#e4e1d8` | Pointer hover state & pressed feedback |
| `--bg-selected` | `#1c2f4f` | `#162642` | `#20324d` | `#dbeafe` | `#dce8fb` | Selected thread row, active nav item, bulk bar |
| `--border-subtle` | `rgba(210, 225, 255, 0.08)` | `rgba(210, 225, 255, 0.08)` | `rgba(210, 225, 255, 0.08)` | `rgba(15, 23, 42, 0.07)` | `rgba(30, 41, 59, 0.09)` | Pane dividers, card strokes, message separators |
| `--border-strong` | `rgba(210, 225, 255, 0.14)` | `rgba(210, 225, 255, 0.15)` | `rgba(210, 225, 255, 0.15)` | `rgba(15, 23, 42, 0.13)` | `rgba(30, 41, 59, 0.16)` | Inputs, modals, context menus, scrollbars, kbd badges |
| `--text-primary` | `#eef2f9` | `#f4f7fb` | `#eef2f8` | `#0f172a` | `#1c222b` | Primary copy, unread senders, headings |
| `--text-secondary` | `#9aa7bc` | `#9aa5b6` | `#9aa7ba` | `#475569` | `#525d6d` | Read subjects, toolbar icons, body metadata |
| `--text-muted` | `#6b7890` | `#687386` | `#69768a` | `#7c8aa0` | `#828d9c` | Timestamps, placeholders, section captions, total counts |
| `--accent` | `#3b82f6` | `#3b82f6` | `#3b82f6` | `#2563eb` | `#2563eb` | Primary CTA, unread dot, focus ring, fuse stroke |
| `--accent-soft` | `rgba(59, 130, 246, 0.18)` | `rgba(59, 130, 246, 0.2)` | `rgba(59, 130, 246, 0.18)` | `rgba(37, 99, 235, 0.12)` | `rgba(37, 99, 235, 0.13)` | Tinted chip/pill fill |
| `--accent-text` | `#60a5fa` | `#60a5fa` | `#60a5fa` | `#1d4ed8` | `#1d4ed8` | Accent text & inline links |
| `--danger` | `#f06060` | `#f06060` | `#f06060` | `#d13438` | `#c63838` | Destructive actions, drafts, scam alerts |
| `--success` | `#2dd4bf` | `#2dd4bf` | `#2dd4bf` | `#0d9488` | `#0f766e` | Sync healthy, trackers blocked |

### Multi-Account Identity Swatches
Curated 10-swatch palette from `Sidebar.tsx` (`COLOR_SWATCHES`), chosen to stay distinguishable against all 5 themes without muddying typography:
- Cobalt `#3B82F6`, Mint `#2DD4BF`, Lavender `#A78BFA`, Emerald `#34C77B`, Amber `#F5B841`, Rose `#EC5C8A`, Terracotta `#E87A48`, Crimson `#EF4444`, Indigo `#818CF8`, Slate `#94A3B8`.

### Named Rules
- **The Tonal Ladder Rule.** Never jump directly from `--bg-sidebar` to a harsh white/black card or paint full-width saturated headers. Every surface sits on one of the four stepped neutral tokens (`sidebar`, `list`, `main`, `elevated`).
- **The Whispered Account Tint Rule.** Per-account color washes never exceed `18%` mix on focused/selected rows (`12%–13%` at rest) and always fade smoothly to `transparent` by `72%–82%` row width so message text stays on pure neutral ground.
- **The Single-Focus Suppression Rule.** When only one account is connected or solo-focused in the thread list, suppress row-level account washes and accent bars (`showAccountTint = accounts.length > 1 && activeAccountIds.length !== 1`); color signals difference, never decoration.

## Typography

**Display & UI Font:** `"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif` (on Windows/macOS; mapped to `Roboto` / system sans on Android — see Android Platform Token Mapping).
**Body Font:** Same native sans-serif stack (`13.5px` base UI; `14px` `.email-prose` reading body; `14.5px` `.composer-editor` writing canvas).
**Label / Mono Font:** `ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace` for 2FA sign-in codes and keyboard shortcut keycaps (`kbd`).

**Character:** Crisp, humanist, OS-native sans-serif that disappears into the operating system while giving numeric badges and unread states unmistakable optical hierarchy through weight (`400` → `500` → `600` → `650` → `700`) and tabular numerals (`tabular-nums`).

### Hierarchy
- **Display** (`600`, `28px`, `1.2` line-height, `-0.02em` tracking): Today Brief greeting (`Good morning, ...`). Used sparingly — at most once per screen.
- **Headline** (`600`, `20px–22px`, `1.25` line-height, `-0.015em` tracking): Mailbox header (`Inbox`, `Search`), thread subject line (`21px` in `ThreadReader`, `22px` in `TriageView`), and view headers (`Autopilot`, `AI Assistant` empty state).
- **Title** (`600`, `15px–16px`, `1.35` line-height, `-0.01em` tracking): Calendar month heading (`16px`), Composer subject input (`15.5px`), Autopilot section headings (`15px`), and modal titles (`15px–18px`).
- **Body** (`400–500`, `13px–14.5px`, `1.55–1.68` line-height): UI base (`13.5px`), thread sender (`13px`, `650` unread / `500` read), thread subject (`12.5px`, `600` unread / `400` read), thread snippet (`12px`), email body prose (`14px`, `1.6` line-height), composer canvas (`14.5px`, `1.68` line-height). Reading width constrained to `640px` (`narrow`), `880px` (`comfortable` default), or unconstrained (`wide`).
- **Label** (`500–600`, `10px–11.5px`, `1.3` line-height, `+0.04em` tracking when uppercase): Date-group headers (`11.5px`), section kickers (`10.5px–11px` uppercase), unread/total counts (`11.5px` bold / `11px` muted, `tabular-nums`), folder pills (`10px`), and timestamps (`11px`).

### Named Rules
- **The Weight-Over-Size Unread Rule.** Unread conversations assert themselves through a `2px`-aligned `8px` cobalt dot plus weight contrast (`650`/`600` vs. `500`/`400`) and primary text luminance — never by inflating font size and shifting row height.
- **The Tabular Count Rule.** All unread counts, total counts, reminder counts, and time ranges use `tabular-nums` so numbers align vertically down the sidebar and list without jitter during sync.

## Layout

### Desktop Spatial Architecture (Windows / macOS)
EveryBox uses a **full-viewport (`h-screen w-screen`) resizable 3+1 pane shell** anchored by a `48px` (`h-12`) unified top bar:
- **Top Bar (`48px` height):** Left sidebar toggle + EveryBox wordmark; centered universal search pill (`max-w-[560px]`) with integrated Account Scope selector pill and separate `Ctrl+K` Command Palette pill; right clearance (`pr-36`) for native Windows caption controls.
- **Pane 1 — Navigation Sidebar:** Default `244px` (resizable `190px–480px`, double-click drag handle to reset). Houses Workspace switcher, full-width primary **New message** CTA, primary views (Email, Calendar, Autopilot, distinct bordered AI Assistant panel toggle), Mailboxes with `Unread / Total` dual counts, Accounts & Focus Toggles (with expandable per-account folder trees), Reminders, and bottom sync/settings bar.
- **Pane 2 — Message List:** Default `340px` (resizable `250px–960px`). Houses mailbox header, density & filter icon toggles, active account focus pills, `All / People / Updates` category tabs + right-aligned `Date / Sender / Subject` sort tabs, collapsible date-group bars, and thread rows.
- **Pane 3 — Primary Canvas (`flex-1`):** Displays **Today Brief** when no thread is selected, or **Thread Reader** (`640px` / `880px` / `wide` reading column) when a conversation is open. Switches to full-width **Combined Calendar** (7-column week/month grid or 1-column day view), **Autopilot** (`max-w-4xl`), or distraction-free full-window **Triage** (`max-w-[700px]`, sidebar hidden).
- **Optional Pane 4 — AI Assistant Side Panel:** Default `390px` (resizable `300px–640px`), docked right with `1px` `--border-subtle` divider.

### Density Modes & Spacing Rhythm
Base spatial rhythm follows a `4px` increment (`4px`, `8px`, `12px`, `16px`, `24px`, `32px`):
- **Thread List Density:**
  - `compact`: 1-line sender + timestamp (`py-1.5`, `24px` avatar, `space-y-0.5`).
  - `comfortable`: 2-line sender + subject (`py-2`, `28px` avatar, `space-y-1`).
  - `expanded` *(default)*: 3-line sender + subject + snippet + inline 2FA pill (`py-2.5`, `32px` avatar, `space-y-1`).
- **Desktop Resize Handles:** `6px` (`w-1.5`) invisible hit-slop dividers between panes that softly illuminate with `var(--accent)` at `40%` opacity on hover.

### Adaptive Platform Breakpoints (Desktop → Android → Tablet)
- **Compact (`< 600dp` — Android phones):** Single-pane master-detail stack (`Mail` → `Thread Reader`, `Calendar`, `Brief`, `Search`, with Mailboxes & Folders in a top-left drawer/sheet and Accounts & Settings in the top-right trigger) with bottom Material 3 `NavigationBar` (4 top-level destinations). Never compress the desktop 3-pane split onto a phone screen.
- **Medium (`600dp–839dp` — Unfolded foldables, small tablets):** `NavigationRail` + single content pane or list-detail split.
- **Expanded (`≥ 840dp` — Tablets, Chromebooks, Desktop):** `NavigationRail` / persistent `Sidebar` + master-detail `ThreadList` & `ThreadReader`.

## Elevation & Depth

EveryBox is **tonally layered at rest and softly lifted only for transient overlays**. Resting panes, cards, calendar wells, and list items never cast drop shadows; separation is achieved strictly through the four background planes (`sidebar` → `list` → `main` → `elevated`) and `1px` hairline borders (`--border-subtle`).

Shadows enter only when a surface floats *above* the workspace plane (dropdown menus, context menus, Command Palette, floating Composer, Triage pill bar, Undo Toast), paired with `--border-strong` so floating surfaces remain crisp even on OLED `black` and `dark` themes.

### Shadow Vocabulary
- **Subtle Badge Lift** (`0 1px 2px rgba(0, 0, 0, 0.12)` — `shadow-sm`): Primary CTA buttons, `AccountBadge` circles, and inline AI Draft Ready cards.
- **Floating Action Bar / Hover Pill** (`0 10px 15px -3px rgba(0, 0, 0, 0.25)` — `shadow-lg` / `shadow-xl`): Hover quick-action capsule on thread rows, inline Snooze/Remind popovers, and the bottom-left translucent Undo Toast (`backdrop-blur-md` at `92%` `--bg-elevated`).
- **Modal & Context Menu Surface** (`0 25px 50px -12px rgba(0, 0, 0, 0.45)` — `shadow-2xl`): Context menus, Command Palette, Settings modal, Calendar Event detail modal, and floating Triage bar.
- **Draggable Floating Composer (Resting)** (`0 24px 70px -12px rgba(0, 0, 0, 0.28), 0 4px 18px rgba(0, 0, 0, 0.12)`): Floats over an ultra-light `rgba(0, 0, 0, 0.14)` non-blurred backdrop so the user can drag it aside and read the thread beneath.
- **Draggable Floating Composer (Dragging)** (`0 30px 80px -10px rgba(0, 0, 0, 0.34), 0 8px 24px rgba(0, 0, 0, 0.16)`): Subtle altitude increase while actively repositioned.

### Named Rules
- **The Flat-At-Rest Rule.** Resting workspace panes, inbox cards, and calendar blocks never carry drop shadows. Use tonal stepping and `1px` `--border-subtle` hairlines instead.
- **The Crisp Dark-Edge Rule.** Every floating surface on `dark`, `black`, and `graphite` themes must pair its shadow with a `1px` `--border-strong` stroke so edges never dissolve into dark canvases.

## Shapes

EveryBox's form language mirrors the **Nordic Prism** icon: softly rounded rectangles with clear geometric hierarchy — tighter corners on small nested controls, generous radii on top-level cards and dialogs, and full pills exclusively for search, chips, avatars, and primary hero CTAs.

- **Micro (`6px` / `rounded-md`):** Inline folder tags, 2FA code pills, date-group toggle tabs, `kbd` shortcut caps, and compact icon badges.
- **Standard Interactive (`8px` / `rounded-lg`):** Navigation items, toolbar buttons, ghost buttons, dropdown menu items, calendar timed events, and compact list rows.
- **Primary Container / Control (`12px` / `rounded-xl`):** Primary CTA buttons (`New message`, `Send`), expanded/comfortable thread rows, schedule rows, attachment chips, Undo Toast, and popovers.
- **Hero Card & Floating Dialog (`16px` / `rounded-2xl`):** Floating Composer sheet, Settings modal, Command Palette, AI Draft Ready card, Autopilot feature cards, and Triage floating dock.
- **Full Pill (`9999px` / `rounded-full`):** Universal search bar, account scope pills, Today Brief primary pills, voice-profile segmented pills, AI quick-revise chips, avatars, unread dots, switches, and vertical `3px` account accent rails.

## Components

EveryBox components are **restrained, tactile, and keyboard-transparent** — crisp hairlines, calm fills, and immediate state feedback without flashy chrome.

### Buttons
- **Primary Filled:** `12px` radius (`rounded-xl`), `--accent` fill, `#ffffff` `600`-weight text, `8px 14px` padding (`New message`, `Send`, `Create Rule`). Hover brightens (`brightness-110`); active scales subtly (`0.99`). Today Brief hero CTAs use full pill (`9999px`) with `8px 20px` padding.
- **Split Send / Schedule Button:** Unified `12px` `--accent` container with a `1px` `rgba(255,255,255,0.25)` internal divider separating primary `Send` (`Ctrl+Enter`) from the `Schedule send` chevron dropdown.
- **Secondary / Outlined:** `8px` or `12px` radius (or pill on Today Brief), `--bg-elevated` fill, `1px` `--border-strong` border, `--text-primary` `500`-weight text; hover shifts to `--bg-hover`.
- **Ghost / Toolbar Action:** Transparent at rest, `8px` radius, `6px 10px` padding (`15px` Lucide icon + `12.5px` label in `ThreadReader`), hover reveals `--bg-hover`. Destructive hover shifts text/icon to `--danger`.
- **Focus Ring (Global):** `2px solid var(--accent)` with `2px` offset on `:focus-visible`.

### Chips & Pills
- **Account Focus Pill:** Full pill, `--bg-elevated` background, `10.5px–11.5px` medium text, paired with `6px–8px` account color dot or `AccountBadge`.
- **AI Quick-Revise Chip:** Full pill, `--bg-main` background, `1px` `--border-subtle`, `--text-secondary` text; hover transitions border to `--accent` and text to `--accent-text` (`Shorter`, `Warmer`, `Polish`, `Draft reply`, `Sounds good`, `Ask details`).
- **Recipient Chip:** Full pill inside Composer `To`/`Cc`/`Bcc` fields; valid addresses use `--bg-main` + `--border-subtle`, invalid addresses highlight in `rgba(209, 52, 56, 0.10)` + `--danger` border + `AlertCircle` icon.
- **Folder Pill (Search / Starred / Waiting):** `6px` radius, `10px` medium text; `Inbox` uses `--accent-soft` / `--accent-text`, `Trash`/`Junk` use `rgba(229, 83, 75, 0.14)` / `--danger`, custom folders use `--bg-elevated` / `--text-secondary`.

### Cards & Containers
- **Corner Style:** `12px` (`rounded-xl`) for inline schedule items, collapsed messages, and AI summary cards; `16px` (`rounded-2xl`) for Autopilot settings cards and AI Draft Ready cards.
- **Background & Border:** `--bg-elevated` fill on `--bg-main` canvas, `1px solid var(--border-subtle)` (or `color-mix(in srgb, var(--accent) 34%, var(--border-subtle))` for AI Draft Ready).
- **Internal Padding:** `12px–16px` (`p-3` to `p-4`), `20px` (`p-5`) for section containers.

### Inputs & Fields
- **Universal Search Pill:** Full pill (`rounded-full`), `--bg-elevated` fill, `1px` `--border-strong`, `focus-within:border-[var(--accent)]`, housing an embedded Account Scope dropdown pill on the left and `X` clear button on the right.
- **Standard Text Input / Textarea:** `8px–12px` radius, transparent or `--bg-main` fill, `1px` `--border-strong` (or `--border-subtle` inside elevated surfaces), `--text-muted` placeholder, `caret-color: var(--accent)`.
- **Rich-Text Composer Canvas:** Borderless writing surface (`14.5px`, `1.68` line-height) inside `--bg-main`, with collapsible quoted-message card (`--bg-elevated`, `border-l-2` `--border-strong`) below.

### Navigation
- **Desktop Sidebar:** Vertical list of `8px`-radius rows (`px-2.5 py-1.5`, `13px`), active view uses `--bg-selected` + `--accent-text` + `--accent` icon; active mailbox uses `--bg-selected` + `--text-primary` `600`-weight + `--accent` icon. AI Assistant toggle is intentionally separated as a bordered toggle button (`--border-subtle` / `--accent-soft` when open) so users immediately distinguish side-panel toggles from full-view switches.
- **Mobile Android Navigation:** Mapped to Material 3 bottom `NavigationBar` with 4 destinations (`Mail`, `Calendar`, `Brief`, `Search` — with Mailboxes & per-account folder trees in the top-left drawer/sheet, Accounts & Settings in the top-right trigger, and Autopilot inside Brief) on compact screens and `NavigationRail` on expanded screens (detailed in Android Platform Token Mapping).

### Signature Components

1. **Multi-Account Visual Identity System (`AccountIcon.tsx`, `Sidebar.tsx`, `ThreadList.tsx`)**
   - **12 Predefined Lucide Symbols** (`strokeWidth: 2.2`, `#ffffff` glyph on colored badge, or `none` for solid dot): `home` (Home), `briefcase` (Work), `building` (Company), `flame` (Flame), `rocket` (Rocket), `globe` (Globe), `shield` (Shield), `star` (Star), `heart` (Heart), `code` (Code), `user` (Person), `sparkles` (Sparkles).
   - **AccountBadge Sizes:** Dot-only (`xs` `8px`, `sm` `10px`, `md` `12px`); Symbol badge (`xs` `16px` circle / `9px` icon, `sm` `18px` / `10px` icon, `md` `20px` / `11px` icon) with optional `1.5px` cutout border matching the parent row background.
   - **3 Row Identity Modes** (`settings.accountRowStyle`, active when >1 account is visible):
     - `gradient` *(default)*: `3px` left vertical accent rail (`opacity: 0.85` at rest, `1.0` when selected/focused) + soft horizontal gradient fade (`12% → 4% → 0%` at `0% / 38% / 72%` in ThreadList; `13% → 4% → 0%` at `0% / 45% / 82%` in Sidebar; `16%–18%` blended into `--bg-selected` when selected).
     - `bar`: `3px` left vertical accent rail on clean neutral background (no wash).
     - `dot`: Clean neutral row with only the avatar-corner `AccountBadge` / dot.

2. **Undo-Fuse Toast (`App.tsx`, `themes.css`)**
   - Bottom-left translucent floating capsule (`rounded-xl`, `92%` `--bg-elevated` with `backdrop-blur-md`, `1px` `--border-strong`, `role="status"` / `aria-live="polite"`).
   - When an action is reversible (Undo Send, Archive, Delete, Rule change), the `Undo` button carries an SVG perimeter border (`pathLength="100"`, `stroke-width: 2`, `--accent`) that burns down smoothly via `@keyframes undo-fuse-burn` (`linear`, `animation-duration` matched to `toast.durationMs`, default `5000ms`).

3. **Floating Draggable Composer (`Composer.tsx`)**
   - `16px`-radius floating sheet crowned by a `3px` top hairline in the sending account's color and a soft `11%` account-tinted header gradient.
   - Drag header to reposition anywhere on screen (persisted to `localStorage`, viewport-clamped; double-click to re-center) over an unblurred `14%` scrim so users can read the underlying thread while replying. Includes compact 1-row AI Assist bar, live autosave status, and Split Send/Schedule button.

4. **Inline AI Draft Ready Card (`ThreadReader.tsx`)**
   - Appears above thread messages with a `10%` `--accent` tinted header, segmented Voice Profile switcher pills, directly editable reply textarea, primary **Send** (wired through Undo Fuse), **Open in Composer**, **Always auto-draft** VIP toggle, and **Don't pre-draft for this sender** mute action.

5. **Inline 2FA Sign-In Code Copy Pill (`ThreadList.tsx`, `TodayBrief.tsx`)**
   - Surfaces extracted verification codes directly in the thread row and Today Brief as a 1-click monospace pill (`--accent-soft` fill, `1px` `--accent` border, `--accent-text` code + `Copy` icon) so users never have to open the email.

6. **Combined Calendar Merged Event Card (`CalendarView.tsx`)**
   - `8px` (`rounded-lg`) timed block (`6px` all-day pill) on `--bg-main` with a `3px` left border in the primary account's color; when the same meeting appears across multiple accounts (`Merged` mode), renders a compact cluster of `6px` colored dots for each participating account.

## Do's and Don'ts

### Do:
- **Do** separate workspace surfaces with the 4-step neutral ladder (`--bg-sidebar`, `--bg-list`, `--bg-main`, `--bg-elevated`) and `1px` `--border-subtle` hairlines rather than drop shadows.
- **Do** keep per-account gradient washes subtle (`≤18%` mix, fading to transparent by `72%–82%` width) and suppress them automatically when viewing a single soloed account.
- **Do** preserve `tabular-nums` on every count, timestamp, and schedule range, and keep unread differentiation in weight + dot rather than enlarged font sizes.
- **Do** pair every floating dark-mode surface (`dark`, `black`, `graphite`) with a `1px` `--border-strong` outline so dialogs and menus stay crisp against deep backgrounds.
- **Do** wire destructive or outbound actions (Send, Archive, Delete, Mute Sender) to a reversible Undo Toast / Snackbar with linear fuse progress feedback.
- **Do** keep all copy, empty states, and defaults 100% public and generic — zero hardcoded personal names, hardware names, email addresses, or credentials.

### Don't:
- **Don't** paint full-width saturated brand headers, neon AI gradients, or glassmorphic blur over core reading/list panes — blur is reserved exclusively for transient overlays like the Undo Toast.
- **Don't** invent a sixth theme or apply lazy CSS inversion for dark mode; all 5 themes (`dark`, `black`, `graphite`, `light`, `paper`) are hand-tuned token sets.
- **Don't** use raw hex values inside components for neutral surfaces or semantic text; always bind to semantic tokens (CSS vars on desktop, Material 3 `ColorScheme` / theme tokens on Android).
- **Don't** force desktop 3-pane layouts, hover-only actions, or `28px` click targets onto Android; translate them to native touch gestures, bottom sheets, and `≥48dp` targets.
- **Don't** trap users in irreversible states when closing a dirty draft or swiping a thread — autosave drafts silently and provide immediate Undo.

---

## Android Platform Token Mapping

This section defines how EveryBox's canonical visual system translates to **native Android (Material Design 3)** without losing EveryBox's calm Nordic Prism identity or breaking Android platform conventions. *(When iOS and macOS ship later, they will map the same semantic token layer to Apple HIG / SwiftUI or native system materials while honoring safe areas, edge-swipe Back, and Reduce Motion.)*

### 1. Material Design 3 Color Role Mapping (All 5 Themes)

EveryBox preserves all **5 curated themes** on Android as first-class static schemes. **Material You (Dynamic Color)** on Android 12+ is strictly **opt-in** (default **Off**) because wallpaper-derived accents can collide with EveryBox's 10-swatch multi-account color identity; Nordic Cobalt remains the canonical default accent.

> **WCAG AA Accessibility Upgrade for Mobile:** On desktop, `--text-muted` (`#6b7890` on `dark`, `#7c8aa0` on `light`) sits around `3.5:1–3.7:1` and `#ffffff` on `#3b82f6` sits at `3.68:1`. On Android — where outdoor glare and smaller mobile screens amplify legibility strain — every interactive label, caption, status color, and filled button is calibrated and mathematically verified to **WCAG AA (`≥4.5:1` for normal text across both `surface` and `surfaceContainerHigh`, `≥3:1` for UI components)**:
> - **Filled Primary CTA & FAB (`--accent-btn`):** Use **Nordic Cobalt Deep (`#2563eb`) with `#ffffff` `onPrimary` (`5.17:1` WCAG AA)** consistently across all 5 themes, while keeping `#3b82f6` on dark surfaces for non-text UI indicators (active icons, unread dots, focus rings, borders). *(For dark tinted containers like 2FA badges and active chips, lift `--accent-text` to `#7cb8ff` so text maintains `≥5.53:1` contrast.)*
> - **Secondary & Mobile-Muted Text:** Map `onSurfaceVariant` directly to `--text-secondary` (`≥5.77:1` across all 5 themes), and calibrate mobile caption/muted text (`--text-muted` mobile) to **`≥5.28:1`**: `#8f9db6` (`dark`), `#8792a7` (`black`), `#93a0b5` (`graphite`), `#58657a` (`light`), and `#566070` (`paper`).
> - **Semantic Status Signals (`error` & `success`):** Calibrate mobile `error` (`--danger`) to `#f87171` on dark/black/graphite, `#c81e22` on `light`, and `#b91c1c` on `paper` (`≥5.09:1` even on `--bg-elevated`), and `everyboxSuccess` (`--success`) to `#2dd4bf` on dark themes and `#0f766e` on both `light` and `paper` (`≥4.55:1`).

| Material 3 Color Role | `dark` | `black` (OLED) | `graphite` | `light` | `paper` | EveryBox Desktop Source / Min Contrast |
|---|---|---|---|---|---|---|
| `background` / `surface` | `#181e29` | `#0b0d11` | `#1c222c` | `#ffffff` | `#fbfaf7` | `--bg-main` (Reader, Composer, Calendar canvas) |
| `surfaceContainerLowest` | `#11151d` | `#000000` | `#14181f` | `#f4f6fa` | `#f0eee9` | `--bg-sidebar` (True `#000000` OLED canvas / top chrome) |
| `surfaceContainerLow` | `#151a24` | `#07080a` | `#181d26` | `#fafbfd` | `#f6f5f0` | `--bg-list` (Inbox list surface) |
| `surfaceContainer` | `#1c2330` | `#0f1218` | `#202733` | `#f4f6fa` | `#f0eee9` | Bottom `NavigationBar` & drawer container |
| `surfaceContainerHigh` | `#202837` | `#14171f` | `#242c38` | `#f1f4f9` | `#eceae3` | `--bg-elevated` (Cards, search bar, bottom sheets, snackbars) |
| `surfaceContainerHighest` | `#263042` | `#1c212c` | `#2b3442` | `#e7ecf4` | `#e4e1d8` | `--bg-hover` (Pressed states, active chips) |
| `primary` (filled CTA / FAB) | `#2563eb` | `#2563eb` | `#2563eb` | `#2563eb` | `#2563eb` | `--accent-btn` (`5.17:1` AA w/ `#ffffff`) |
| `primary` (icons / dots / focus) | `#3b82f6` | `#3b82f6` | `#3b82f6` | `#2563eb` | `#2563eb` | `--accent` (`≥3.6:1` non-text UI) |
| `onPrimary` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | High-contrast label on primary FAB / filled button |
| `primaryContainer` | `#1c2f4f` | `#162642` | `#20324d` | `#dbeafe` | `#dce8fb` | `--bg-selected` (Active nav pill, selected row) |
| `onPrimaryContainer` | `#eef2f9` | `#f4f7fb` | `#eef2f8` | `#1d4ed8` | `#1d4ed8` | `--text-primary` / `--accent-text` |
| `secondaryContainer` | `rgba(59,130,246,0.18)` | `rgba(59,130,246,0.20)` | `rgba(59,130,246,0.18)` | `rgba(37,99,235,0.12)` | `rgba(37,99,235,0.13)` | `--accent-soft` (AI pills, 2FA badge, active filter chip) |
| `onSecondaryContainer` | `#7cb8ff` *(neutral `#60a5fa`)* | `#7cb8ff` *(neutral `#60a5fa`)* | `#7cb8ff` *(neutral `#60a5fa`)* | `#1d4ed8` | `#1d4ed8` | `--accent-text` (`≥5.53:1` AA on tinted & neutral surfaces) |
| `onSurface` | `#eef2f9` | `#f4f7fb` | `#eef2f8` | `#0f172a` | `#1c222b` | `--text-primary` (`≥12.5:1` AAA) |
| `onSurfaceVariant` | `#9aa7bc` | `#9aa5b6` | `#9aa7ba` | `#475569` | `#525d6d` | `--text-secondary` (`≥5.77:1` AA) |
| `onSurfaceVariant` (mobile caption) | `#8f9db6` | `#8792a7` | `#93a0b5` | `#58657a` | `#566070` | `--text-muted` mobile-lifted (`≥5.28:1` AA) |
| `outlineVariant` | `rgba(210,225,255,0.08)` | `rgba(210,225,255,0.12)` | `rgba(210,225,255,0.08)` | `rgba(15,23,42,0.07)` | `rgba(30,41,59,0.09)` | `--border-subtle` (1dp hairlines; lifted to `0.12` on OLED `black`) |
| `outline` | `rgba(210,225,255,0.14)` | `rgba(210,225,255,0.18)` | `rgba(210,225,255,0.15)` | `rgba(15,23,42,0.13)` | `rgba(30,41,59,0.16)` | `--border-strong` (Input/sheet borders; lifted to `0.18` on OLED `black`) |
| `error` | `#f87171` | `#f87171` | `#f87171` | `#c81e22` | `#b91c1c` | `--danger` mobile-calibrated (`≥5.09:1` AA on main & elevated) |
| `everyboxSuccess` *(custom ext)* | `#2dd4bf` | `#2dd4bf` | `#2dd4bf` | `#0f766e` | `#0f766e` | `--success` mobile-calibrated (`≥4.55:1` AA on main & elevated) |
| `everyboxAmber` *(custom ext)* | `#f5b841` | `#f5b841` | `#f5b841` | `#d97706` | `#b45309` | Autopilot / Star / Pre-Draft sparkle |

#### OLED `black` Theme Guardrails on Android
- On `black`, the Inbox list backdrop and system bars use true `#000000` (`surfaceContainerLowest`) for zero-emission OLED pixel savings; message reader canvas uses `#0b0d11` (`surface`), and elevated cards/sheets step up to `#14171f` (`surfaceContainerHigh`) with a `1dp` `rgba(210, 225, 255, 0.12–0.18)` hairline so cards and bottom sheets never float invisibly into black pixels.
- Account gradient washes on `black` stay capped at `14%` peak alpha at the left edge fading to `0%` by `68%` row width so OLED power efficiency and dark-room eye comfort stay intact.

### 2. Android Typography Scale (`sp` Units, System Font Scaling)

Desktop `px` values map to Material 3 roles in **`sp`** (never fixed `px`/`dp` for text) using `Roboto` (Android system default, variable optical sizing on Android 12+) and `Roboto Mono` for 2FA codes. All layouts must remain unclipped at `font_scale = 1.3` (verified via `adb shell settings put system font_scale 1.3`).

| EveryBox Role | Desktop (`px`) | Android Material 3 Role | Size / Line Height (`sp`) | Weight | Usage on Android |
|---|---|---|---|---|---|
| Display | `28px` | `headlineMedium` | `26sp / 32sp` | `600` | Today Brief greeting (`Good morning`) |
| Headline | `20px–22px` | `titleLarge` | `20sp / 26sp` | `600` | Top app bar title, Thread Reader subject, Empty states |
| Title | `15.5px–16px` | `titleMedium` | `16sp / 22sp` | `600` | Composer subject, Calendar month, Bottom sheet headers |
| Body Primary | `13.5px–14.5px` | `bodyLarge` | `15sp / 22sp` | `400` (`600` unread) | Thread sender (`15sp`), email reading prose (`15sp–16sp`), composer editor |
| Body Secondary | `12px–13px` | `bodyMedium` | `14sp / 20sp` | `400` (`600` unread) | Thread subject (`14sp`), 1–2 line snippet (`13.5sp`), calendar event title |
| Label Medium | `11.5px–12px` | `labelLarge` / `labelMedium` | `12sp–13sp / 16sp` | `500–600` | Filter chips, nav bar labels, timestamps (`tabular-nums`), action buttons |
| Label Small | `10px–11px` | `labelSmall` | `11sp / 14sp` | `600` | Date-group headers, folder pills, unread badges (`≥11sp` floor; never `<11sp` on mobile) |
| Mono Code | `11.5px` | `labelLarge` (`Roboto Mono`) | `13sp / 18sp` | `600` | Inline 2FA copy chip (`tabular-nums`, letter-spacing `+0.06em`) |

### 3. Touch Targets, Spacing & Edge-to-Edge Window Insets (`dp`)

- **48×48 dp Touch Target Floor:** Every interactive element — top bar icons, star button, inline 2FA copy pill, account focus pill, checkbox/avatar multi-select hit zone, bottom nav item, and calendar event tap target — must have a minimum `48×48 dp` touch hit area (even when the visible icon or pill is `24dp`–`36dp`) with at least **`8 dp`** separation between adjacent targets.
- **Account Focus Strip (Mobile Equivalent of Desktop Sidebar Toggles):** Horizontal scrollable pill rail below the Top App Bar (`36dp` visible pill height inside a `48dp` touch wrapper, `8dp` gap) showing **All** + each account's `AccountBadge` (colored circle + 12-symbol Lucide icon) + short name; tap to solo, long-press or check-mode to multi-select a subset or switch a saved Workspace.
- **Edge-to-Edge System Bars & Insets:**
  - Draw edge-to-edge behind both the transparent status bar and gesture navigation bar (`enableEdgeToEdge()`).
  - Status bar icons invert automatically (`light` / `paper` → dark status bar glyphs; `dark` / `black` / `graphite` → light status bar glyphs).
  - Apply `statusBarsPadding()` to top app bars, `navigationBarsPadding()` to bottom `NavigationBar` / floating FAB / Undo Snackbar, `displayCutoutPadding()` in landscape, and `imePadding()` to Composer and AI Assistant input bars so keyboards never occlude the Send button or formatting bar.
- **One Primary FAB:** At most one primary Material 3 FAB (`56dp` standard or extended `New message` FAB that collapses to `56dp` icon on scroll) per top-level screen (`Compose` on Inbox, `New event` on Calendar). Never stack multiple FABs.

### 4. Navigation, Swipe Triage & System Back Coexistence

- **Size-Matched Navigation:**
  - Compact phones (`< 600dp`): Material 3 bottom `NavigationBar` (`80dp` height + nav inset) with 4 destinations (**`Mail`**, **`Calendar`**, **`Brief`**, **`Search`**) + Top App Bar leading Mailbox Drawer / Sheet (for standard mailboxes, per-account folder trees, and Reminders) and trailing Accounts & Settings trigger. Autopilot rules and Voice Profiles live cleanly inside the **Brief** destination.
  - Foldables / Tablets (`≥ 600dp`): Material 3 `NavigationRail` (`80dp` wide) paired with a 2-pane `ThreadList` + `ThreadReader` layout (`≥ 840dp`).
- **System Predictive Back vs. Swipe-to-Triage:**
  - Android's system Back gesture owns the outer **`24dp–32dp` left and right screen edges**. Horizontal swipe gestures on thread rows (`Swipe Right` = Archive/Mark Read, `Swipe Left` = Delete/Snooze) **must ignore touches originating inside an outer edge exclusion zone of `≥ 28dp` (`36dp` recommended)** so users never trigger accidental archives when swiping Back.
  - Predictive Back animations work on every pushed screen (Thread Reader → Mail, Composer → auto-save draft + exit, Search → clear/close, Calendar Event Detail → Calendar).

### 5. Account Identity & Motion on Android

- **Account Row Styles (`gradient` / `bar` / `dot`):**
  - Preserved identically on Android `ThreadList` rows (`16dp` horizontal padding, `≥72dp` row height for `expanded` / `≥56dp` for `comfortable` / `≥48dp` for `compact`):
    - `gradient` *(default)*: `3dp` rounded vertical left accent rail inset `4dp` from the row edge + subtle left-to-right gradient (`12% → 4% → 0%` on `dark`/`light`/`paper`, `14% → 0%` on OLED `black`).
    - `bar`: `3dp` left vertical accent rail only.
    - `dot`: `18dp` `AccountBadge` anchored to the bottom-right corner of the `40dp` sender avatar (`1.5dp` cutout ring matching row surface).
- **Motion & Undo-Fuse Snackbar:**
  - Use Material 3 transitions: **Shared-Axis X** for list → thread detail push, **Fade-Through** for bottom-nav tab switches, and **Container Transform / Modal Bottom Sheet** for Compose and Calendar Event details (`250ms–300ms` emphasized decelerate).
  - Replace desktop's bottom-left Undo Toast with a Material 3 **Floating Snackbar** positioned `16dp` above the bottom `NavigationBar` (or `16dp` above the keyboard/nav inset when docked), keeping EveryBox's signature **linear Undo-Fuse stroke** animating around the `Undo` action button over `5000ms` (`undoSendSeconds`).
  - **Reduced Motion:** When Android's `Remove animations` (`Settings.Global.ANIMATOR_DURATION_SCALE == 0`) is enabled, replace all spatial transitions with instant cuts or `100ms` opacity crossfades and swap the animated Undo-Fuse stroke for a static countdown label (`Undo (5s)`).
