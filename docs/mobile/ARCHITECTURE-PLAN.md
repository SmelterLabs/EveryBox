# EveryBox Mobile — Architecture & Build Plan

**Status:** Architecture Blueprint (Android-First → Mac Desktop & iOS Expansion)  
**Target Product:** EveryBox — *"Every inbox and calendar in one calm app — with multi-account focus toggles and $0 extra-cost private AI."*  
**Scope:** Public, commercial release built for any end user. Zero hardcoded personal credentials, hardware assumptions, or user-specific paths.

---

## 1. Executive Summary

EveryBox's desktop app (Electron 35 + React 19 + TypeScript 5.7 + Zustand + SQLite/FTS5) already validates the product's core loop: unified multi-account inbox with instant Focus Toggles, combined calendar, deterministic privacy/triage intelligence, and $0-extra-cost private AI.

To ship **Android first**, followed by **Mac desktop** and **iPhone (iOS)** without fragmenting the product or compromising mobile feel, this plan recommends:

1. **Primary Mobile Stack:** **React Native (New Architecture / Fabric + JSI) + Expo (Continuous Native Generation / Development Builds)** paired with a lean, purpose-built **Native Mail & Background Module (`everybox-mail-native`)** written in **Kotlin** (Android) and later **Swift** (iOS).
2. **Mac Desktop Path:** Reuse the existing Electron desktop app (`electron-builder --mac`, universal `arm64`/`x64`), replacing Windows-only Classic Outlook COM with the new cross-platform **Microsoft Graph OAuth2** provider shared with mobile.
3. **Sync & Reliability Architecture:** Local-first SQLite + FTS5 parity with desktop, upgraded with **SQLite-persisted mutation guards** and a **drain-before-pull offline outbox** so Android process kills and WorkManager wakeups can never trigger desktop's historical zombie-email resurrection race. Before Play Store / Google CASA verification, users can install direct signed **`.apk`** builds and connect Gmail immediately via **Gmail IMAP + App Password** (or a BYO OAuth client), alongside IMAP/SMTP and Microsoft 365.
4. **Zero-Server-Default Background Sync:** Native Kotlin `WorkManager` workers (15-min periodic + expedited outbox drain) writing through a **single bundled SQLite+FTS5 engine** (WAL mode, shared with JS) without spinning up the JS UI engine, plus bounded opt-in Foreground Service instant IMAP IDLE (with Android 15 `onTimeout()` fallback) and an optional Phase 4+ zero-knowledge FCM push wake-up relay for 24/7 <5s push.
5. **Private / $0-Extra-Cost Mobile AI:** Graceful degradation with AI completely off by default, layered with 4 user-controlled tiers: (1) encrypted QR **Companion Pairing** with EveryBox Desktop, (2) **on-device AI** (Android AICore / Gemini Nano where supported + opt-in local GGUF), (3) user's own LAN/VPN OpenAI-compatible server, and (4) **BYO cloud API keys** in Android Keystore.
6. **Zero-Breakage Monorepo:** Keep the existing Electron desktop at the repository root (`src/`, `package.json`, `npm run dev/build/typecheck/package` untouched), introduce npm workspaces (`packages/shared` + `apps/mobile`), and keep `src/shared/` as a thin re-export shim.

---

## 2. Local Environment Audit (Windows Build Host)

Audited on the current Windows development workstation:

| Tool / Prerequisite | Status | Observed Version / Details | Action Required |
| :--- | :--- | :--- | :--- |
| **Node.js** | Installed | `v24.17.0` | Ready (note: verify Expo/RN native module builds against Node 22 LTS if any native prebuild script warns on Node 24) |
| **npm / npx** | Installed | `12.0.2` | Ready (supports npm workspaces) |
| **Git** | Installed | `2.54.0.windows.1` | Ready |
| **Python** | Installed | `3.13.14` | Ready |
| **winget** | Installed | Available on PATH | Ready for automated SDK/JDK setup |
| **ADB (Android Debug Bridge)** | Installed | `1.0.41` / Platform-Tools `37.0.0` (on PATH under `%USERPROFILE%\.local\bin\adb.exe`); wireless-debugging Android device(s) detected and reachable | Ready for direct physical-device deployment |
| **Java / JDK 17** | **Missing** | `java` / `javac` not found; `JAVA_HOME` unset | **Install Eclipse Temurin JDK 17** (required by AGP 8.x & Gradle) |
| **Android SDK & Build Tools** | **Missing** | `ANDROID_HOME` / `ANDROID_SDK_ROOT` unset; `%LOCALAPPDATA%\Android\Sdk` and Android Studio not installed | **Install Android Studio or Android SDK Command-Line Tools** + API 35 platform & build-tools |
| **Gradle** | Not global | Not on PATH | Not needed globally — Expo/Android projects bundle `./gradlew` |
| **Expo / EAS CLI** | Not global | Not on PATH | Run per-workspace via `npx expo`; optionally install `eas-cli` for cloud signing/builds |
| **Flutter / Dart / Kotlinc** | Not installed | None found | Not required under the recommended React Native + Expo stack (Kotlin compiler is pulled automatically by Gradle) |

### Bootstrap Commands for Any Windows Developer Machine

```powershell
# 1. Install Temurin JDK 17 (LTS required by Android Gradle Plugin 8.x)
winget install --id EclipseAdoptium.Temurin.17.JDK -e

# 2. Install Android Studio (includes SDK Manager, AVD Emulator, and bundled JBR)
#    OR install command-line tools only if targeting physical ADB devices exclusively
winget install --id Google.AndroidStudio -e

# 3. Set persistent environment variables (adjust paths if customized)
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-17.0.14.7-hotspot", "User")
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")

# 4. Install required Android SDK packages (after Android Studio first-run or cmdline-tools extract)
sdkmanager --install "platform-tools" "platforms;android-35" "build-tools;35.0.0" "ndk;27.1.12297006"
sdkmanager --licenses
```

---

## 3. Stack Recommendation (Android-First → Mac Desktop & iOS Later)

### 3.1 Evaluation Matrix (Email & Calendar Specific)

| Criterion | **React Native + Expo CNG + Native Mail Module (RECOMMENDED)** | **Flutter** | **Kotlin Multiplatform (KMP) + Compose Multiplatform** | **Capacitor (WebView Shell)** |
| :--- | :--- | :--- | :--- | :--- |
| **IMAP / SMTP Raw TLS Sockets** | **Strong (via Native Module):** Hermes JS lacks Node `net`/`tls`, so `imapflow`/`nodemailer` cannot run in JS. A focused Expo Native Module delegates IMAP/SMTP to **Angus Mail (Jakarta Mail)** in Kotlin on Android and **MailCore2 / SwiftNIO** in Swift on iOS. | **Good:** Pure-Dart `enough_mail` works cross-platform, though less battle-tested against quirky enterprise IMAP servers than JavaMail/Angus Mail (used by K-9/Thunderbird Mobile). | **Excellent on Android:** Direct Kotlin access to Angus/Jakarta Mail. iOS requires bridging Swift/Obj-C mail libs or custom Kotlin/Native sockets. | **Weak natively:** Still requires writing the exact same native Kotlin/Swift IMAP/SMTP plugins, with zero JS socket reuse. |
| **Background Sync (Android WorkManager / iOS BGTask)** | **Strong (with Native Engine):** Because the Kotlin mail/sync module lives in native Android, `WorkManager` runs sync & notifications directly without booting React Native's JS runtime — avoiding RN's classic battery/OOM trap. | **Moderate:** Dart background isolates via `workmanager` incur Flutter engine cold-start overhead (~30–60MB RAM) and higher OEM kill rates. | **Excellent:** First-class Kotlin `WorkManager` on Android; native `BGTaskScheduler` on iOS. | **Moderate:** Requires native Android WorkManager + native SQLite access outside the WebView anyway. |
| **SQLite + FTS5 Parity** | **Excellent (with Single-Engine Rule):** `op-sqlite` or `expo-sqlite` (`enableFTS: true`) paired with a matching bundled native SQLite/SQLCipher binary (`sqlite-android` / `sqlcipher-android`) so JS and Kotlin `WorkManager` share identical SQLite + FTS5 binaries and `user_version` migrations. | **Good:** `drift` / `sqlite3_flutter_libs` supports FTS5, but all SQL queries and row mappers must be rewritten in Dart. | **Good:** Room (Android) or SQLDelight (KMP) supports FTS5, but schema/mappers are duplicated in Kotlin. | **Moderate:** Requires `@capacitor-community/sqlite` over async JS bridge; slower FTS5 pagination on large threads. |
| **HTML Email WebView Rendering** | **Excellent:** `react-native-webview` wraps native Android `WebView` / iOS `WKWebView` with CSP injection, tracker stripping, auto-height `postMessage`, dark-mode CSS injection, and pinch-zoom. | **Good (with caveats):** `webview_flutter` works, but nested scroll + dynamic height inside multi-message threads requires careful platform-view workarounds on Android. | **Moderate:** Easy on Android (`AndroidView(WebView)`), less ergonomic in Compose Multiplatform for iOS `WKWebView` sizing & input focus. | **Poor:** Nesting untrusted HTML emails inside an already-WebView app creates iframe scroll traps, gesture conflicts, and high memory pressure. |
| **60/120fps Swipe Triage & List Performance** | **Excellent:** New Architecture (Fabric) + `@shopify/flash-list` + `react-native-gesture-handler` + `react-native-reanimated` run swipe physics on the UI thread at 60–120fps. | **Excellent:** Impeller renders smooth 60–120fps custom lists and swipe gestures. | **Excellent on Android:** Compose `LazyColumn` + `SwipeToDismissBox` is native. iOS fidelity still lags SwiftUI/RN on complex sheets & haptics. | **Poor (Dealbreaker):** DOM/WebView list virtualization and touch swipe gestures feel noticeably sluggish compared to native mail apps and clash with Android's system back gesture. |
| **Code Reuse with Existing Desktop (TS / React 19 / Zustand)** | **Highest (~45–55% core logic + 100% types/classifier/prompts/themes/presets):** Shares `@everybox/shared` verbatim; same React 19 + Zustand mental model across Windows, Mac, Android, iOS. | **Zero:** Complete rewrite in Dart; forever maintaining two separate classifier regex suites, ICS parsers, search parsers, and type systems. | **Zero:** Complete rewrite in Kotlin; doubles team/tooling languages (TS/React for Windows+Mac, Kotlin for Android+iOS). | **High UI reuse, wrong ergonomics:** Desktop 3-pane mouse UI cannot simply shrink to a phone screen; mobile needs native sheets, bottom navigation, and thumb-zone swipe flows anyway. |
| **Roadmap Fit: Android → Mac → iOS** | **Optimal:** Android ships first with Kotlin native module; **Mac Desktop ships via existing Electron (`electron-builder --mac`)**; iOS reuses ~90% of `apps/mobile` JS/UI + adds Swift counterpart of `everybox-mail-native`. | **Split:** Android+iOS strong, but Mac Desktop would either remain Electron (2 stacks forever) or throw away existing Windows Electron investment. | **Split:** Android fastest, iOS harder for UI polish, Mac Desktop stays Electron (2 stacks forever). | **Poor quality ceiling** for a commercial Superhuman/Spark-class mobile client. |

### 3.2 Primary Recommendation & Architectural Boundary

**Decision: React Native (New Architecture) + Expo (SDK 53+, Continuous Native Generation / Development Builds) + `everybox-mail-native` Expo Native Module (Kotlin for Android, Swift for iOS).**

**Why this hybrid boundary is the decisive insight:**
- **What stays in shared TypeScript (`packages/shared` + `apps/mobile/src`):**
  - Canonical domain types (`Account`, `ThreadSummary`, `Message`, `CalendarEvent`, `Workspace`, `AppSettings`, `AutopilotSettings`, `ThreadPreDraft`, `VoiceProfile`, etc.)
  - Deterministic mail intelligence (`classifier.ts`: People vs. Updates, 2FA OTP extraction, tracking pixel stripping, scam/brand-impersonation warnings, `List-Unsubscribe` parsing)
  - HTML entity decoding & snippet cleanup (`html-entities.ts`)
  - ICS parsing/export & meeting URL extraction (`ical.js` — pure JS, works in Hermes)
  - Provider presets & Mozilla ISPDB autoconfig (`presets.ts`)
  - Deterministic search query parser (`from:`, `has:attachment`, `after:`, `is:unread`, etc.)
  - 5 EveryBox theme palettes (`dark`, `black`, `graphite`, `light`, `paper`) & account icon/row-style semantics
  - Zustand state management (Focus Toggles, active mailbox/category, optimistic mutations, independent per-send Undo timers)
  - All React Native UI screens (Inbox, Thread Reader, Composer, Combined Calendar, Brief/AI, Search, Settings)
  - REST API clients (Gmail API v1, Microsoft Graph Delta API, Google Calendar v3, CalDAV, BYO AI providers, Companion Pairing client)
- **What lives in Native Kotlin (`modules/everybox-mail-native/android`) — and later Swift for iOS:**
  1. **IMAP / SMTP Transport Engine** (Angus Mail / Jakarta Mail): TLS/STARTTLS sockets, RFC 6154 `\SpecialUse`, `UIDVALIDITY`/`UIDNEXT`/`CONDSTORE`, folder-scoped UID mutations, MIME parsing & attachment streaming.
  2. **Background Sync Worker (`WorkManager`)**: Executes incremental sync for Gmail, Microsoft Graph, IMAP, and Calendar on a 15-min periodic cadence + expedited outbox drain **directly against the shared WAL SQLite DB**, posting native notifications without launching the React Native JS engine. (For Gmail/Graph/CalDAV in background, lightweight Kotlin `OkHttp` calls reuse the same Keystore tokens and SQLite cursors; deterministic 2FA/People-vs-Updates heuristics are mirrored in a tiny <150-line Kotlin helper for instant notification classification, then reconciled cleanly by the shared TS classifier if needed.)
  3. **Hardware-Backed Secret Vault**: Android Keystore (TEE/StrongBox) + Google Tink AEAD (AES-256-GCM) over encrypted preferences/DataStore.
  4. **Rich Notification Actions & System Integration**: Actionable `BroadcastReceiver` (Archive, Mark Read, `RemoteInput` inline Reply, **1-tap Copy 2FA Code** with Android 13+ `EXTRA_IS_SENSITIVE`), Share Intent receiver (`.ics` import & share-to-compose), and optional Android AICore / Gemini Nano bridge.

> **Why Expo CNG (Development Builds) and NOT Expo Go?**  
> Expo Go cannot load custom Kotlin native modules (Angus Mail, WorkManager, Tink Keystore, Notification BroadcastReceivers). Expo's **Continuous Native Generation (`npx expo prebuild` / `npx expo run:android`)** gives full native Android/iOS project control while keeping declarative Expo config plugins, Expo Router, and clean local Gradle builds via ADB.

---

## 4. Sync, Accounts, Storage & AI Architecture

### 4.1 Account Providers on Android (and Cross-Platform Parity)

| Provider | Auth Method on Android | Mail & Folder Sync | Calendar Sync | Notes / Pitfalls |
| :--- | :--- | :--- | :--- | :--- |
| **Gmail** (`provider: 'gmail'` or `'imap'` pre-Play Store) | **Pre-Play Store / Direct `.apk`:** Connect immediately via **Gmail IMAP + App Password** (built-in preset, zero Google CASA wait) or user-supplied BYO Google OAuth Client ID. **Play Store Release:** **OAuth 2.0 + PKCE (RFC 7636)** via AppAuth / Chrome Custom Tabs (**no client secret** embedded in mobile binary; dedicated Google Cloud **Android OAuth Client** bound to `app.everybox.mobile` + signing SHA-1). | Gmail OAuth uses REST v1 incremental sync (`users.history.list` + `gmail_history_id`, persisted `429`/`403` backoff, `DRAFT` reconciliation); Gmail IMAP+App Password syncs via native Kotlin Angus Mail (`UIDVALIDITY`/`CONDSTORE`). | Two-way Google Calendar REST v3 (`syncToken`) under OAuth, or Google CalDAV / ICS feed under IMAP+App Password. | Never use embedded WebViews (Google blocks with `disallowed_useragent`). Direct signed `.apk` builds let users run Gmail (IMAP + App Password or BYO OAuth), Microsoft 365, and IMAP/SMTP immediately while Play Store Google OAuth + CASA Tier 2 verification proceeds in parallel. |
| **Microsoft 365 / Outlook.com** (`provider: 'microsoft'`) | **Entra ID OAuth 2.0 + PKCE** (`common` tenant) via MSAL / AppAuth (Chrome Custom Tabs). Replaces Windows-only `outlook-local` COM/MAPI and should also be backported to Windows & Mac desktop. | **Microsoft Graph Delta Queries** (`/me/mailFolders/{id}/messages/delta`) with persisted `@odata.deltaLink` per folder. Reads Graph's `inferenceClassification` (`focused` \| `other`) to honor EveryBox's `outlookFocusedMode` (`all` \| `focused-only` \| `other-to-updates`). | Two-way Microsoft Graph Calendar Delta (`/me/calendarView/delta`), event create/update/delete, online meeting URLs (`onlineMeeting.joinUrl`). | **Enterprise tenant pitfall:** Some corporate M365 tenants block unverified apps. Mitigate via **Microsoft Publisher Verification (MPN)**, a clear "Request IT Admin Approval" link (`.../common/adminconsent`), and IMAP fallback if tenant allows it. |
| **IMAP / SMTP** (`provider: 'imap'`) | Password or App Password stored in Android Keystore (supports separate SMTP credentials via `smtpSeparateAuth` + `smtpUsername`). Optional XOAUTH2 ready. | Native Kotlin **Angus Mail** (`everybox-mail-native`). RFC 6154 `\SpecialUse` discovery; incremental sync via `UIDVALIDITY` + `UIDNEXT` + `CONDSTORE`/`HIGHESTMODSEQ` where supported; windowed mobile fetch (50 Inbox, 25 Sent, 15 Drafts/Junk/Trash) with on-demand older scroll/body fetch. Folder-scoped UID mutations (`messageFolders`). | Local SQLite calendar enabled by default (matching desktop); optional two-way **CalDAV** (`ETag`/`ctag` sync) + read-only **ICS feeds** + `.ics` file/attachment import & export via Android Storage Access Framework (SAF). | Ship built-in **Provider Presets** (iCloud, Fastmail, Yahoo, Zoho, Network Solutions, GoDaddy, Namecheap, Custom) + Mozilla ISPDB / DNS SRV auto-discovery (`_imaps._tcp`, `_submissions._tcp`) so users rarely enter server hostnames manually. |

### 4.2 Local Storage & Schema Parity (SQLite + FTS5)

Mobile uses the **exact same relational model** as `src/main/db/database.ts`, stored in app-private storage with strict **Single-Engine Binary & Path Parity** between the React Native UI and native Kotlin `WorkManager`:

- **Single Bundled SQLite Engine (NEVER use Android framework `android.database.sqlite.SQLiteDatabase`):** Android's OS-bundled SQLite varies across OEMs and API levels — older OEM builds often omit `FTS5` or ship mismatched tokenizers/versions relative to JS's bundled SQLite, which can throw `no such module: fts5` or corrupt FTS shadow tables when Kotlin writes to `messages_fts`. Both JS and Kotlin MUST open the database using a **single bundled SQLite 3.46+ binary with FTS5 compiled in**:
  - **Phase 0–3:** `everybox-mail-native` embeds `io.requery:sqlite-android` (compiled with FTS5 + `unicode61`), or routes all DB access through a single shared native SQLite/SQLCipher library paired with `op-sqlite` / `expo-sqlite` configured with identical FTS5 compile flags (`SQLITE_ENABLE_FTS5`, standard `unicode61` tokenizer, pure-SQL triggers only — zero JS-only custom SQLite functions).
  - **Phase 4 (Encryption Upgrade):** Swap cleanly to **`net.zetetic:sqlcipher-android`** (key unwrapped from Android Keystore) shared across both JS (`op-sqlite` SQLCipher build) and Kotlin `SyncWorker`.
- **Explicit Canonical DB Path & `PRAGMA user_version` Alignment:**
  - Canonical path passed explicitly to both JS and Kotlin: `${context.filesDir}/SQLite/everybox.sqlite` (never rely on implicit per-library default directories).
  - Schema versioning via **`PRAGMA user_version`**: both JS and Kotlin read `PRAGMA user_version` on open and execute the exact same ordered migration table derived from `@everybox/shared/storage-schema.ts`. If either runtime encounters a `user_version` newer than its compiled schema, it refuses to write rather than risk corruption.
- **Concurrency Pragmas (enforced in both JS and Kotlin open hooks):**
  - `PRAGMA journal_mode = WAL;` (concurrent reads from React Native UI while Kotlin `WorkManager` writes)
  - `PRAGMA foreign_keys = ON;`
  - `PRAGMA busy_timeout = 5000;` (prevents `SQLITE_BUSY` across UI + background sync boundaries)
- Full table parity: `kv_settings`, `accounts`, `workspaces`, `folders`, `threads`, `messages`, `messages_fts` (FTS5), `attachments`, `calendar_events`, `scheduled_emails`, `snippets`, `offline_queue`, `reminders`, `thread_predrafts`, `autopilot_rules`, `autopilot_logs`, `voice_profiles`.

**Additive Mobile Migrations (Safe & Backwards-Compatible with Desktop Schema):**
1. `accounts`: add `graph_delta_links_json TEXT`, `imap_sync_state_json TEXT` (`{ [folderPath]: { uidValidity, lastUid, highestModSeq } }`), `calendar_sync_token TEXT`.
2. `offline_queue` (upgraded durable outbox):
   ```sql
   CREATE TABLE IF NOT EXISTS offline_queue (
     id TEXT PRIMARY KEY,
     account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     entity_type TEXT NOT NULL,           -- 'thread' | 'message' | 'send' | 'calendar_event'
     entity_id TEXT NOT NULL,
     action TEXT NOT NULL,                -- 'archive' | 'trash' | 'delete' | 'move' | 'read' | 'unread' | 'star' | 'unstar' | 'snooze' | 'send' | 'cal_create' | 'cal_delete'
     payload_json TEXT NOT NULL,          -- includes messageFolders snapshot for IMAP UID routing
     status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'in_flight' | 'failed'
     attempts INTEGER NOT NULL DEFAULT 0,
     next_retry_at INTEGER NOT NULL DEFAULT 0,
     last_error TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_offline_queue_drain
     ON offline_queue(account_id, status, next_retry_at, created_at ASC);
   ```
3. `mutation_guards` (persisted zombie-email shield):
   ```sql
   CREATE TABLE IF NOT EXISTS mutation_guards (
     guard_key TEXT PRIMARY KEY,          -- 'thread:<threadId>' or 'remote:<accountId>|<remoteId>'
     account_id TEXT NOT NULL,
     folder_role TEXT,
     folder_name TEXT,
     is_deleted INTEGER DEFAULT 0,
     is_read INTEGER,
     is_starred INTEGER,
     queue_id TEXT,                       -- non-null while corresponding offline_queue item is pending/in_flight
     recorded_at INTEGER NOT NULL,
     expires_at INTEGER                   -- NULL while queue_id is active; set to now + 90_000 on remote ack
   );
   CREATE INDEX IF NOT EXISTS idx_mutation_guards_exp ON mutation_guards(expires_at);
   ```

### 4.3 Solving the Offline Mutation & Zombie-Email Race on Mobile

Desktop fixed its zombie-email resurrection bug (`journal/2026-11-25.md`) using in-memory `recentMutations` / `recentDeletedRemoteIds` maps (90s TTL) plus pausing background polls during in-flight remote mutations. **On Android, in-memory maps are insufficient** because Android can terminate the app process seconds after an offline swipe-delete, and `WorkManager` later runs in a fresh process.

**EveryBox Mobile's 4-Part Convergence Protocol:**
1. **Atomic Local Optimism:** Every user mutation (Swipe Archive/Trash/Move, Mark Read/Unread, Star, Snooze, Send, Delete Draft) executes in a **single SQLite transaction**:
   - Updates `threads` / `messages` immediately (instant 0ms UI update).
   - Appends an idempotent record to `offline_queue` (capturing `messageFolders` snapshot for IMAP folder-scoped UID actions).
   - Upserts a `mutation_guards` row with `expires_at = NULL` (locked indefinitely while the mutation awaits network sync).
2. **Strict Drain-Before-Pull:** Whenever foreground sync or `WorkManager` syncs an account:
   - Step A: Acquire per-account sync mutex; drain all `pending` rows in `offline_queue` for that account in FIFO order (`status = 'in_flight'`).
   - Step B: On remote acknowledgment, delete the `offline_queue` row and stamp `mutation_guards.expires_at = now + 90_000` (absorbs stale remote snapshots already in transit on Gmail/IMAP servers).
   - Step C: Only after `offline_queue` for that account has zero `pending`/`in_flight` rows (or retryable network failure defers cleanly without aborting guard protection) does remote delta pull run.
3. **Persistent Guard Enforcement:** Both `upsertMessageAndThread` and `reconcileFolderMessages` consult `mutation_guards` in SQLite before overwriting `folder_role`, `is_read`, `is_starred`, or resurrecting a deleted `remote_id`. Expired guards (`expires_at IS NOT NULL AND expires_at < now`) are pruned automatically.
4. **Independent Undo-Send Timers & Draft Cleanup:** Each queued Send gets an independent `undoSendSeconds` (default 5s) delay before transitioning from `undo_window` to `pending` (preventing rapid-fire sends from cancelling each other). When a draft is sent, `draftThreadId` and `draftRemoteId` are passed through the outbox to delete the remote Gmail/Graph/IMAP draft and local row cleanly.

### 4.4 Secrets & Device Security on Android

- **Hardware-Backed Keystore (NOT deprecated `EncryptedSharedPreferences`):** `androidx.security:security-crypto` (`EncryptedSharedPreferences`) was deprecated by Android Jetpack. EveryBox Mobile uses **Google Tink (`tink-android`) AEAD (AES-256-GCM)** backed by **Android Keystore (`AndroidKeysetManager` with TEE / StrongBox hardware master key)** wrapping Jetpack DataStore (exposed via `everybox-mail-native`).
- **Stored Secrets:** OAuth access/refresh tokens (`google_tokens:*`, `ms_tokens:*`), IMAP/SMTP passwords (`imap_pass:*`, `smtp_pass:*`), CalDAV passwords (`caldav_pass:*`), BYO AI API keys, and Companion Pairing X25519/Ed25519 identity & session keys.
- **Backup Isolation:** `android:allowBackup="false"` plus strict `android:dataExtractionRules` (`data_extraction_rules.xml`) excluding `everybox.sqlite`, attachment caches, and Keystore keysets from Android Auto Backup and unencrypted device-to-device transfers.
- **HTML Email Sandboxing:** Emails render inside an isolated `react-native-webview` with strict CSP (`default-src 'none'; img-src data: cid: https:; style-src 'unsafe-inline'; script-src 'none'`), JavaScript disabled for email content (only a minimal sealed height-observer injected cleanly or native WebView `contentHeight` callback), tracking pixels stripped prior to render, and remote images gated by `PrivacySettings.blockRemoteImages` + `trustedImageSenders`.
- **Phase 4 Hardening:** Optional **SQLCipher** database-at-rest encryption (key unwrapped from Android Keystore) and optional **Biometric App Lock** (`BiometricPrompt` + `FLAG_SECURE` screen-capture protection option).

### 4.5 Background Sync, Battery/Doze Strategy & Notifications

Android's **Doze Mode**, **App Standby Buckets**, and OEM aggressive battery managers impose a hard 15-minute minimum on `WorkManager` periodic tasks and forbid silent persistent background TCP sockets without a visible Foreground Service.

**Hybrid 3-Mode Sync Strategy (Privacy-First Default):**
1. **Foreground Active Sync (Instant):** Immediate delta sync on app open/resume + pull-to-refresh + adaptive 45–60s poll + optional IMAP IDLE while app is in foreground.
2. **Background Default — Serverless `WorkManager` (Battery-Friendly, Zero Cloud):**
   - `PeriodicWorkRequest` every **15 minutes** (constraints: `NetworkType.CONNECTED`, `BatteryNotLow` optional toggle) running natively in `everybox-mail-native` Kotlin `SyncWorker`.
   - Expedited `OneTimeWorkRequest` triggered immediately whenever `offline_queue` or `scheduled_emails` has due work (e.g., user hits Send and immediately locks the phone).
   - Strictly obeys persisted Gmail `sync_backoff_until` so background wakeups never reset Google `429` lockouts.
3. **Opt-In Power Modes (User-Controlled — Android 15+ Compliant):**
   - **Instant IMAP / Fast Mail Mode (Opt-In, Zero Cloud — with Android 15 Quota Handling):**
     - **Android 15 (API 35) `dataSync` 6-Hour Timeout Trap:** Starting in Android 15 (API 35), `foregroundServiceType="dataSync"` is capped at a **6-hour rolling quota per 24-hour window**; when exhausted, Android invokes `Service.onTimeout(startId, fgsType)` and crashes the app with `RemoteServiceException` if the service does not promptly call `stopSelf()`.
     - **Required Architecture:**
       1. Use `dataSync` FGS strictly for **bounded sync operations** (initial mailbox hydration, large attachment downloads, explicit user-triggered catch-up) AND implement `Service.onTimeout(startId, fgsType)` to cleanly close IMAP sockets, flush sync cursors, call `stopSelf()`, and **automatically fall back to 15-min `WorkManager` sync** with a calm status notice (*"Instant sync paused by Android battery quota — checking every 15 min"*).
       2. For opt-in persistent IMAP IDLE without hitting the 6-hour `dataSync` ceiling, evaluate **`foregroundServiceType="remoteMessaging"`** (intended for long-lived real-time messaging transports; requires explicit Google Play Console Foreground Service declaration & review justifying live email/2FA delivery, and remains subject to OEM battery policies).
   - **Zero-Knowledge Push Wake-Up Relay (Phase 4+ Canonical 24/7 <5s Push):** Opt-in lightweight cloud tick relay subscribing to Gmail Pub/Sub & Microsoft Graph change notifications and sending an empty high-priority FCM wake-up ping. Because FCM wake-ups require no persistent Foreground Service, this is the **Play-Store-safe, Android 15+-compliant path to true 24/7 sub-5-second push**. The relay **never** holds OAuth tokens, email bodies, or subjects — it only tells the phone *"account X has new mail, wake up and fetch directly."*

**Notification Channels & Actionable 2FA Copy:**
- **Channels:** `mail_people` (High/Default), `mail_2fa` (High priority, heads-up), `mail_updates` (Low/Silent by default), `calendar_reminders` (High), `sync_service` (Min/Silent).
- **Direct Notification Actions (Kotlin `BroadcastReceiver` — zero UI launch required):**
  - Standard People email: **Archive**, **Mark Read**, **Reply** (inline `RemoteInput` directly from the lock screen/shade, routed through `offline_queue`).
  - **2FA / Sign-In Code Alert:** When `extractSignInCode` matches an incoming message, the notification highlights the code (e.g., `481 207`) and provides a 1-tap **"Copy 481 207"** button that writes to Android `ClipboardManager` with `ClipDescription.EXTRA_IS_SENSITIVE = true` (Android 13+ masks the OTP in the clipboard overlay) and optionally schedules `autoClean2FAHours` cleanup.

### 4.6 Private / $0-Extra-Cost AI on Mobile

Phones have tighter RAM, thermal, and battery envelopes than desktops, and mobile OSes cannot spawn desktop CLI tools (`claude`, `codex`, `ollama`). EveryBox Mobile preserves the **"$0 extra-cost private AI"** promise for any public user via **Graceful Degradation + 4 User-Controlled Tiers**:

| Tier | Mode | How It Works for Any Public User | Cost / Privacy | Best For |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 0 (Always On)** | **Deterministic Zero-AI Intelligence** | Runs `@everybox/shared/classifier.ts` & `search-parser.ts` locally in 0ms: People vs. Updates, 2FA extraction, tracker blocking, phishing warnings, `.ics` meeting extraction, structured search. When AI is **Off**, all AI UI hides cleanly with zero nagging. | **$0 / 100% On-Device** | Every user, even with AI disabled. |
| **Tier 1 (Best $0 Quality)** | **Encrypted Companion Pairing with EveryBox Desktop** | Opt-in local HTTPS/WSS **Companion Bridge** built into EveryBox Desktop (Windows/Mac), advertised on LAN via mDNS (`_everybox._tcp`) with optional user-entered VPN/LAN hostname (e.g., Tailscale/WireGuard — never vendor-locked). Paired via 1-time **QR code** using Noise_XX / mTLS certificate pinning stored in Android Keystore. Syncs desktop-generated `thread_predrafts`, `voice_profiles`, and morning Briefs to mobile in the background, and proxies on-demand Summarize / Draft / Polish requests to Desktop's configured local LLM or CLI subscription. | **$0 / Local LAN or User's Own VPN (E2E Encrypted)** | Users who also run EveryBox Desktop — gives desktop-class 30B+ local LLM or CLI-backed pre-drafts on the phone with ~0% mobile battery drain. |
| **Tier 2 (Standalone Private)** | **On-Device Mobile AI** | **Path 2A — Android AICore / Gemini Nano (ML Kit GenAI):** Runtime feature-detected on supported Android devices (Pixel 9+, Galaxy S25+, Snapdragon 8 Elite/Gen3+ AICore devices). Zero APK bloat (OS-managed weights), NPU-accelerated, ideal for thread gists and short smart replies. **Path 2B — Optional Local GGUF (`llama.rn` / MediaPipe LLM):** User opt-in download of a compact 1B–3B Q4 model (e.g., Qwen2.5-1.5B/3B or Llama-3.2-3B) on devices with ≥8GB RAM, strictly foreground on-demand (never background auto-drafting on battery). | **$0 / 100% On-Device (Works Offline)** | Standalone mobile-only users who want private AI without a desktop or cloud keys. |
| **Tier 3 (Self-Hosted)** | **Direct Local/LAN OpenAI-Compatible Endpoint** | Same `local-openai` / `ollama` / `lmstudio` URL settings as desktop — connects directly over home Wi-Fi or user's own VPN to any self-hosted inference server. | **$0 / User-Owned Server** | Homelab / self-hosted LLM users. |
| **Tier 4 (BYO Cloud)** | **BYO Cloud API Keys** | User supplies their own Anthropic, Gemini, OpenAI, or xAI (Grok) API key (stored in Android Keystore). Direct device-to-provider HTTPS calls — EveryBox operates no proxy and never sees mail or keys. | **Direct Provider Rates (No EveryBox Markup)** | Mobile-first users who want frontier cloud quality anywhere. |

**Companion Pairing Security & Failure Contract:**
- Pairing requires physical access to Desktop QR + 6-digit visual confirmation code.
- Revoking a paired phone on Desktop immediately invalidates its pinned public key.
- If Desktop is asleep or offline when Mobile opens a thread: any already-synced `thread_predraft` still displays instantaneously from local SQLite; live AI actions gracefully fall back to the next configured tier (e.g., AICore or BYO key) or show a calm *"Desktop companion offline"* status pill without blocking reading or replying.

---

## 5. Repository & Shared-Core Layout

### 5.1 Option Comparison: Root-Preserving Monorepo vs. Full Move vs. Sibling Repo

| Option | Pros | Cons | Verdict |
| :--- | :--- | :--- | :--- |
| **A. Root-Preserving npm Workspaces Monorepo** (`packages/shared` + `apps/mobile`, Desktop remains at root) | **Zero breakage** to existing `npm run dev/build/typecheck/package/mcp`, `launch-everybox.bat`, `electron.vite.config.ts`, or git history. Atomic PRs across Desktop + Mobile when `types.ts` or `classifier.ts` changes. `package.json` `"files"` whitelist already excludes `apps/mobile` from Windows/Mac installers. | Requires monorepo-aware Metro config in `apps/mobile/metro.config.js` and aligned React 19 version (solved by Expo SDK 53+ which uses React 19.0, matching Desktop's `react@19.0.0`). | **RECOMMENDED** |
| **B. Full Restructure** (`apps/desktop` + `apps/mobile` + `packages/shared`) | Textbook symmetrical tree. | Disrupts every existing path, `electron-builder` resource lookup, `current-work.md` uncommitted changes, and git blame right before mobile kickoff. | Defer until post-Phase 2 (optional cleanup) |
| **C. Sibling Repo** (`../EveryBox-Mobile`) | Zero risk of Metro/Electron dependency hoisting collisions. | Splits design docs, `types.ts`, `classifier.ts`, `themes.ts`, and `presets.ts` across repos; requires publishing private npm packages or manual copy-paste drift. | Rejected (high drift risk) |

### 5.2 Target Directory Tree (`EveryBox/` Repository Root)

```text
EveryBox/
├── package.json                        # Keeps all existing desktop scripts untouched!
│                                       # Adds: "workspaces": ["packages/*", "apps/*"]
│                                       # Adds convenience scripts: "mobile:android", "mobile:typecheck", "shared:test"
├── electron.vite.config.ts             # Unchanged (resolves @shared -> packages/shared/src via src/shared shim)
├── tsconfig.node.json                  # Unchanged
├── tsconfig.web.json                   # Unchanged
├── PRODUCT.md                          # Canonical product definition (all platforms)
├── DESIGN.md                           # Canonical design system & 5 theme palettes
├── TECHNICAL-GUIDE.md                  # Desktop + shared architecture docs
├── src/                                # Existing Electron Desktop (Windows + Phase 4 Mac) — ZERO path moves
│   ├── main/
│   ├── preload/
│   ├── renderer/
│   └── shared/                         # Thin re-export shims: `export * from '../../packages/shared/src/types'`
├── packages/
│   └── shared/                         # @everybox/shared (pure TypeScript — zero Node/DOM/RN-only imports)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── types.ts                # Canonical domain interfaces (+ AccountProvider 'microsoft')
│           ├── themes.ts               # All 5 theme palettes (dark, black, graphite, light, paper) + semantic tokens
│           ├── html-entities.ts        # cleanSnippet, decodeHtmlEntities
│           ├── classifier.ts           # classifyCategory, extractSignInCode, stripTrackingPixels, detectScamWarning, parseListUnsubscribe, parseIcsInvite
│           ├── ics.ts                  # extractMeetingUrl, ICS VEVENT/RRULE ingestion & RFC 5545 export helpers
│           ├── presets.ts              # IMAP/SMTP/CalDAV provider presets (iCloud, Fastmail, Yahoo, Zoho, etc.)
│           ├── search-parser.ts        # Deterministic structured query parser (from:, has:attachment, after:, is:unread)
│           ├── ai-prompts.ts           # Shared system/user prompt builders (brief, thread summary, draft reply, polish)
│           └── storage-schema.ts       # Shared SQLite DDL constants & migration version registry
├── apps/
│   └── mobile/                         # @everybox/mobile — Expo SDK 53+ (React 19, RN New Arch, Android-first)
│       ├── package.json
│       ├── app.config.ts               # Dynamic Expo config (package: app.everybox.mobile, bundleId: app.everybox.mobile, enableFTS: true)
│       ├── metro.config.js             # Monorepo Metro config (watchFolders: [../../packages/shared], single React instance)
│       ├── tsconfig.json
│       ├── app/                        # Expo Router file-based navigation
│       │   ├── _layout.tsx             # ThemeProvider + GestureHandlerRootView + SQLite bootstrap
│       │   ├── (tabs)/
│       │   │   ├── index.tsx           # Unified Inbox + Account Focus Toggle rail + People/Updates
│       │   │   ├── calendar.tsx        # Combined Calendar (Agenda / Day / Month + Join Meeting)
│       │   │   ├── brief.tsx           # Daily Brief & Waiting on You / Reminders (gracefully adapts when AI off)
│       │   │   └── search.tsx          # Instant FTS5 Search + Filter Pills
│       │   ├── thread/[id].tsx         # Thread Reader (sandboxed WebView + 2FA banner + AI Draft card + Quick Reply)
│       │   ├── compose.tsx             # Modal Composer (To/Cc/Bcc chips, Account switcher, AI Assist, Schedule/Send)
│       │   ├── settings/               # Accounts, Themes/Row Style, AI & Companion Pairing, Privacy, Swipe Actions
│       │   └── onboarding.tsx          # First-run welcome + Demo Inbox or Add Account
│       ├── src/
│       │   ├── store/useMobileStore.ts # Zustand store mirroring desktop Focus Toggles & optimistic mutation semantics
│       │   ├── db/mobileDatabase.ts    # expo-sqlite / op-sqlite WAL wrapper + mutation_guards + offline_queue + FTS5
│       │   ├── sync/                   # gmailRest.ts, graphDelta.ts, caldavClient.ts, syncCoordinator.ts
│       │   ├── ai/                     # companionClient.ts, onDeviceAi.ts, cloudAi.ts, aiRouter.ts
│       │   └── components/             # ThreadRow (FlashList + swipe), FocusPillBar, AccountIcon, ThreadWebView, ComposerSheet
│       └── modules/
│           └── everybox-mail-native/   # Expo Native Module
│               ├── expo-module.config.json
│               ├── src/index.ts        # Typed JS bridge for IMAP/SMTP, Keystore, WorkManager, Notifications, AICore
│               ├── android/            # Kotlin: Angus Mail IMAP/SMTP, WorkManager SyncWorker, Tink Keystore, Notification Actions, AICore
│               └── ios/                # Phase 4 Swift: MailCore2/SwiftNIO IMAP/SMTP, Keychain, BGTaskScheduler, UNNotification
└── docs/
    └── mobile/
        ├── ARCHITECTURE-PLAN.md        # This document
        ├── ANDROID-DESIGN-SPEC.md      # Mobile UX/UI specification
        ├── screens-preview.html        # Interactive 4-screen HTML preview board
        └── SWARM-REVIEW.md             # Final cross-doc audit & sign-off
```

### 5.3 Desktop Non-Breakage Guarantees

1. **Zero Desktop Script Changes:** `npm run dev`, `npm run typecheck`, `npm run build`, `npm run package`, and `npm run mcp` continue to execute identically from repo root.
2. **Installer Isolation:** Root `package.json`'s `"build": { "files": ["out/**/*", "build/icon.ico", "build/icon.png", "package.json"] }` already excludes `apps/mobile` and `docs/` from the Windows NSIS/portable and future Mac DMG packages.
3. **Pure-TS Shared Package Boundary:** `@everybox/shared` forbids `node:*` (`fs`, `crypto`, `child_process`), `electron`, `react-dom`, and `react-native` imports (enforced via `tsconfig.json` `"types": []` and CI typecheck) so it compiles cleanly under Node, Electron renderer, and React Native Hermes.
4. **React 19 Single-Version Alignment:** Pinning `apps/mobile` to Expo SDK 53+ (`react@19.0.x`) matches desktop's `react@19.0.0`, preventing dual-React hook-dispatcher bugs in npm workspaces.
5. **Cross-Doc Design & Navigation Interface Contract:**
   - **Themes:** Exact 5 theme IDs (`dark`, `black`, `graphite`, `light`, `paper`) and token roles (`bg-sidebar`/`bg-list`/`bg-main`/`bg-elevated`/`bg-hover`/`bg-selected`, `border-subtle`/`border-strong`, `text-primary`/`text-secondary`/`text-muted`, `accent`/`accent-soft`/`accent-text`, `danger`/`success`) exported from `@everybox/shared/themes.ts`.
   - **Account Visual Identity:** Supports all 12 Lucide/vector `AccountIconId` values + 3 `AccountRowStyle` modes (`gradient`, `bar`, `dot`).
   - **Focus Toggle Semantics:** `activeAccountIds: string[]` (`[]` = All Accounts; tapping an account solos it; tapping the soloed account returns to All; long-press or multi-toggle selects subsets; Workspaces map to preset `accountIds`).
   - **Android Edge-Gesture Safety:** Horizontal swipe-to-triage on `ThreadRow` MUST enforce an edge exclusion zone (`>= 28dp` floor, `36dp` recommended — matching `DESIGN.md` and `ANDROID-DESIGN-SPEC.md`) on left & right screen edges so Android 14/15/16 **Predictive Back** edge swipes are never intercepted by thread archive/delete gestures.

---

## 6. Phased Build Roadmap

### Phase 0 — Environment Bootstrap, Shared Core & First ADB Deploy (Est. 3–5 Days)

**Goal:** Prove the full Windows → Android build pipeline on a physical device via ADB without breaking a single desktop check.

- **Tasks:**
  1. Install Temurin JDK 17 + Android SDK (API 35, `build-tools;35.0.0`, NDK) and verify `adb devices` + Gradle build.
  2. Create `packages/shared` (`@everybox/shared`) and migrate `types.ts`, `html-entities.ts`, `classifier.ts`, `themes.ts`, `presets.ts`, and `ics.ts`, leaving re-export shims in `src/shared/`. Add `'microsoft'` to `AccountProvider`.
  3. Verify Desktop regression: `npm run typecheck && npm run build && npm run package`.
  4. Scaffold `apps/mobile` (Expo SDK 53+ CNG, Expo Router, Zustand, FlashList, Reanimated, Gesture Handler, `expo-sqlite` with `enableFTS: true`, `react-native-webview`) + stub `modules/everybox-mail-native` Kotlin module.
  5. Render seeded demo inbox with all 5 themes, `AccountRowStyle` switcher (`gradient`/`bar`/`dot`), and working Account Focus Toggle pills.
- **Exit Gate (Testable):**
  - `npm run typecheck && npm run build` passes cleanly for Desktop.
  - `npx expo run:android` compiles and installs debug APK onto connected Android device via ADB.
  - Cold start to interactive seeded Inbox `< 1.5s`; 60fps scrolling verified in Android GPU profiling; all 5 themes switch live without restarts.

### Phase 1 — Daily-Driver Alpha: Unified Inbox, Real Accounts, Thread Reader, Quick Reply & Swipe Triage (Est. 2–3 Weeks)

**Goal:** Make EveryBox Android daily-driver usable across mixed real accounts (Gmail + Microsoft 365 + IMAP).

- **Tasks:**
  1. Implement `everybox-mail-native` Android security & transport core:
     - Tink AEAD + Android Keystore vault (`getSecret`/`setSecret`/`deleteSecret`) + `allowBackup="false"`.
     - Angus Mail IMAP/SMTP native client (TLS/STARTTLS, `\SpecialUse`, `UIDVALIDITY`/`UIDNEXT`/`CONDSTORE`, folder-scoped UID mutations, MIME parsing).
  2. Implement `mobileDatabase.ts` + Kotlin DB helper over the **single bundled SQLite+FTS5 engine** (`${context.filesDir}/SQLite/everybox.sqlite`, `PRAGMA user_version` lockstep migrations, WAL + `busy_timeout = 5000`, `offline_queue`, persisted `mutation_guards`, drain-before-pull coordinator).
  3. Implement **Gmail Connectivity (Immediate + OAuth):** Ship the built-in **Gmail IMAP + App Password** preset (works immediately on direct signed **`.apk`** builds prior to Play Store / Google CASA verification) AND **Gmail OAuth2 + PKCE** (Chrome Custom Tabs / AppAuth, supporting BYO Google OAuth Client ID pre-launch and EveryBox's verified Android OAuth client at launch) with `historyId` incremental sync, persisted `429` backoff, and draft cleanup on send.
  4. Implement **Microsoft 365 / Outlook.com OAuth2 + PKCE** + Graph Delta sync + `outlookFocusedMode` (`inferenceClassification`).
  5. Build core Mobile UI:
     - **Unified Inbox:** Focus Toggle pills (All / Solo / Multi-toggle / Workspaces), All/People/Updates filter, `gradient`/`bar`/`dot` row washes, `AccountIcon`, Replied `↩` + `latestExternalFrom` + original received timestamp ordering.
     - **Swipe Triage:** Configurable left/right swipe actions (Archive, Trash, Read/Unread, Snooze, Move) with `>= 28dp` (`36dp` recommended) edge exclusion for Android Predictive Back and Undo Snackbar.
     - **Thread Reader:** Sandboxed `WebView` with CSP, tracking pixel stripping, remote-image gate, 2FA code copy card, inline attachment preview/download, searchable Move-to-Folder sheet.
     - **Quick Reply & Full Composer:** Bottom sticky Quick Reply bar + full Composer modal (From switcher, To/Cc/Bcc chips, attachments, independent per-send Undo Send timers, draft save/cleanup).
     - **Notifications:** People vs. Updates channels, inline `RemoteInput` Reply, Archive/Read actions, and **1-tap Copy 2FA Code** (`EXTRA_IS_SENSITIVE`).
- **Exit Gate (Testable):**
  - 48-hour live soak test with 3+ real accounts (Gmail + M365 + IMAP).
  - **Zombie-Email Torture Test:** Enable Airplane Mode → swipe-delete 5 threads & archive 5 threads across Gmail/IMAP/M365 → force-kill app process (`adb shell am force-stop app.everybox.mobile`) → disable Airplane Mode → relaunch → verify 0 resurrected emails and 100% remote convergence.
  - Rapid-fire 3 consecutive sends with 5s Undo window → verify cancelling #2 does not cancel #1 or #3.

### Phase 2 — Combined Calendar, Instant FTS5 Search, Background Sync & Offline Polish (Est. 2 Weeks)

**Goal:** Deliver EveryBox's full email + calendar + offline productivity promise.

- **Tasks:**
  1. Two-way **Google Calendar** (`syncToken`), **Microsoft Graph Calendar** (Delta), **CalDAV** (`ETag`/`ctag` + `ical.js`), read-only **ICS feeds**, default local SQLite calendar for IMAP, and Android `.ics` Share-Intent import/export.
  2. Build **Combined Calendar** tab: Agenda + Day/3-Day/Month views, account-colored events, 1-tap **Join Meeting** button (`extractMeetingUrl`), create/edit event sheet, and inline `.ics` email invite RSVP.
  3. Build **Instant Search** tab: SQLite FTS5 + `@everybox/shared/search-parser.ts`, scoped to active Focus Toggle account with 1-tap "Search all accounts", Trash/Junk excluded by default with toggle, folder badges on results.
  4. Implement native Kotlin **`WorkManager` Background Sync** (15-min periodic + expedited outbox drain over the shared bundled SQLite+FTS5 binary + bounded `dataSync` FGS with `onTimeout()` automatic fallback to `WorkManager`, plus `remoteMessaging` FGS evaluation for opt-in instant IMAP IDLE).
  5. Add **Snooze wakeups**, **Scheduled Send**, **Reminders**, and **Subscriptions / 1-tap Unsubscribe** management.
- **Exit Gate (Testable):**
  - FTS5 search latency `< 50ms` across 5,000+ cached messages while offline.
  - Background WorkManager test (`adb shell cmd jobscheduler run`) fetches a new 2FA email while app is killed and posts a working 1-tap Copy notification.
  - Create/edit/delete calendar events offline → reconnect → verify two-way sync to Google Calendar, M365 Calendar, and CalDAV.

### Phase 3 — Private / $0-Extra-Cost Mobile AI & Desktop Companion Pairing (Est. 2 Weeks)

**Goal:** Bring EveryBox's calm, zero-markup AI workflows to mobile without compromising privacy or battery.

- **Tasks:**
  1. **Desktop Companion Bridge (additive module in Desktop `src/main/`):** Opt-in local HTTPS/WSS server + mDNS advertisement + Settings QR pairing UI + Noise_XX / mTLS peer registry + push of `thread_predrafts`, `voice_profiles`, and Briefs + on-demand AI completion proxy.
  2. **Mobile Companion Client:** QR scanner pairing, pinned key in Android Keystore, automatic LAN discovery + optional user-entered VPN hostname, offline fallback handling.
  3. **On-Device & BYO AI Adapters:**
     - Android AICore / Gemini Nano bridge in `everybox-mail-native` (feature-detected at runtime).
     - Opt-in local GGUF runner (`llama.rn`) with model manager (download/delete, RAM guardrails, foreground-only execution).
     - Direct self-hosted OpenAI-compatible URL + BYO Cloud API keys (Anthropic, Gemini, OpenAI, Grok).
  4. **Mobile AI UI:** Daily **Brief** tab (Needs You / Worth a Look / Updates), **Thread Gist Summary** sheet, **AI Draft Ready** inline card (editable + Voice Profile pills + "Always auto-draft" VIP toggle + inline Send), and Composer 1-tap Polish/Tone chips — all cleanly hidden when AI is Off.
- **Exit Gate (Testable):**
  - QR Companion Pairing completes in `< 15s` on LAN; Desktop-generated pre-draft appears on phone and sends cleanly.
  - Kill Desktop Companion mid-session → verify graceful fallback (no crash, cached pre-draft still editable, calm offline indicator).
  - Switch AI to **Off** → verify zero AI network calls and clean UI with zero dead/broken buttons.

### Phase 4 — Play Store Hardening, Mac Desktop Release & iPhone (iOS) Expansion (Est. 3–4 Weeks)

**Goal:** Commercial release readiness on Google Play, macOS, and iOS.

- **Track 4A — Android Play Store Release Hardening:**
  - Public verified Google Cloud Android OAuth client + CASA Tier 2 security verification for Gmail restricted scopes; Microsoft Publisher Verification for Entra app.
  - Optional **SQLCipher** DB encryption + **Biometric App Lock** (`BiometricPrompt`).
  - Android 15/16 edge-to-edge insets, Predictive Back animations, Foldable/Tablet adaptive 2-pane Inbox+Reader layout.
  - Release `.aab` with Play App Signing, R8/ProGuard shrinking, reproducible builds, and optional zero-knowledge FCM push wake-up relay.
- **Track 4B — Mac Desktop Release (Fast Win via Existing Electron App):**
  - Backport shared **Microsoft Graph OAuth2** provider to Desktop so Windows & Mac both support M365/Outlook.com without COM.
  - Configure `electron-builder --mac` (universal `arm64` + `x64` DMG/ZIP, Apple Developer ID signing & notarization).
  - Adapt macOS window chrome (traffic lights / native menu bar), hide Windows-only `outlook-local` COM UI on `process.platform !== 'win32'`, and verify macOS Keychain via Electron `safeStorage` + local Ollama/LM Studio detection on Apple Silicon.
- **Track 4C — iPhone (iOS) Expansion:**
  - Reuse ~90% of `apps/mobile` TypeScript/React Native UI + `@everybox/shared`.
  - Implement Swift counterpart of `modules/everybox-mail-native/ios` (MailCore2 or SwiftNIO IMAP/SMTP, iOS Keychain Services, `BGAppRefreshTask` / `BGProcessingTask`, `UNNotificationServiceExtension` with 2FA Copy + inline Reply, iOS Google/Microsoft AppAuth PKCE client).
  - TestFlight beta → App Store review (including Gmail/Graph OAuth & Privacy Nutrition Labels).
- **Exit Gate (Testable):**
  - Signed Android `.aab` passes Play Console pre-launch report with 0 crashes across API 29–35 devices and foldables.
  - Signed & notarized macOS universal `.dmg` runs cleanly on Apple Silicon & Intel Macs.
  - iOS TestFlight build passes the same Zombie-Email Torture Test and 3-account soak test as Android.

---

## 7. Key Architectural Risks & Mitigations

| Risk | Severity | Concrete Mitigation |
| :--- | :--- | :--- |
| **Google Restricted Scope (CASA) & Microsoft Admin Consent** | High | Build public-ready privacy policy, minimal scope justification, and developer custom-client override for alpha testing; initiate Google verification & Microsoft Publisher Verification early in Phase 2 so Play Store launch is not blocked. |
| **Android 15+ FGS 6-Hour `dataSync` Timeout & OEM Battery Killers** | High | Keep default background `WorkManager` sync lean and native (no JS runtime boot); implement `Service.onTimeout()` on all `dataSync` FGS to stop cleanly and fall back to `WorkManager`; evaluate `remoteMessaging` FGS (with Play Console justification) for opt-in IMAP IDLE, and use Phase 4's optional zero-knowledge FCM push wake-up relay as the Play-Store-safe path to 24/7 <5s push. |
| **IMAP Server Dialect Fragmentation** | Medium | Use battle-tested **Angus Mail / Jakarta Mail** in Kotlin rather than hand-rolling sockets; ship provider presets + fallback from `CONDSTORE` to `UIDNEXT` polling; preserve desktop's folder-scoped UID mutation grouping. |
| **Swipe Triage vs. Android System Predictive Back Gesture** | Medium | Enforce `>= 28dp` (`36dp` recommended, matching `DESIGN.md` & `ANDROID-DESIGN-SPEC.md`) horizontal edge exclusion on `ThreadRow` swipe handlers and test on Android 14/15/16 gesture navigation devices. |
| **React Native / Electron Dependency Hoisting Conflicts** | Medium | Align both Desktop and `apps/mobile` on React 19 (Expo SDK 53+), keep `@everybox/shared` pure TypeScript with zero UI/Node deps, and configure monorepo `metro.config.js` explicitly. |
| **SQLite Binary / FTS5 Drift & Locking Between JS and Kotlin WorkManager** | High | Never open `everybox.sqlite` via Android framework `android.database.sqlite.SQLiteDatabase`. Mandate a single bundled SQLite+FTS5 engine (`sqlite-android` → `sqlcipher-android` in Phase 4) at explicit path `${context.filesDir}/SQLite/everybox.sqlite`, lockstep `PRAGMA user_version` migrations, pure-SQL `unicode61` FTS5 triggers, plus `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;` in both JS and Kotlin open hooks. |
