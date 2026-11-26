# EveryBox — Android Design Specification

> **Status:** Design Spec v1.1 — Reconciled with `PRODUCT.md`, `DESIGN.md`, and `docs/mobile/ARCHITECTURE-PLAN.md`
> **Creative North Star:** *"The Calm Nordic Tray"* (Nordic Prism visual identity)
> **Surface Mode:** Operate (Material Design 3 native Android)
> **Implementation Stack:** React Native (New Architecture / Fabric) + Expo SDK 53+ CNG (`@shopify/flash-list`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-webview`) + `everybox-mail-native` Kotlin module
> **Target Devices:** Android 12+ (API 31+), Compact Phones (`360–599dp`), Foldables & Tablets (`600dp+`)
> **Public-App Guarantee:** All copy, personas, tokens, defaults, and flows are designed for any commercial end user. Zero personal identifiers, hardware assumptions, or hardcoded credentials.

---

## 1. Operate-Mode Android Thesis & Navigation Topology

### 1.1 Product & UX Thesis
EveryBox for Android is **not** a shrunken 3-pane desktop client and **not** an iOS bottom-tab layout wearing Material icons. Desktop's optional `outlook-classic` and `gmail` experience shells remain desktop-only; Android ships strictly as native EveryBox governed by Material Design 3 structure and themed in EveryBox's five curated **Nordic Prism** palettes (`dark`, `black`, `graphite`, `light`, `paper`).

On mobile, EveryBox's core job is **fast, low-friction multi-account clarity**:
- See every connected inbox and calendar in one calm stream without losing track of *which account* an email or meeting belongs to.
- Isolate any single account or workspace in **one thumb tap** via the Multi-Account Focus Strip (coupled across Mail, Calendar, and Brief).
- Read, reply (or send a voice-matched AI pre-draft), copy 2FA codes, and join meetings without leaving the thumb zone.

### 1.2 Adaptive Navigation Topology

| Width Class | Viewport | Navigation Chrome | Content Layout |
|---|---|---|---|
| **Compact (Phone)** | `< 600dp` | **Material 3 Navigation Bar** (bottom, `80dp` height + system nav bar inset), 4 destinations | Single-column push stack (List → Thread Reader; Calendar → Event Sheet) |
| **Medium (Foldable / Small Tablet)** | `600–839dp` | **Material 3 Navigation Rail** (start edge, `80dp` width) + Compose FAB at rail top | Single-column with `640dp` max reading measure, or optional split on landscape |
| **Expanded (Tablet / Desktop Mode)** | `>= 840dp` | **Navigation Rail / Modal Drawer** (`80dp` / `280dp`) | **2-Pane List-Detail** (`360dp` Thread List + flexible Thread Reader; Calendar Week grid + side detail sheet) |

#### Compact Bottom Navigation Bar (4 Destinations)
1. **Mail** (`Inbox` icon) — Unified Inbox (and active Mailbox/Folder via Top App Bar drawer trigger), Multi-Account Focus Strip, People/Updates filter, Compose FAB.
2. **Calendar** (`Calendar` icon) — Combined Calendar (Agenda / 3-Day / Week), Merged vs. Raw deduplication, All-Day strip, Event Detail sheet, New Event FAB.
3. **Brief** (`Sparkles` / `Zap` icon) — Mobile **Today Brief & Autopilot**: "Waiting on you" queue, ready AI pre-drafts, recent 2FA quick-copy codes, next 2 meetings with 1-tap Join, and Autopilot rules / Voice Profiles.
4. **Search** (`Search` icon) — Dedicated instant local FTS5 + Natural-Language Search with account-scope chips, parsed filter pills (`from:`, `has:attachment`, date ranges), recent queries, and `Include Trash & Junk` toggle.

> **Why 4 tabs (and where do Folders & Settings live)?**
> Putting Mail, Calendar, Brief, and Search in the bottom bar keeps the four highest-frequency mobile jobs within natural thumb reach without crowding above 4 destinations. Standard & custom mailboxes (`Starred`, `Snoozed`, `Waiting`, `Drafts`, `Sent`, `Scheduled`, `Archive`, `Junk`, `Trash`, and per-account custom folders) open from the Top App Bar **Mailbox Drawer / Sheet** (leading menu button), and **Accounts & Settings** opens from the trailing Account/Settings button in the Top App Bar.

### 1.3 Edge-to-Edge Window Insets & System Chrome
- **Full Edge-to-Edge (`enableEdgeToEdge()`):** Every screen draws behind both the Android status bar and the gesture/3-button navigation bar.
- **Status Bar:** Transparent background; light icons on `dark`, `black`, and `graphite`; dark icons on `light` and `paper`. Top App Bar consumes `WindowInsets.statusBars` padding cleanly.
- **Navigation Bar:** Transparent gesture pill scrim (or matching tonal surface on 3-button nav). Bottom Navigation Bar and sticky bottom sheets consume `WindowInsets.navigationBars`.
- **Display Cutout & IME Insets:** Composer and Thread Reader Quick Reply animate smoothly above the software keyboard using `WindowInsets.ime` (`WindowInsetsAnimationCompat`) so the active formatting/send bar never hides behind the keyboard.

### 1.4 Predictive Back Compatibility (Android 14+)
EveryBox honors the system Back gesture everywhere and **never traps or hijacks it**:
- **Thread Reader → Inbox:** Predictive back reveals the underlying Thread List position with subtle scale-down (`1.0 → 0.92`) and corner-radius transition.
- **Multi-Select Mode:** First Back clears selection and exits contextual action mode without leaving Inbox.
- **Bottom Sheets (Move, From Switcher, Event Detail, Focus Sheet):** Predictive back scrubs sheet translation downward smoothly.
- **Composer Sheet:** If clean (no edits), Back closes immediately; if dirty, autosaves local draft silently and shows an `"Draft saved"` snackbar with `"Discard"` action rather than blocking Back with an intrusive alert modal (unless an explicit Discard tap occurs).
- **Row Swipe vs. Edge Back Coexistence:** See Section 2.1.4 for the mandatory `36dp` edge-safe gesture inset rule.

### 1.5 Multi-Account Focus Toggles (One-Handed Mobile Adaptation)
Desktop's sidebar focus toggles are EveryBox's signature differentiator. On Android, they live as a **sticky, single-row Horizontal Focus Pill Strip** (`44dp` visual pill height inside a `52dp` vertical container, guaranteeing `>=48dp` tap target height) pinned immediately below the Top App Bar on **Mail**, **Calendar**, and **Brief**:

- **Pill 0 (`All`):** Shows combined unread count when active (`All · 12`). Tapping resets focus to all enabled accounts.
- **Account Pills (`1..N`):** Each pill shows the account's colored symbol (`AccountBadge` icon or color dot), short account name (truncated at `12ch`), and optional unread count.
  - **Single tap on an account pill:** Solos that account (matches desktop's click-to-solo behavior). Tapping the already-soloed pill returns to `All`.
  - **Long press on an account pill:** Toggles multi-account selection (adds/removes that account from a multi-account focus set, with `LONG_PRESS` haptic tick), allowing e.g. `Work + Studio` simultaneously.
- **Trailing `Workspaces / Filter` Icon Chip (`48×48dp`):** Opens the **Focus & Workspaces Bottom Sheet**, where users can select saved Workspaces (`All Accounts`, `Work Focus`, `Personal`, custom workspaces) or multi-check individual accounts with one hand.
- **Cross-Tab Persistence:** Focusing `Work` in Mail persists when switching to Calendar or Brief, with a visible active-focus pill so the user never wonders why personal events are hidden (and a 1-tap `Show all` reset chip in empty states).

---

## 2. Core Screen Specifications

### 2.1 Screen 1 — Unified Inbox

#### Layout & Hierarchy
1. **Top App Bar (`64dp` + status bar inset):**
   - Leading (`48×48dp`): Mailbox Drawer icon (shows active mailbox name next to it, e.g., `Inbox`, plus unread count badge).
   - Trailing (`48×48dp` each, `8dp` gap): Manual Sync / Syncing status indicator + Accounts & Settings avatar button.
2. **Multi-Account Focus Pill Strip (`52dp`):** Horizontal scroll of `All` + Account Pills + trailing Workspace Sheet trigger. Hidden only when the user has 1 connected account.
3. **Category & Sort Bar (`48dp`):**
   - Leading Material 3 Segmented Filter Pills: `All`, `People` (with unread count), `Updates` (with unread count).
   - Trailing compact `Sort / Density` filter button (`48×48dp`) opening a bottom sheet for Sort (`Date`, `Sender`, `Subject`, `Unread`, `Starred`, `Account`) and Density (`Comfortable`, `Compact`, `Expanded`).
4. **Date-Grouped Thread List (`LazyColumn` / `FlashList`):**
   - Collapsible date group headers (`Today`, `Yesterday`, `Earlier This Week`, `Last Week`, `Older`) — `36dp` visual height (`48dp` touch target), sticky-optional, showing chevron + label + collapsed count.
   - **Thread Row Anatomy (`min-height: 76dp` Comfortable, `60dp` Compact, `88dp` Expanded):**
     - **Unread Indicator:** `8dp` circle in `--accent` aligned with sender line (absent when read).
     - **Sender Avatar + Account Badge (`40×40dp` tap target for instant multi-select toggle):** Circular monogram avatar (`--bg-elevated`), overlaid at bottom-end with the `18×18dp` **Account Colored Symbol Badge** (`AccountBadge` carrying the account's Lucide icon in white on `account.color`, ringed by `1.5dp` surface cutout border). Hidden when soloed to a single account.
     - **Line 1 (Sender & Meta):**
       - Optional **Replied Indicator** (crisp `14dp` `Reply` icon in `--accent-text` when latest message is from self, matching desktop's `↩` behavior).
       - Sender name (`Title Small` `14sp`, SemiBold `600` if unread, Medium `500` if read, `--text-primary`).
       - Thread message count (`12sp`, `--text-muted`, `tabular-nums`) and `Draft` pill (`--danger` tint) when applicable.
       - Right-aligned metadata cluster: **AI Pre-Draft Ready** spark badge (amber tint `#F5B841` when a pre-draft exists), Attachment clip icon (`13dp`), relative timestamp (`Label Small` `11.5sp`, `tabular-nums`, `--text-muted`).
     - **Line 2 (Subject):** `Body Medium` `13.5sp`, SemiBold `600` (`--text-primary`) if unread, Regular `400` (`--text-secondary`) if read, single-line ellipsis.
     - **Line 3 (Snippet — Comfortable/Expanded):** `Body Small` `12.5sp`, `--text-muted`, 1 line (Comfortable) or 2 lines (Expanded). Prefixed with `You:` or `Draft:` when applicable.
     - **Inline 2FA Quick-Copy Pill (conditional):** When `signInCode` is detected, renders an interactive `36dp`-tall pill (padded to `48dp` hit slop) directly beneath the snippet showing monospace code (`482 917`) + Copy icon. Single tap copies digits without spaces, triggers `CONFIRM` haptic, and flashes `Copied` inline + snackbar.
5. **Account Row Styles (Mobile-Tuned, User-Configurable):**
   - **`gradient` (Default):** Soft horizontal wash from start edge (`12%` opacity `account.color` fading to `0%` at `45%` width; `14%` peak fading to `0%` by `68%` width on OLED `black` per `DESIGN.md`) + inset `3dp` rounded account pill (`8dp` vertical inset, `4dp` start inset) + `AccountBadge` on avatar.
   - **`bar`:** Clean transparent row background + inset `3dp` rounded vertical accent pill (`account.color`) at start edge + `AccountBadge` on avatar.
   - **`dot`:** Zero background wash or bar; account identity conveyed solely through the `AccountBadge` on the avatar (highest visual calm).
6. **Single Primary FAB:** One Material 3 Extended FAB (`Compose`, collapses to `56×56dp` icon FAB on downward scroll) positioned `16dp` above the bottom Navigation Bar, `16dp` from end edge.
7. **Undo Send Fuse Snackbar:** Anchored `12dp` above the Navigation Bar (pushing FAB upward cleanly via Material 3 `Scaffold` snackbar host). Displays status text (`Sending to Maya Okafor…` or `Archived 1 conversation`) alongside an **Undo** pill framed by an animated SVG countdown perimeter stroke (`undo-fuse-stroke`, default `5s` configurable `0–30s`).

#### Swipe-Triage Gestures & Android Edge-Back Safety
- **Edge-Safe Gesture Zone:** Android's system Predictive Back gesture owns the outer `24–32dp` display edges (`DESIGN.md` mandates `>=28dp` exclusion). Horizontal row-swipe recognition (`react-native-gesture-handler`) **ignores touch-down events within `36dp` of the left or right display edges** (strictly exceeding the `28dp` floor), guaranteeing Android's system Predictive Back gesture always wins on screen edges.
- **Interior Swipe Mechanics:** Starting inside `[36dp, width - 36dp]` with `>24dp` horizontal slop and `dx > 2 * dy`:
  - **Swipe Right (default: Archive):** Reveals Prism Mint (`--success`) tonal container + Archive icon; commits past `35%` row width with `GESTURE_THRESHOLD_ACTIVATE` haptic tick.
  - **Swipe Left (default: Trash / Delete):** Reveals Signal Coral (`--danger`) container + Trash icon; commits past `35%` row width with `GESTURE_THRESHOLD_ACTIVATE` haptic tick.
  - **Both directions fully customizable** in Settings (`Archive`, `Trash`, `Mark Read/Unread`, `Star`, `Snooze`, `Move to Folder`, `None`).
  - Every destructive/archive swipe writes atomically to SQLite `offline_queue` + persistent `mutation_guards` (preventing zombie-email resurrection across Android process kills) and posts an actionable **Undo Snackbar** (`5s`).

#### Unified Inbox — All Required States
| State | Visual & Behavioral Specification |
|---|---|
| **Default** | Date-grouped thread list with active Focus Strip, People/Updates filter, Compose FAB, and Bottom Nav. Pull-to-refresh (`PullToRefreshBox`) triggers incremental sync with subtle top progress indicator. |
| **Loading (Initial / Account Switch)** | 6 shimmer skeleton rows matching exact avatar (`40dp`), 2–3 text lines, and timestamp geometry (`--bg-elevated` pulse, no centered spinner). Cached SQLite rows render immediately (`<50ms`); syncing shows a thin `2dp` indeterminate linear indicator beneath the Focus Strip. |
| **Empty (Inbox Zero / Filtered)** | Calm centered illustration-free icon emblem (`48dp` rounded tonal container), concise title (`All clear in Inbox` or `No unread updates in Work`), 1-line guidance, and contextual recovery CTA (`Show all accounts` if filtered, or `View Archive`). |
| **Offline** | Non-blocking `32dp` slim status pill beneath Focus Strip (`Offline · Showing synced mail · 2 queued actions`). Reading, searching SQLite FTS5, drafting, and swipe-triage continue locally; mutations queue safely and replay on reconnect without resurrecting archived/trashed items. |
| **Error (Account Sync / Auth)** | Inline dismissible tonal warning banner at top of list naming the specific account and recovery action (e.g., `Work Gmail needs re-authentication` → `Sign in` button, or `IMAP sync paused — rate limited, retrying in 2m` → `Retry now`). Never blanks cached mail. |
| **Multi-Select** | Triggered by tapping any sender avatar OR long-pressing any row (`LONG_PRESS` haptic). Top App Bar transforms into a **Contextual Action Bar** (`Close`, `3 selected`, `Select All` toggle, `Mark Read/Unread`, `Archive`, `Trash`, `Overflow: Star / Snooze / Move`). Selected rows adopt `--bg-selected` fill and accent checkmark avatar. Compose FAB hides while selecting. Back gesture exits multi-select. |

---

### 2.2 Screen 2 — Thread Reader

#### Layout & Hierarchy
1. **Top App Bar (`64dp` + status bar inset):**
   - Leading (`48×48dp`): System-consistent Back arrow (`ArrowBack`).
   - Trailing (`48×48dp` each): `Archive`, `Move to Folder`, `Trash`, and `More` overflow sheet (`Mark unread`, `Snooze`, `Remind me`, `Summarize with AI`, `Print / Export`).
2. **Thread Subject & Context Header:**
   - Subject (`Title Large` `20sp`, SemiBold, up to 3 lines) + Star toggle (`48×48dp` touch target).
   - Compact metadata row: Account pill (`AccountBadge` + account name/email), folder chip (`Inbox` or custom folder), and **Privacy Tracker Pill** (`ShieldCheck` + `3 trackers blocked`, tappable to reveal blocked tracker domains & `Load remote images` option).
3. **Security / Scam Warning Banner (conditional):**
   - High-contrast `--danger` tinted container (`1dp` `--danger` border, `12dp` radius) directly under header when `scamWarning` is present, with warning icon, plain-English explanation, and `Move to Junk` action.
4. **AI Thread Summary Card (on-demand):**
   - Appears smoothly when user taps `Summarize` (or from Brief); displays gist paragraph, bulleted action items, and tappable key-date chips (`Create calendar event`).
5. **Inline AI Draft Ready Card (Signature Feature):**
   - Appears immediately above the latest message (or pinned below it when scrolled) whenever a background pre-draft exists or user taps `Draft with AI`.
   - **Header Row:** `Sparkles` icon + `AI Draft Ready` + subtle source tag (`Companion AI` / `On-device` / `BYO API`) + Dismiss (`×`, `48×48dp` hit target).
   - **Voice Profile Pill Strip:** Horizontally scrollable single-row chips (`Personal`, `Colleague`, `Customer`, `Executive`, custom profiles). Tapping a chip regenerates the draft in that learned voice with inline skeleton shimmer.
   - **Editable Draft Body:** Clean `15sp` (`line-height 1.55`) multi-line input on `--bg-main` surface so the user can tweak a word without opening full Composer.
   - **Action Row (`>=48dp` height targets):**
     - Primary filled button (`#2563EB` fill, `#FFFFFF` text, `5.17:1` WCAG AA): **`Send`** — queues immediately via the **Undo Send Fuse Snackbar** (`5s`).
     - Secondary tonal/outlined button: **`Edit`** (opens full Composer Sheet with draft pre-populated).
     - Icon button (`48×48dp`): **`Regenerate`** + overflow for `Always auto-draft sender` / `Mute sender`.
6. **Collapsible Message Stack:**
   - Multi-message threads automatically collapse older read messages into compact `56dp` rows (`ChevronRight`, `32dp` avatar, sender name, 1-line snippet, attachment clip, date). Tapping expands inline; an `Expand all / Collapse older` pill appears for threads with `>=3` messages.
   - Latest message (and any unread message) opens expanded, scrolled cleanly into view.
   - **Safe HTML Email Container:** Sandboxed `WebView` with CSP blocking scripts/forms, stripping tracking pixels, respecting `blockRemoteImages` (with per-message `Load images` + `Always trust sender` bar), auto-scaling wide newsletter tables to viewport width (`meta viewport` + horizontal pinch-zoom inside the message frame without breaking vertical page scroll), and luminance-aware dark-mode contrast adaptation so dark-on-dark newsletters remain readable across `dark`, `black`, and `graphite`.
   - **Attachment Strip:** Horizontal chips (`48dp` height) showing file icon, truncated name, size, and 1-tap download/preview via Android `FileProvider`.
   - **Calendar Invite Card (conditional):** When `calendarInvite` (`.ics`) is attached, renders inline Accept / Tentative / Decline pills + conflict preview from Combined Calendar.
7. **Sticky Bottom Quick-Reply Bar (`64dp` + nav bar / IME inset):**
   - Always thumb-reachable at the bottom of Thread Reader (replaces FAB on this screen).
   - Compact pill input (`Quick reply to Maya…`) + `Reply All` and `Forward` icon buttons (`48×48dp`). Tapping the input expands inline into a 3-line quick-reply box with Send + Expand-to-Composer buttons, keeping IME transitions smooth.
8. **Move to Folder Bottom Sheet:**
   - Search input at top (`Filter folders…`), Standard targets (`Inbox`, `Archive`, `Junk / Spam`, `Trash`), divider, and alphabetically sorted Custom Folders for the thread's account (`48dp` rows). Single tap moves thread, closes sheet, and shows Undo Snackbar.

#### Thread Reader — All Required States
| State | Visual & Behavioral Specification |
|---|---|
| **Default** | Subject header, privacy/scam indicators, collapsible older messages, expanded latest message, optional AI Draft Ready card, sticky Quick Reply bar. |
| **Loading** | Subject & sender header render immediately from `ThreadSummary` cache; message body area shows 4-line prose skeleton shimmer until full HTML/attachments hydrate. |
| **Empty / Deleted** | If thread is archived/deleted while viewing, transitions smoothly back to Inbox with Undo Snackbar (or advances to next thread on Expanded 2-pane tablet). |
| **Offline** | Cached thread HTML & text render normally; uncached attachments display `Available when online` disabled state; Quick Reply / AI Draft Send queues to outbox with `Queued — will send when online` snackbar. |
| **Error** | If remote body or AI draft fails, inline compact error banner inside that region (`Couldn't load full message` + `Retry`; `Companion AI unreachable` + `Reply manually` / `Retry`) without blocking the rest of the thread. |
| **Multi-Select** | N/A on single Thread Reader (text selection inside email body uses native Android action mode + `Copy`, `Search in EveryBox`, `Create Event`). |

---

### 2.3 Screen 3 — Compose / Reply Sheet

#### Layout & Hierarchy
1. **Top Account-Color Accent Hairline (`3dp`):** Full-width `account.color` bar at the very top edge of the sheet/screen, paired with a subtle `10%` leading wash in the Top App Bar so the user **always knows which account they are sending from** before hitting Send.
2. **Top App Bar (`56dp` + status bar inset):**
   - Leading (`48×48dp`): Close (`×`) button (autosaves draft if dirty).
   - Center: Mode label (`New Message`, `Reply`, `Reply All`, `Forward`) + autosave indicator (`Saved`).
   - Trailing: `Schedule Send` clock button (`48×48dp`) + Primary **`Send`** filled pill (`min-width 72dp`, `40dp` visual height inside `48dp` tap target, `#2563EB` fill, white text).
3. **`From` Account Switcher Row (`52dp`):**
   - Tappable full-width row showing `From`, `AccountBadge`, account name, email, and chevron.
   - Tapping opens a Material 3 **Send From Bottom Sheet** listing all connected accounts with color badges, signatures preview, and radio selection. Switching accounts immediately updates the `3dp` top hairline, header tint, and appended signature.
4. **Recipient Fields (`To`, collapsible `Cc` / `Bcc`):**
   - `To` row (`min-height 48dp`) with inline removable Material Input Chips (`valid` neutral chip; `invalid` red-outlined chip with alert icon and tap-to-edit) and trailing `Cc/Bcc` expand button (`48×48dp`).
   - Typing shows an inline contact autocomplete dropdown sourced from local message history.
5. **Subject Field (`52dp`):** Full-width `Title Medium` `16sp` SemiBold input (`Subject`), separated by `1dp` `--border-subtle` divider.
6. **Scrollable Rich-Text Body Area:**
   - `15.5sp` (`line-height 1.62`) comfortable prose editor, attachment preview chips strip when files are attached, and collapsible `Show quoted text (…)` pill for replies/forwards.
7. **AI Assist Quick-Tone Strip (Docked directly above Formatting Toolbar):**
   - Compact single-row horizontal scroll (`44dp` visual / `48dp` tap target) when AI is available (gracefully hidden when AI is off):
   - When body is empty (reply): `Draft reply`, `Sounds good`, `Ask details`, plus `Sparkles` custom prompt input toggle.
   - When body has text: `Shorter`, `Warmer`, `Polish`, `Fix grammar`.
   - Tapping any chip streams/replaces the draft with a 1-tap `Revert` pill so the user never loses what they typed.
8. **IME-Docked Formatting & Utility Toolbar (`52dp`):**
   - Stays pinned directly above the Android keyboard via `WindowInsets.ime`:
   - `Bold`, `Italic`, `Bullet List`, `Insert Link`, `Attach File` (Android Photo Picker + Document Picker), `Snippets` (`/shortcut` sheet), and `More` (Signature toggle, Priority).
9. **Schedule Send Bottom Sheet:**
   - Presets: `Later today (+3h)`, `Tomorrow morning (8:00 AM)`, `Monday morning (8:00 AM)`, and `Pick date & time` (native M3 DatePicker + TimePicker). Selecting a time sets a dismissible Schedule banner in the Composer and swaps `Send` to `Schedule`.

#### Compose Sheet — All Required States
| State | Visual & Behavioral Specification |
|---|---|
| **Default** | Account-colored top hairline, `From` selector, recipient chips, Subject, Body editor, AI quick-tone chips, IME-pinned formatting bar. |
| **Loading (AI Assist / Draft Hydration)** | AI Assist bar shows subtle animated progress shimmer (`Polishing draft…`) with `Cancel` chip; body editor remains readable and locked only during generation. |
| **Empty** | `Send` button stays enabled to validate on tap (or subtly disabled until at least 1 valid `To` recipient exists); tapping Send with missing recipient focuses `To` with inline helper message (`Add at least one valid recipient`). |
| **Offline** | Composing, attaching local files, and saving drafts work fully offline. Tapping Send queues the message in the encrypted outbox with snackbar `Offline — queued to send automatically`. AI tone chips display muted `AI offline` state unless on-device AI is active. |
| **Error** | Invalid recipient email highlights that specific chip in `--danger` with inline explanation; oversized attachment (`>25 MB`) shows actionable banner (`Attachment exceeds 25 MB limit` + `Remove`); SMTP/API send failure persists the message in Drafts/Outbox and posts an actionable notification (`Send failed — Tap to retry`). |

---

### 2.4 Screen 4 — Combined Calendar

#### Layout & Hierarchy
1. **Top App Bar (`64dp` + status bar inset):**
   - Leading: Month/Year selector button (`November 2026 ▾`, `48dp` height, toggles collapsible mini month grid).
   - Trailing (`48×48dp` targets): `Today` jump button (shows current day number inside calendar outline), Manual Sync icon, and Settings avatar.
2. **Multi-Account Focus Pill Strip (`52dp`):** Identical shared component as Inbox — toggling `Work` or `Personal` filters calendar events instantly.
3. **View Mode & Deduplication Bar (`48dp`):**
   - Leading Segmented Switcher: **`Agenda`** (default on phones for zero horizontal cramping) | **`3-Day`** (hourly time-block columns) | **`Week`** (compact 7-day overview / full grid on tablets).
   - Trailing **`Merged` / `Raw`** Toggle Pill (`48dp` tap target):
     - **`Merged` (Default, `--accent-soft` fill, `--accent-text`):** Deduplicates events matching title + start/end + all-day across multiple accounts, using **account-priority order** (matching the user's account list order) to select the lead color while displaying all participating account color dots (`6dp` circles) on the event card.
     - **`Raw` (`--bg-elevated`, `--text-secondary`):** Shows every account's occurrence separately for calendar troubleshooting.
4. **Compact Week Day Strip (`64dp`, Agenda & 3-Day modes):**
   - Horizontal 7-day strip (`Mon`–`Sun`, swipeable by week) with active day highlighted in `#2563EB` circle, plus up to 3 tiny account-colored event indicator dots beneath each day.
5. **Pinned All-Day Top Strip:**
   - Strictly separates all-day events above timed events (matching desktop parity), sorted by account priority. Displays compact full-border tinted chips (`32dp` height, `48dp` hit slop) with leading account icon/dot and multi-account occurrence dots when merged.
6. **Schedule Body:**
   - **Agenda Mode:** Chronological day-grouped timeline cards with left time column (`10:30 AM` / `45m`, `tabular-nums`), account-priority tinted surface (`8%` tint of `account.color` + `1dp` subtle border + leading `AccountBadge` — avoiding raw one-sided borders on rounded boxes), event title, location/video icon, multi-account dots, and inline 1-tap `Join` pill for meetings starting within 15 minutes or currently live. Current-time horizontal indicator bar (`--accent` dot + `2dp` hairline) sits between past and upcoming items.
   - **3-Day / Week Mode:** Hourly `60dp/hr` vertical grid with scrollable time axis, pinched vertical zoom, and non-overlapping stacked event blocks.
7. **Single Primary FAB:** One Material 3 FAB (`New Event`, `56×56dp`) opening the New Event bottom sheet (Title, Account picker, Date/Time, All-day toggle, Location, Notes).
8. **Event Detail Bottom Sheet (Modal Bottom Sheet):**
   - Drag handle (`32×4dp`) + `3dp` top `account.color` accent hairline.
   - Header: Account color dot, Event Title (`Title Large` `19sp`), status badge (`Confirmed` / `Tentative`), formatted Date, Time & Duration (`Thu, Nov 26 · 10:30 – 11:15 AM (45 min)`).
   - **Primary Action Row:** Full-width or prominent **`Join Meeting`** filled button (`48dp` height, `#2563EB`, Video icon) whenever `meetingUrl` is present, paired with `Copy Link` icon button (`48×48dp`).
   - **Metadata Rows (`48dp` min height):**
     - **Calendars:** Lists every account/calendar occurrence when merged (each with its color dot + calendar name + email).
     - **Location:** Tappable to open Maps/Browser + Copy button.
     - **Agenda & Notes:** Clean formatted prose with tappable links.
     - **Attendees:** Expandable list with RSVP status pills (`Accepted`, `Tentative`, `Awaiting`).
     - **Attachments:** Tappable file chips.
   - **Footer Actions (writable events only):** `Edit`, `Duplicate`, and `Delete` (with confirmation snackbar/dialog). Read-only ICS feeds clearly show `Read-only calendar feed`.

#### Combined Calendar — All Required States
| State | Visual & Behavioral Specification |
|---|---|
| **Default** | Week day strip, Merged toggle on, pinned All-Day strip, Agenda or 3-Day schedule with current-time indicator, New Event FAB. |
| **Loading** | Day strip renders immediately; schedule body shows 4 time-block skeleton cards with muted pulse. |
| **Empty** | `Your schedule is clear` with active focus context (`No events for Personal on Thu, Nov 26`) + `Show all accounts` (if filtered) or `New event` CTA. |
| **Offline** | Cached local SQLite events display cleanly with slim `Offline` chip; newly created/edited local events queue for CalDAV/Google sync on reconnect. |
| **Error** | Inline banner naming the failing calendar source (`Google Calendar sync failed for Work` + `Retry` / `Reconnect`) while keeping all other accounts' events visible. |

---

### 2.5 Screen 5 — Accounts & Settings (Plus Brief & Search Overview)

#### Accounts & Settings Topology
Reached via the Top App Bar Account/Settings button, organized into clean Material 3 grouped preference screens (no nested cards; full-width `56dp`–`72dp` list items separated by subtle dividers and `24dp` section spacing):

1. **Connected Accounts (Priority-Ordered):**
   - Drag handle (`GripVertical`) to reorder account priority (controls Focus Strip order & Calendar merge color winner).
   - Each row shows `AccountBadge`, Account Name, Email, Provider tag (`Gmail`, `Microsoft 365`, `IMAP`), and live sync status pill (`Synced 1m ago`, `Syncing…`, `Error`).
   - Tapping an account opens **Edit Account** (Display Name, 10-color swatch picker, 12 `AccountIcon` choices, Signature, Calendar toggle, CalDAV/ICS URLs, Remove Account).
   - **`+ Add Account` Sheet:**
     - **Google / Gmail** (OAuth 2.0 PKCE via Android Custom Tabs — zero embedded WebView login).
     - **Microsoft 365 / Outlook** (Microsoft Graph OAuth 2.0 PKCE for mail + calendar; gracefully replaces Windows-only Classic Outlook COM).
     - **IMAP / SMTP Providers** (1-tap presets for iCloud Mail, Yahoo Mail, Fastmail, Zoho Mail, AOL, GoDaddy, Network Solutions, Custom IMAP with automatic domain detection, encrypted credentials in Android Keystore, plus optional CalDAV / `.ics` feed).
2. **Appearance & Themes:**
   - **5-Theme Visual Picker:** Horizontal row of 5 tactile theme preview cards (`Dark`, `Black (OLED)`, `Graphite`, `Light`, `Paper`) showing mini surface + accent + text swatches and active checkmark.
   - **Follow System Theme:** Toggle allowing separate Light (`light` or `paper`) and Dark (`dark`, `black`, or `graphite`) pairings.
   - **Material You (Dynamic Color):** Opt-in toggle (**Off by default** per `DESIGN.md` to protect EveryBox's 10-swatch multi-account color palette from wallpaper collision).
   - **Account Row Style:** 3-way segmented preview (`Gradient`, `Bar`, `Dot`).
   - **List Density** (`Compact`, `Comfortable`, `Expanded`) & **Show Date Groups** toggle.
3. **Swipe Gestures & Reading:**
   - **Swipe Right Action** & **Swipe Left Action** pickers (`Archive`, `Trash`, `Mark Read/Unread`, `Star`, `Snooze`, `Move`, `None`) with live interactive preview row.
   - **Undo Send Window:** Segmented selector (`Off`, `5s`, `10s`, `20s`, `30s`) with independent per-send timers.
   - **Default Reply All** toggle & **Confirm before deleting** toggle.
4. **Private AI & Desktop Companion (Aligned with 4-Tier Architecture):**
   - **Tier 0 (Always On):** Deterministic zero-AI intelligence (People/Updates, 2FA extraction, tracker blocking, scam warnings) always runs locally at `$0`.
   - **Tier 1 — Companion Pairing Card:** Shows connection status to user's EveryBox Desktop (`Paired · Encrypted LAN / VPN`, `Searching…`, or `Not paired`) + `Pair with QR Code` CTA (Noise_XX / mTLS pinned in Android Keystore via Google Tink AEAD) for `$0` extra-cost desktop-class pre-drafts and summaries.
   - **Tier 2 — On-Device Mobile AI:** Shows Android AICore / Gemini Nano hardware support status + optional local 1B–3B GGUF download on `>=8GB` RAM devices (foreground on-demand only).
   - **Tier 3 — Self-Hosted Endpoint:** Direct LAN/VPN OpenAI-compatible server URL (`Ollama` / `LM Studio` / custom).
   - **Tier 4 — BYO Cloud API Keys (Optional):** Securely stored via Android Keystore + Google Tink AEAD (`Anthropic`, `Gemini`, `OpenAI`, `Grok`) for direct device-to-provider calls.
   - **Graceful Degradation:** When AI is off or Companion is offline, already-synced pre-drafts remain readable and live AI UI degrades calmly without blocking mail or nagging.
5. **Sync, Privacy & Notifications:**
   - **Background Sync Mode:** Default serverless `WorkManager` (15-min periodic + expedited outbox drain) with opt-in **Instant IMAP / Fast Mail** Foreground Service toggle clearly labeled with battery impact.
   - **Privacy:** `Block remote images` (default On), `Strip tracking pixels` (default On), `Trusted senders` manager, optional Biometric App Lock (`BiometricPrompt`).
   - **Notifications:** Per-account channels (`mail_people`, `mail_2fa` with 1-tap `Copy Code` using Android 13+ `EXTRA_IS_SENSITIVE` clipboard masking, `mail_updates` silent by default, `calendar_reminders`).

#### Brief (Tab 3) & Search (Tab 4) Essentials
- **Brief Tab:** Mobile-first digest of desktop's `TodayBrief` + `AutopilotView`: Greeting + active focus chips, `Recent 2FA codes` 1-tap copy pills, `Waiting on you` priority list (swipe to dismiss/mute), `AI Pre-Drafts Ready` queue, `Next up today` calendar items with 1-tap Join, and a compact `Autopilot & Voices` sub-tab for toggling Background Pre-Drafts, 2FA Auto-Clean, rules, and learned Voice Profiles.
- **Search Tab:** Sticky search bar auto-focused on tab entry, horizontal account-scope pills (`All Accounts`, `Work`, `Studio`, `Personal`), natural-language parsed filter chips (`from:maya`, `has:pdf`, `last week`), `Include Trash & Junk` toggle chip, recent searches, and instant SQLite FTS5 results showing folder badges (`Inbox`, `Archive`, `Trash`).

---

## 3. Component, Typography, Spacing & Motion Specifications

### 3.1 Color Tokens Across All 5 Themes (Material 3 Role Mapping & WCAG AA Audit)

EveryBox preserves its 5 signature **Nordic Prism** palettes (`dark`, `black`, `graphite`, `light`, `paper`) as first-class static schemes (Material You Dynamic Color is opt-in, default Off) while applying two critical mobile accessibility upgrades reconciled with `DESIGN.md`'s Android Platform Token Mapping and verified mathematically to **WCAG AA (`>= 4.5:1` normal text, `>= 3.0:1` large text & non-text UI)**:
1. **Mobile-Calibrated Muted & Secondary Text:** `onSurfaceVariant` maps directly to `--text-secondary` (`>=5.77:1`), and tertiary muted text (`--text-muted`) is lifted above `DESIGN.md`'s `>=4.6:1` floor to **`>= 5.28:1`** across all 5 themes while preserving each theme's neutral temperature.
2. **Filled Primary Button & FAB Container (`--accent-btn` = `#2563EB`):** Matches `DESIGN.md`'s cross-theme Nordic Cobalt Deep AA option (`#2563EB` with `#FFFFFF` text = **`5.17:1` WCAG AA** across all 5 themes), keeping `#3B82F6` for active icons, unread dots, focus rings, and borders on dark surfaces (`>= 4.8:1` on `black`). *(If a pure Material 3 high-luminance dark filled pill is preferred on system dialogs, `DESIGN.md` also documents `#60A5FA` with `#091526` onPrimary at `7.9:1` AAA; never mix both inside the same button group.)*

| EveryBox Token | Material 3 Role | `dark` | `black` (OLED) | `graphite` | `light` | `paper` | Min Contrast (AA) |
|---|---|---|---|---|---|---|---|
| `--bg-sidebar` | `surfaceContainerLowest` | `#11151D` | `#000000` | `#14181F` | `#F4F6FA` | `#F0EEE9` | Surface |
| `--bg-list` | `surfaceContainerLow` | `#151A24` | `#07080A` | `#181D26` | `#FAFBFD` | `#F6F5F0` | Surface |
| `--bg-nav` | `surfaceContainer` | `#1C2330` | `#0F1218` | `#202733` | `#F4F6FA` | `#F0EEE9` | Bottom Nav / Drawer |
| `--bg-main` | `surface` | `#181E29` | `#0B0D11` | `#1C222C` | `#FFFFFF` | `#FBFAF7` | Surface |
| `--bg-elevated` | `surfaceContainerHigh` | `#202837` | `#14171F` | `#242C38` | `#F1F4F9` | `#ECEAE3` | Surface |
| `--bg-hover` | `surfaceContainerHighest` | `#263042` | `#1C212C` | `#2B3442` | `#E7ECF4` | `#E4E1D8` | Surface |
| `--bg-selected` | `primaryContainer` | `#1C2F4F` | `#162642` | `#20324D` | `#DBEAFE` | `#DCE8FB` | Selection |
| `--border-subtle` | `outlineVariant` | `rgba(210,225,255,0.08)` | `rgba(210,225,255,0.12)` | `rgba(210,225,255,0.08)` | `rgba(15,23,42,0.07)` | `rgba(30,41,59,0.09)` | Structural |
| `--border-strong` | `outline` | `rgba(210,225,255,0.14)` | `rgba(210,225,255,0.18)` | `rgba(210,225,255,0.15)` | `rgba(15,23,42,0.13)` | `rgba(30,41,59,0.16)` | Structural |
| `--text-primary` | `onSurface` | `#EEF2F9` | `#F4F7FB` | `#EEF2F8` | `#0F172A` | `#1C222B` | `>= 12.5:1` |
| `--text-secondary` | `onSurfaceVariant` | `#9AA7BC` | `#9AA5B6` | `#9AA7BA` | `#475569` | `#525D6D` | `>= 5.77:1` |
| `--text-muted` (mobile) | `onSurfaceVariant` (caption) | `#8F9DB6` | `#8792A7` | `#93A0B5` | `#58657A` | `#566070` | `>= 5.28:1` |
| `--accent` | `primary` (icons/dots/focus) | `#3B82F6` | `#3B82F6` | `#3B82F6` | `#2563EB` | `#2563EB` | `>= 3.6:1` UI |
| `--accent-btn` | `primary` (filled CTA/FAB) | `#2563EB` | `#2563EB` | `#2563EB` | `#2563EB` | `#2563EB` | `5.17:1` w/ `#FFF` |
| `--accent-soft` | `secondaryContainer` | `rgba(59,130,246,0.18)` | `rgba(59,130,246,0.20)` | `rgba(59,130,246,0.18)` | `rgba(37,99,235,0.12)` | `rgba(37,99,235,0.13)` | Container |
| `--accent-text` | `onSecondaryContainer` / link | `#7CB8FF` *(on tint)* / `#60A5FA` | `#7CB8FF` / `#60A5FA` | `#7CB8FF` / `#60A5FA` | `#1D4ED8` | `#1D4ED8` | `>= 5.53:1` |
| `--danger` | `error` | `#F87171` | `#F87171` | `#F87171` | `#C81E22` | `#B91C1C` | `>= 5.09:1` |
| `--success` | `everyboxSuccess` | `#2DD4BF` | `#2DD4BF` | `#2DD4BF` | `#0F766E` | `#0F766E` | `>= 4.55:1` |
| `--amber` | `everyboxAmber` | `#F5B841` | `#F5B841` | `#F5B841` | `#D97706` | `#B45309` | Star / Autopilot |

> **OLED `black` Legibility Rule:** On true-black AMOLED screens (`#000000` chrome / `#07080A` list / `#0B0D11` main), drop shadows disappear. Hierarchy relies strictly on tonal surface elevation (`#07080A` → `#14171F` → `#1C212C`) plus slightly crisper hairline borders (`rgba(210,225,255,0.12)` subtle / `0.20` strong) so sheets, AI Draft cards, and bottom nav bars separate cleanly without neon haloing.

#### Account Identity Swatches (10 Canonical Colors)
`#3B82F6` (Blue), `#2DD4BF` (Teal), `#A78BFA` (Violet), `#34C77B` (Green), `#F5B841` (Amber), `#EC5C8A` (Rose), `#E87A48` (Orange), `#EF4444` (Red), `#818CF8` (Indigo), `#94A3B8` (Slate).
*Contrast note:* Inside `AccountBadge` (`18dp` filled circle), bright swatches (`#2DD4BF`, `#F5B841`, `#34C77B`) use dark ink `#0B1220` for the inner `10dp` icon (achieving `>7:1` icon contrast), while deeper swatches (`#3B82F6`, `#E87A48`, `#EF4444`, `#EC5C8A`, `#818CF8`) use `#FFFFFF`.

### 3.2 Typography Scale (`sp` Units — Material 3 Mapped)
- **Primary Typeface:** `Roboto` (Android system sans; `Roboto Flex` variable weights on Android 12+) for zero-latency native rendering and crisp legibility across all DPIs.
- **Monospace Face:** `Roboto Mono` strictly for 2FA sign-in codes, email headers, and IMAP port numbers (never decorative).
- **Dynamic Font Scaling:** Every text size uses `sp` (never fixed `px`/`dp`). Verified at `font_scale = 1.0`, `1.3`, and `1.5`:
  - Top App Bar titles truncate cleanly with ellipsis; bottom nav labels stay 1 line with `maxLines = 1`.
  - Focus pills grow in width naturally inside their horizontal scroll container.
  - Thread row metadata (time + attachment) stacks or shrinks cleanly without colliding with sender name.

| EveryBox Role | M3 Scale Role | Size (`sp`) | Line Height (`sp`) | Weight | Tracking | Usage |
|---|---|---|---|---|---|---|
| Screen / Brief Heading | `headlineSmall` | `22sp` | `28sp` | `600` | `-0.015em` | Today Brief greeting, Settings page title |
| Thread Subject | `titleLarge` | `19sp` | `25sp` | `600` | `-0.01em` | Thread Reader subject, Event Detail title |
| Top Bar / Sheet Title | `titleMedium` | `17sp` | `22sp` | `600` | `-0.005em` | Top App Bar (`Inbox`, `Nov 2026`), Bottom Sheet titles |
| Row Sender / Event Title | `titleSmall` | `14.5sp` | `20sp` | `600` unread / `500` read | `0` | Thread sender, Calendar event title, Composer `From` |
| Email Body / Draft | `bodyLarge` | `15sp` | `24sp` | `400` | `0` | Thread Reader prose, AI Draft editor, Composer body |
| Row Subject / Secondary | `bodyMedium` | `13.5sp` | `19sp` | `600` unread / `400` read | `0` | Thread subject line, Event description |
| Snippet / Helper | `bodySmall` | `12.5sp` | `17sp` | `400` | `0.005em` | Thread snippet, Settings descriptions |
| Buttons / Chips / Tabs | `labelLarge` | `13.5sp` | `18sp` | `600` | `0.005em` | Primary CTA, Focus pills, Segmented controls |
| Group Header / Nav Label | `labelMedium` | `12sp` | `16sp` | `600` | `0.01em` | Date groups (`Today`), Bottom Nav labels |
| Timestamp / Count / Badge | `labelSmall` | `11.5sp` | `14sp` | `500` | `0.015em` | Timestamps (`tabular-nums`), unread badges, 2FA pills |

### 3.3 Spacing, Touch Targets & Shape Tokens (`dp`)
- **Base Grid:** `4dp` unit (`4`, `8`, `12`, `16`, `20`, `24`, `32`).
- **Screen Horizontal Margin:** `16dp` on Compact phones; `24dp` on Medium/Expanded tablets.
- **Minimum Touch Target:** **`48×48dp`** on every interactive control (icon buttons, star toggles, avatar multi-select targets, focus pills, 2FA copy hit-slop, bottom nav destinations, sheet drag handles).
- **Minimum Inter-Target Gap:** `8dp` between adjacent clickable targets (e.g., Top App Bar action icons, AI Draft Ready buttons).
- **Corner Radii:**
  - `8dp`: Inline badges, 2FA code pills, date group headers, attachment chips.
  - `12dp`: Thread rows (`gradient`/`selected`), Calendar event blocks, Snackbars, Warning banners.
  - `16dp`: AI Draft Ready card, Compose FAB (`16dp` M3 squircle), Dialogs.
  - `24dp` (top corners only): Modal Bottom Sheets (Move to Folder, From Switcher, Event Detail, Focus Sheet).
  - `999dp` (full pill): Focus pills, Segmented tabs, Primary Send buttons, Recipient chips, Avatars.

### 3.4 Haptics & Material 3 Motion Choreography
Operate-mode motion conveys state and spatial continuity — fast (`150–280ms`), never decorative, and strictly respectful of Android's **Remove animations** (`Settings.Global.ANIMATOR_DURATION_SCALE == 0`) by substituting instant cuts or `100ms` crossfades and replacing the animated SVG Undo-Fuse perimeter stroke with a static countdown label (`Undo (5s)`).

| Interaction | Motion Spec | Haptic Constant |
|---|---|---|
| Bottom Nav tab switch | M3 Fade-Through (`180ms`, `FastOutSlowIn`) | `CLOCK_TICK` |
| Focus Pill tap (solo account) | List items crossfade + subtle `8dp` vertical settle (`180ms`, `EmphasizedDecelerate`) | `CLOCK_TICK` |
| Focus Pill long-press (multi-toggle) | Pill border & tint spring (`stiffness: 500, dampingRatio: 0.8`) | `LONG_PRESS` |
| Inbox → Thread Reader | M3 Shared-Axis X (`240ms` enter / `200ms` exit) + Predictive Back scrub | None |
| Row Swipe crosses commit threshold (`35%`) | Icon scales `0.85 → 1.12 → 1.0` (`140ms`), row collapses (`200ms`) on release | `GESTURE_THRESHOLD_ACTIVATE` |
| 2FA Code tap-to-copy | Pill background flashes `--success` tint (`220ms`), label flips to `Copied` | `CONFIRM` |
| AI Draft Ready `Send` / Composer `Send` | Sheet closes (`200ms`), Undo Send Snackbar rises (`220ms`) with linear `5s` SVG fuse | `CONFIRM` |
| Multi-select enter (long-press row) | Avatar flips to checkmark (`160ms`), Contextual Top Bar crossfades (`160ms`) | `LONG_PRESS` |
| Invalid recipient / Send error | Subtle `4dp` horizontal shake (`240ms`, 2 cycles) | `REJECT` |
| Bottom Sheets (Move / Event / From) | M3 Spring slide-up (`dampingRatio: 0.88, stiffness: 420`) + scrim fade (`180ms`) | None |

---

## 4. Verification Checklist (Pre-Implementation & Emulator QA)
- [ ] All 4 screens tested on physical Android phone & emulator across all **5 themes** (`dark`, `black`, `graphite`, `light`, `paper`).
- [ ] `adb shell settings put system font_scale 1.3` tested on Inbox, Thread Reader, Composer, Calendar, and Settings — zero clipped labels or overlapping badges.
- [ ] Predictive Back gesture verified from left and right screen edges on Inbox rows (zero conflict with Swipe-Right / Swipe-Left triage thanks to `36dp` edge inset).
- [ ] TalkBack screen reader traversal verified: Focus Strip announces `"Work account, 4 unread, double-tap to solo, double-tap and hold to combine"`, 2FA pill announces `"Copy sign-in code 4 8 2 9 1 7"`.
- [ ] Contrast verified `>= 4.5:1` for all body/caption/muted text and filled primary buttons across all 5 themes, including OLED `black`.
