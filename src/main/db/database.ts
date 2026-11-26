import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import type {
  Account,
  AppSettings,
  Attachment,
  AutopilotLogEntry,
  AutopilotRule,
  CalendarEvent,
  CreateReminderPayload,
  EmailAddress,
  Folder,
  MailboxId,
  Message,
  ParsedSearchQuery,
  Reminder,
  ScheduledEmail,
  Snippet,
  SubscriptionGroup,
  ThreadDetail,
  ThreadPreDraft,
  ThreadSummary,
  VoiceProfile,
  VoiceProfileKind,
  Workspace
} from '../../shared/types'
import { cleanSnippet, repairMojibake } from '../../shared/html-entities'

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  uiTheme: 'everybox',
  matchSystemTheme: false,
  lightTheme: 'light',
  darkTheme: 'dark',
  readerWidth: 'comfortable',
  showDateGroups: true,
  accountSwitchBehavior: 'home',
  accountOrder: [],
  shortcuts: {},
  defaultReplyAll: false,
  undoSendSeconds: 5,
  ai: {
    provider: 'local-openai',
    localOpenAiUrl: '',
    localOpenAiModel: '',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: '',
    lmStudioUrl: 'http://localhost:1234',
    lmStudioModel: '',
    claudeCliModel: 'sonnet',
    codexCliModel: 'default',
    antigravityCliModel: 'default',
    anthropicModel: 'claude-sonnet-4-5',
    geminiModel: 'gemini-2.5-flash',
    openaiModel: 'gpt-4.1-mini',
    grokModel: 'grok-3-mini',
    responseLanguage: 'auto'
  },
  privacy: {
    blockRemoteImages: false,
    stripTrackingPixels: true,
    trustedImageSenders: []
  },
  mcp: {
    enabled: false,
    allowMutations: false,
    hiddenAccountIds: [],
    hiddenFolders: ['junk', 'trash', 'drafts'],
    hiddenSenders: []
  }
}

interface RecentThreadMutation {
  folderRole?: Folder['role']
  folderName?: string
  deleted?: boolean
  isRead?: boolean
  isStarred?: boolean
  recordedAt: number
  expiresAt: number
}

export class GlassmailDB {
  public db: DatabaseSync
  public dbPath: string
  // Guards against in-flight background syncs resurrecting freshly deleted/moved/read emails from stale snapshots
  private recentMutations = new Map<string, RecentThreadMutation>()
  private recentDeletedRemoteIds = new Map<string, number>()

  constructor(userDataDir: string) {
    this.dbPath = join(userDataDir, 'glassmail.sqlite')
    mkdirSync(dirname(this.dbPath), { recursive: true })
    this.db = new DatabaseSync(this.dbPath)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA foreign_keys = ON;')
    this.initSchema()
  }

  private getActiveMutation(threadId: string): RecentThreadMutation | undefined {
    const entry = this.recentMutations.get(threadId)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.recentMutations.delete(threadId)
      return undefined
    }
    return entry
  }

  private isRecentlyDeletedRemote(accountId: string, remoteId: string): boolean {
    const key = `${accountId}|${remoteId}`
    const exp = this.recentDeletedRemoteIds.get(key)
    if (!exp) return false
    if (Date.now() > exp) {
      this.recentDeletedRemoteIds.delete(key)
      return false
    }
    return true
  }

  private recordThreadMutation(
    threadIds: string[],
    patch: Partial<Omit<RecentThreadMutation, 'recordedAt' | 'expiresAt'>>,
    ttlMs = 90_000
  ): void {
    const now = Date.now()
    for (const tid of threadIds) {
      const prev = this.getActiveMutation(tid)
      this.recentMutations.set(tid, {
        ...prev,
        ...patch,
        recordedAt: now,
        expiresAt: Math.max(prev?.expiresAt || 0, now + ttlMs)
      })
    }
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL,
        signature_html TEXT DEFAULT '',
        is_enabled INTEGER DEFAULT 1,
        is_demo INTEGER DEFAULT 0,
        imap_host TEXT,
        imap_port INTEGER,
        imap_secure INTEGER DEFAULT 1,
        smtp_host TEXT,
        smtp_port INTEGER,
        smtp_secure INTEGER DEFAULT 1,
        smtp_separate_auth INTEGER DEFAULT 0,
        smtp_username TEXT,
        caldav_url TEXT,
        caldav_username TEXT,
        ics_feed_url TEXT,
        calendar_enabled INTEGER DEFAULT 1,
        last_sync_at INTEGER,
        sync_status TEXT DEFAULT 'idle',
        sync_error TEXT,
        gmail_history_id TEXT
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        account_ids TEXT NOT NULL,
        color TEXT NOT NULL,
        shortcut_index INTEGER
      );

      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        remote_id TEXT NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        role TEXT NOT NULL,
        unread_count INTEGER DEFAULT 0,
        total_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        remote_thread_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        snippet TEXT DEFAULT '',
        last_message_at INTEGER NOT NULL,
        message_count INTEGER DEFAULT 1,
        is_read INTEGER DEFAULT 0,
        is_starred INTEGER DEFAULT 0,
        has_attachments INTEGER DEFAULT 0,
        category TEXT DEFAULT 'people',
        folder_role TEXT DEFAULT 'inbox',
        folder_name TEXT DEFAULT 'Inbox',
        labels_json TEXT DEFAULT '[]',
        participants_json TEXT DEFAULT '[]',
        latest_from_json TEXT DEFAULT '{}',
        sign_in_code TEXT,
        snoozed_until INTEGER,
        waiting_since INTEGER,
        trackers_blocked INTEGER DEFAULT 0,
        scam_warning TEXT,
        unsubscribe_url TEXT,
        unsubscribe_mailto TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_threads_account_folder_date
        ON threads(account_id, folder_role, last_message_at DESC);
      CREATE INDEX IF NOT EXISTS idx_threads_date
        ON threads(last_message_at DESC);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        remote_id TEXT NOT NULL,
        message_id_header TEXT,
        from_json TEXT NOT NULL,
        to_json TEXT DEFAULT '[]',
        cc_json TEXT DEFAULT '[]',
        bcc_json TEXT DEFAULT '[]',
        subject TEXT NOT NULL,
        snippet TEXT DEFAULT '',
        body_text TEXT DEFAULT '',
        body_html TEXT DEFAULT '',
        date INTEGER NOT NULL,
        is_read INTEGER DEFAULT 0,
        is_starred INTEGER DEFAULT 0,
        is_draft INTEGER DEFAULT 0,
        is_sent INTEGER DEFAULT 0,
        folder_role TEXT DEFAULT 'inbox',
        folder_name TEXT DEFAULT 'Inbox',
        labels_json TEXT DEFAULT '[]',
        category TEXT DEFAULT 'people',
        has_attachments INTEGER DEFAULT 0,
        sign_in_code TEXT,
        trackers_blocked INTEGER DEFAULT 0,
        scam_warning TEXT,
        unsubscribe_url TEXT,
        unsubscribe_mailto TEXT,
        calendar_invite_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_messages_thread_date ON messages(thread_id, date ASC);

      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        message_id UNINDEXED,
        thread_id UNINDEXED,
        account_id UNINDEXED,
        subject,
        sender,
        recipients,
        body_text
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER DEFAULT 0,
        content_id TEXT,
        is_inline INTEGER DEFAULT 0,
        local_path TEXT,
        remote_attachment_id TEXT
      );

      CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        calendar_id TEXT NOT NULL,
        calendar_name TEXT NOT NULL,
        remote_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        location TEXT DEFAULT '',
        meeting_url TEXT,
        start_at INTEGER NOT NULL,
        end_at INTEGER NOT NULL,
        all_day INTEGER DEFAULT 0,
        attendees_json TEXT DEFAULT '[]',
        attachments_json TEXT DEFAULT '[]',
        status TEXT DEFAULT 'confirmed',
        source TEXT NOT NULL,
        read_only INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_cal_events_range ON calendar_events(start_at, end_at);

      CREATE TABLE IF NOT EXISTS scheduled_emails (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        to_json TEXT NOT NULL,
        cc_json TEXT DEFAULT '[]',
        bcc_json TEXT DEFAULT '[]',
        subject TEXT NOT NULL,
        body_html TEXT NOT NULL,
        body_text TEXT NOT NULL,
        reply_to_thread_id TEXT,
        send_at INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS snippets (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        shortcut TEXT NOT NULL,
        body TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS offline_queue (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        account_id TEXT,
        thread_id TEXT,
        thread_subject TEXT,
        thread_sender TEXT,
        title TEXT NOT NULL,
        note TEXT,
        due_at INTEGER NOT NULL,
        only_if_no_reply INTEGER DEFAULT 0,
        completed_at INTEGER,
        notified_at INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(completed_at, due_at ASC);

      CREATE TABLE IF NOT EXISTS thread_predrafts (
        thread_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        provider_label TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS autopilot_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        conditions_json TEXT NOT NULL,
        actions_json TEXT NOT NULL,
        run_count INTEGER DEFAULT 0,
        last_run_at INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS autopilot_logs (
        id TEXT PRIMARY KEY,
        rule_id TEXT,
        rule_name TEXT NOT NULL,
        thread_id TEXT,
        thread_subject TEXT,
        action_summary TEXT NOT NULL,
        undo_action TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS voice_profiles (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        account_ids_json TEXT DEFAULT '[]',
        style_summary TEXT DEFAULT '',
        greeting_style TEXT,
        sign_off_style TEXT,
        sample_count INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `)
    // Safe additive schema migrations for existing user databases
    try {
      this.db.exec(`ALTER TABLE calendar_events ADD COLUMN attachments_json TEXT DEFAULT '[]'`)
    } catch {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE accounts ADD COLUMN icon TEXT`)
    } catch {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE accounts ADD COLUMN outlook_focused_mode TEXT`)
    } catch {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE accounts ADD COLUMN sync_backoff_until INTEGER`)
    } catch {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE accounts ADD COLUMN sync_consecutive_errors INTEGER DEFAULT 0`)
    } catch {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE accounts ADD COLUMN gmail_history_id TEXT`)
    } catch {
      // Column already exists
    }

    // Decode any HTML-entity-encoded snippets (e.g. Gmail's `&#39;`, `&amp;`) already cached in SQLite
    this.cleanupEncodedSnippets()
    // Fix cached inbox messages from external senders that were tagged is_sent=1 (e.g. Gmail SENT+INBOX)
    this.cleanupMisclassifiedInboxSentMessages()
    // Repair UTF-8-as-Latin1 mojibake in cached subjects (e.g. `â€”`, `âš ï¸`)
    this.cleanupMojibakeSubjects()
  }

  private cleanupMojibakeSubjects(): void {
    try {
      const threadRows = this.db
        .prepare('SELECT id, subject FROM threads')
        .all() as { id: string; subject: string }[]
      const updateThread = this.db.prepare('UPDATE threads SET subject = ? WHERE id = ?')
      for (const row of threadRows) {
        const fixed = repairMojibake(row.subject)
        if (fixed !== row.subject) {
          updateThread.run(fixed, row.id)
        }
      }

      const msgRows = this.db
        .prepare('SELECT id, subject FROM messages')
        .all() as { id: string; subject: string }[]
      const updateMsg = this.db.prepare('UPDATE messages SET subject = ? WHERE id = ?')
      for (const row of msgRows) {
        const fixed = repairMojibake(row.subject)
        if (fixed !== row.subject) {
          updateMsg.run(fixed, row.id)
        }
      }
    } catch {
      // Non-fatal cleanup
    }
  }

  private cleanupMisclassifiedInboxSentMessages(): void {
    try {
      const rows = this.db
        .prepare(`
          SELECT m.id, m.thread_id
          FROM messages m
          JOIN accounts a ON a.id = m.account_id
          WHERE m.is_sent = 1
            AND m.folder_role = 'inbox'
            AND COALESCE(json_extract(m.from_json, '$.email'), '') != ''
            AND LOWER(json_extract(m.from_json, '$.email')) != LOWER(a.email)
        `)
        .all() as { id: string; thread_id: string }[]
      if (rows.length === 0) return
      const updateMsg = this.db.prepare('UPDATE messages SET is_sent = 0 WHERE id = ?')
      const threadIds = new Set<string>()
      for (const row of rows) {
        updateMsg.run(row.id)
        threadIds.add(row.thread_id)
      }
      for (const tid of threadIds) {
        this.recomputeThreadFromMessages(tid)
      }
    } catch {
      // Non-fatal cleanup
    }
  }

  private cleanupEncodedSnippets(): void {
    try {
      const threadRows = this.db
        .prepare(`SELECT id, snippet FROM threads WHERE snippet LIKE '%&%;%'`)
        .all() as { id: string; snippet: string }[]
      if (threadRows.length > 0) {
        const updateThread = this.db.prepare('UPDATE threads SET snippet = ? WHERE id = ?')
        for (const row of threadRows) {
          const decoded = cleanSnippet(row.snippet)
          if (decoded !== row.snippet) {
            updateThread.run(decoded, row.id)
          }
        }
      }

      const msgRows = this.db
        .prepare(`SELECT id, snippet FROM messages WHERE snippet LIKE '%&%;%'`)
        .all() as { id: string; snippet: string }[]
      if (msgRows.length > 0) {
        const updateMsg = this.db.prepare('UPDATE messages SET snippet = ? WHERE id = ?')
        for (const row of msgRows) {
          const decoded = cleanSnippet(row.snippet)
          if (decoded !== row.snippet) {
            updateMsg.run(decoded, row.id)
          }
        }
      }
    } catch {
      // Non-fatal cleanup
    }
  }

  // ---- Settings ----
  getSettings(): AppSettings {
    const row = this.db.prepare('SELECT value FROM kv_settings WHERE key = ?').get('app_settings') as
      | { value: string }
      | undefined
    if (!row) return { ...DEFAULT_SETTINGS }
    try {
      const parsed = JSON.parse(row.value)
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        ai: { ...DEFAULT_SETTINGS.ai, ...(parsed.ai || {}) },
        privacy: { ...DEFAULT_SETTINGS.privacy, ...(parsed.privacy || {}) },
        mcp: { ...DEFAULT_SETTINGS.mcp, ...(parsed.mcp || {}) }
      }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  saveSettings(settings: AppSettings): void {
    this.db
      .prepare('INSERT INTO kv_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('app_settings', JSON.stringify(settings))
  }

  // ---- Accounts ----
  listAccounts(): Account[] {
    const rows = this.db
      .prepare(`
        SELECT a.*,
          (SELECT COUNT(*) FROM threads t WHERE t.account_id = a.id AND t.folder_role = 'inbox' AND t.is_read = 0 AND t.snoozed_until IS NULL) AS unread_count,
          (SELECT COUNT(*) FROM threads t WHERE t.account_id = a.id AND t.folder_role = 'inbox' AND t.snoozed_until IS NULL) AS total_count
        FROM accounts a
        ORDER BY a.is_demo ASC, a.name ASC
      `)
      .all() as Record<string, unknown>[]
    const accounts = rows.map((r) => this.mapAccount(r))
    const order = this.getSettings().accountOrder || []
    if (order.length === 0) return accounts
    const rank = new Map(order.map((id, idx) => [id, idx]))
    return [...accounts].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER
      const rb = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER
      if (ra !== rb) return ra - rb
      return a.name.localeCompare(b.name)
    })
  }

  reorderAccounts(accountIds: string[]): void {
    const settings = this.getSettings()
    this.saveSettings({ ...settings, accountOrder: accountIds })
  }

  getAccount(id: string): Account | null {
    const r = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return r ? this.mapAccount(r) : null
  }

  upsertAccount(a: Account): void {
    this.db
      .prepare(`
        INSERT INTO accounts (
          id, provider, name, email, color, icon, signature_html, is_enabled, is_demo,
          imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure,
          smtp_separate_auth, smtp_username, caldav_url, caldav_username, ics_feed_url,
          outlook_focused_mode, calendar_enabled, last_sync_at, sync_status, sync_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          color = excluded.color,
          icon = excluded.icon,
          signature_html = excluded.signature_html,
          is_enabled = excluded.is_enabled,
          imap_host = excluded.imap_host,
          imap_port = excluded.imap_port,
          imap_secure = excluded.imap_secure,
          smtp_host = excluded.smtp_host,
          smtp_port = excluded.smtp_port,
          smtp_secure = excluded.smtp_secure,
          smtp_separate_auth = excluded.smtp_separate_auth,
          smtp_username = excluded.smtp_username,
          caldav_url = excluded.caldav_url,
          caldav_username = excluded.caldav_username,
          ics_feed_url = excluded.ics_feed_url,
          outlook_focused_mode = excluded.outlook_focused_mode,
          calendar_enabled = excluded.calendar_enabled,
          last_sync_at = excluded.last_sync_at,
          sync_status = excluded.sync_status,
          sync_error = excluded.sync_error
      `)
      .run(
        a.id,
        a.provider,
        a.name,
        a.email,
        a.color,
        a.icon ?? null,
        a.signatureHtml ?? '',
        a.isEnabled ? 1 : 0,
        a.isDemo ? 1 : 0,
        a.imapHost ?? null,
        a.imapPort ?? null,
        a.imapSecure === false ? 0 : 1,
        a.smtpHost ?? null,
        a.smtpPort ?? null,
        a.smtpSecure === false ? 0 : 1,
        a.smtpSeparateAuth ? 1 : 0,
        a.smtpUsername ?? null,
        a.caldavUrl ?? null,
        a.caldavUsername ?? null,
        a.icsFeedUrl ?? null,
        a.outlookFocusedMode ?? 'all',
        a.calendarEnabled === false ? 0 : 1,
        a.lastSyncAt ?? null,
        a.syncStatus ?? 'idle',
        a.syncError ?? null
      )
  }

  updateAccountSyncState(
    id: string,
    status: Account['syncStatus'],
    error?: string,
    backoffUntil?: number | null,
    consecutiveErrors?: number
  ): void {
    if (status === 'idle') {
      this.db
        .prepare(
          'UPDATE accounts SET sync_status = ?, sync_error = NULL, sync_backoff_until = NULL, sync_consecutive_errors = 0, last_sync_at = ? WHERE id = ?'
        )
        .run(status, Date.now(), id)
    } else if (status === 'error') {
      this.db
        .prepare(
          'UPDATE accounts SET sync_status = ?, sync_error = ?, sync_backoff_until = ?, sync_consecutive_errors = ? WHERE id = ?'
        )
        .run(status, error ?? null, backoffUntil ?? null, consecutiveErrors ?? 1, id)
    } else {
      this.db
        .prepare('UPDATE accounts SET sync_status = ?, sync_error = ? WHERE id = ?')
        .run(status, error ?? null, id)
    }
  }

  getGmailHistoryId(accountId: string): string | null {
    const row = this.db
      .prepare('SELECT gmail_history_id FROM accounts WHERE id = ?')
      .get(accountId) as { gmail_history_id: string | null } | undefined
    return row?.gmail_history_id ? String(row.gmail_history_id) : null
  }

  setGmailHistoryId(accountId: string, historyId: string): void {
    this.db.prepare('UPDATE accounts SET gmail_history_id = ? WHERE id = ?').run(historyId, accountId)
  }

  clearGmailHistoryId(accountId: string): void {
    this.db.prepare('UPDATE accounts SET gmail_history_id = NULL WHERE id = ?').run(accountId)
  }

  getMinMessageDateForRemoteIds(accountId: string, remoteIds: string[]): number | undefined {
    if (remoteIds.length === 0) return undefined
    const ph = remoteIds.map(() => '?').join(',')
    const row = this.db
      .prepare(`SELECT MIN(date) AS min_date FROM messages WHERE account_id = ? AND remote_id IN (${ph})`)
      .get(accountId, ...remoteIds) as { min_date: number | null } | undefined
    return row && row.min_date !== null && row.min_date !== undefined ? Number(row.min_date) : undefined
  }

  deleteAccount(id: string): void {
    this.db.prepare('DELETE FROM messages_fts WHERE account_id = ?').run(id)
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  }

  clearDemoAccounts(): void {
    const demos = this.db.prepare('SELECT id FROM accounts WHERE is_demo = 1').all() as { id: string }[]
    for (const d of demos) {
      this.deleteAccount(d.id)
    }
  }

  private mapAccount(r: Record<string, unknown>): Account {
    return {
      id: String(r.id),
      provider: r.provider as Account['provider'],
      name: String(r.name),
      email: String(r.email),
      color: String(r.color),
      icon: (r.icon ? String(r.icon) : undefined) as Account['icon'],
      signatureHtml: String(r.signature_html || ''),
      isEnabled: Boolean(r.is_enabled),
      isDemo: Boolean(r.is_demo),
      imapHost: r.imap_host ? String(r.imap_host) : undefined,
      imapPort: r.imap_port ? Number(r.imap_port) : undefined,
      imapSecure: r.imap_secure !== 0,
      smtpHost: r.smtp_host ? String(r.smtp_host) : undefined,
      smtpPort: r.smtp_port ? Number(r.smtp_port) : undefined,
      smtpSecure: r.smtp_secure !== 0,
      smtpSeparateAuth: Boolean(r.smtp_separate_auth),
      smtpUsername: r.smtp_username ? String(r.smtp_username) : undefined,
      caldavUrl: r.caldav_url ? String(r.caldav_url) : undefined,
      caldavUsername: r.caldav_username ? String(r.caldav_username) : undefined,
      icsFeedUrl: r.ics_feed_url ? String(r.ics_feed_url) : undefined,
      outlookFocusedMode: (r.outlook_focused_mode
        ? String(r.outlook_focused_mode)
        : 'all') as Account['outlookFocusedMode'],
      calendarEnabled: r.calendar_enabled !== 0,
      lastSyncAt: r.last_sync_at ? Number(r.last_sync_at) : undefined,
      syncStatus: (r.sync_status as Account['syncStatus']) || 'idle',
      syncError: r.sync_error ? String(r.sync_error) : undefined,
      syncBackoffUntil: r.sync_backoff_until ? Number(r.sync_backoff_until) : undefined,
      syncConsecutiveErrors: r.sync_consecutive_errors ? Number(r.sync_consecutive_errors) : 0,
      gmailHistoryId: r.gmail_history_id ? String(r.gmail_history_id) : undefined,
      unreadCount: r.unread_count !== undefined ? Number(r.unread_count) : 0,
      totalCount: r.total_count !== undefined ? Number(r.total_count) : 0
    }
  }

  // ---- Workspaces ----
  listWorkspaces(): Workspace[] {
    const validAccountIds = new Set(
      (this.db.prepare('SELECT id FROM accounts').all() as { id: string }[]).map((r) => r.id)
    )
    const rows = this.db.prepare('SELECT * FROM workspaces ORDER BY shortcut_index ASC, name ASC').all() as Record<string, unknown>[]
    const result: Workspace[] = []
    for (const r of rows) {
      const id = String(r.id)
      const rawIds: string[] = JSON.parse(String(r.account_ids || '[]'))
      if (id !== 'ws-all') {
        const filtered = rawIds.filter((aid) => validAccountIds.has(aid))
        // Prune dead/stale workspaces (e.g. demo workspaces whose accounts were cleared)
        if (filtered.length === 0) {
          this.deleteWorkspace(id)
          continue
        }
        if (filtered.length !== rawIds.length) {
          this.db.prepare('UPDATE workspaces SET account_ids = ? WHERE id = ?').run(JSON.stringify(filtered), id)
        }
        result.push({
          id,
          name: String(r.name),
          accountIds: filtered,
          color: String(r.color),
          shortcutIndex: r.shortcut_index ? Number(r.shortcut_index) : undefined
        })
      } else {
        result.push({
          id,
          name: String(r.name),
          accountIds: [],
          color: String(r.color),
          shortcutIndex: r.shortcut_index ? Number(r.shortcut_index) : undefined
        })
      }
    }
    return result
  }

  upsertWorkspace(w: Workspace): void {
    this.db
      .prepare(`
        INSERT INTO workspaces (id, name, account_ids, color, shortcut_index)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          account_ids = excluded.account_ids,
          color = excluded.color,
          shortcut_index = excluded.shortcut_index
      `)
      .run(w.id, w.name, JSON.stringify(w.accountIds), w.color, w.shortcutIndex ?? null)
  }

  deleteWorkspace(id: string): void {
    this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
  }

  // ---- Folders ----
  listFolders(accountIds?: string[]): Folder[] {
    if (accountIds && accountIds.length > 0) {
      const ph = accountIds.map(() => '?').join(',')
      const rows = this.db
        .prepare(`SELECT * FROM folders WHERE account_id IN (${ph}) ORDER BY name ASC`)
        .all(...accountIds) as Record<string, unknown>[]
      return rows.map(this.mapFolder)
    }
    const rows = this.db.prepare('SELECT * FROM folders ORDER BY name ASC').all() as Record<string, unknown>[]
    return rows.map(this.mapFolder)
  }

  getFolderByName(accountId: string, folderName: string): Folder | null {
    const row = this.db
      .prepare('SELECT * FROM folders WHERE account_id = ? AND (LOWER(name) = LOWER(?) OR LOWER(path) = LOWER(?)) LIMIT 1')
      .get(accountId, folderName, folderName) as Record<string, unknown> | undefined
    return row ? this.mapFolder(row) : null
  }

  upsertFolder(f: Folder): void {
    this.db
      .prepare(`
        INSERT INTO folders (id, account_id, remote_id, name, path, role, unread_count, total_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          path = excluded.path,
          role = excluded.role,
          unread_count = excluded.unread_count,
          total_count = excluded.total_count
      `)
      .run(f.id, f.accountId, f.remoteId, f.name, f.path, f.role, f.unreadCount, f.totalCount)
  }

  private mapFolder(r: Record<string, unknown>): Folder {
    const role = r.role as Folder['role']
    return {
      id: String(r.id),
      accountId: String(r.account_id),
      remoteId: String(r.remote_id),
      name: String(r.name),
      path: String(r.path),
      role,
      unreadCount: role === 'sent' ? 0 : Number(r.unread_count || 0),
      totalCount: Number(r.total_count || 0)
    }
  }

  // ---- Threads & Messages ----
  upsertMessageAndThread(msg: Message, remoteThreadId: string): void {
    // Prevent an in-flight background sync with a stale snapshot from resurrecting a freshly deleted or moved email
    if (this.isRecentlyDeletedRemote(msg.accountId, msg.remoteId)) {
      return
    }
    const guard = this.getActiveMutation(msg.threadId)
    if (guard && msg.date <= guard.recordedAt) {
      if (guard.deleted) return
      if (guard.folderRole && msg.folderRole !== guard.folderRole) {
        return
      }
      if (guard.isRead !== undefined) {
        msg = { ...msg, isRead: guard.isRead }
      }
      if (guard.isStarred !== undefined) {
        msg = { ...msg, isStarred: guard.isStarred }
      }
    }

    const cleanedSnippet = cleanSnippet(msg.snippet || '')
    const cleanedSubject = repairMojibake(msg.subject || '') || '(No subject)'
    this.db
      .prepare(`
        INSERT INTO threads (
          id, account_id, remote_thread_id, subject, snippet, last_message_at,
          message_count, is_read, is_starred, has_attachments, category, folder_role,
          folder_name, labels_json, participants_json, latest_from_json, sign_in_code,
          trackers_blocked, scam_warning, unsubscribe_url, unsubscribe_mailto
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          subject = CASE WHEN excluded.last_message_at >= threads.last_message_at THEN excluded.subject ELSE threads.subject END,
          snippet = CASE WHEN excluded.last_message_at >= threads.last_message_at THEN excluded.snippet ELSE threads.snippet END,
          last_message_at = MAX(threads.last_message_at, excluded.last_message_at),
          is_read = CASE WHEN excluded.is_read = 0 THEN 0 ELSE threads.is_read END,
          is_starred = MAX(threads.is_starred, excluded.is_starred),
          has_attachments = MAX(threads.has_attachments, excluded.has_attachments),
          sign_in_code = COALESCE(excluded.sign_in_code, threads.sign_in_code),
          trackers_blocked = MAX(threads.trackers_blocked, excluded.trackers_blocked),
          scam_warning = COALESCE(excluded.scam_warning, threads.scam_warning),
          unsubscribe_url = COALESCE(excluded.unsubscribe_url, threads.unsubscribe_url),
          unsubscribe_mailto = COALESCE(excluded.unsubscribe_mailto, threads.unsubscribe_mailto)
      `)
      .run(
        msg.threadId,
        msg.accountId,
        remoteThreadId,
        cleanedSubject,
        cleanedSnippet,
        msg.date,
        msg.isRead ? 1 : 0,
        msg.isStarred ? 1 : 0,
        msg.hasAttachments ? 1 : 0,
        msg.category,
        msg.folderRole,
        msg.folderName || 'Inbox',
        JSON.stringify(msg.labels || []),
        JSON.stringify([msg.from, ...msg.to].slice(0, 6)),
        JSON.stringify(msg.from),
        msg.signInCode ?? null,
        msg.trackersBlocked || 0,
        msg.scamWarning ?? null,
        msg.unsubscribeUrl ?? null,
        msg.unsubscribeMailto ?? null
      )

    this.db
      .prepare(`
        INSERT INTO messages (
          id, account_id, thread_id, remote_id, message_id_header,
          from_json, to_json, cc_json, bcc_json, subject, snippet,
          body_text, body_html, date, is_read, is_starred, is_draft, is_sent,
          folder_role, folder_name, labels_json, category, has_attachments,
          sign_in_code, trackers_blocked, scam_warning, unsubscribe_url,
          unsubscribe_mailto, calendar_invite_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          date = excluded.date,
          snippet = excluded.snippet,
          is_read = excluded.is_read,
          is_starred = excluded.is_starred,
          is_sent = excluded.is_sent,
          has_attachments = excluded.has_attachments,
          folder_role = excluded.folder_role,
          folder_name = excluded.folder_name,
          labels_json = excluded.labels_json
      `)
      .run(
        msg.id,
        msg.accountId,
        msg.threadId,
        msg.remoteId,
        msg.messageIdHeader ?? null,
        JSON.stringify(msg.from),
        JSON.stringify(msg.to || []),
        JSON.stringify(msg.cc || []),
        JSON.stringify(msg.bcc || []),
        cleanedSubject,
        cleanedSnippet,
        msg.bodyText || '',
        msg.bodyHtml || '',
        msg.date,
        msg.isRead ? 1 : 0,
        msg.isStarred ? 1 : 0,
        msg.isDraft ? 1 : 0,
        msg.isSent ? 1 : 0,
        msg.folderRole,
        msg.folderName || 'Inbox',
        JSON.stringify(msg.labels || []),
        msg.category,
        msg.hasAttachments ? 1 : 0,
        msg.signInCode ?? null,
        msg.trackersBlocked || 0,
        msg.scamWarning ?? null,
        msg.unsubscribeUrl ?? null,
        msg.unsubscribeMailto ?? null,
        msg.calendarInvite ? JSON.stringify(msg.calendarInvite) : null
      )

    for (const att of msg.attachments || []) {
      this.db
        .prepare(`
          INSERT INTO attachments (id, message_id, filename, mime_type, size, content_id, is_inline, local_path, remote_attachment_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING
        `)
        .run(
          att.id,
          msg.id,
          att.filename,
          att.mimeType,
          att.size,
          att.contentId ?? null,
          att.isInline ? 1 : 0,
          att.localPath ?? null,
          att.remoteAttachmentId ?? null
        )
    }

    // Update FTS index
    this.db.prepare('DELETE FROM messages_fts WHERE message_id = ?').run(msg.id)
    const senderStr = `${msg.from.name} ${msg.from.email}`
    const recipStr = [...msg.to, ...msg.cc].map((r) => `${r.name} ${r.email}`).join(' ')
    this.db
      .prepare('INSERT INTO messages_fts (message_id, thread_id, account_id, subject, sender, recipients, body_text) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(msg.id, msg.threadId, msg.accountId, msg.subject || '', senderStr, recipStr, msg.bodyText || '')

    // Recompute thread message count, waiting_since, latest_from, and effective folder_role/folder_name
    const stats = this.db
      .prepare(`
        SELECT COUNT(*) AS cnt,
          (SELECT is_sent FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_is_sent,
          (SELECT date FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_date,
          (SELECT from_json FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_from,
          (SELECT folder_role FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_folder_role,
          (SELECT folder_name FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_folder_name,
          (SELECT folder_name FROM messages WHERE thread_id = ? AND folder_role = 'inbox' ORDER BY date DESC LIMIT 1) AS inbox_folder_name
        FROM messages WHERE thread_id = ?
      `)
      .get(
        msg.threadId,
        msg.threadId,
        msg.threadId,
        msg.threadId,
        msg.threadId,
        msg.threadId,
        msg.threadId
      ) as {
      cnt: number
      last_is_sent: number
      last_date: number
      last_from: string
      last_folder_role: string | null
      last_folder_name: string | null
      inbox_folder_name: string | null
    }

    const effectiveRole = stats.inbox_folder_name ? 'inbox' : stats.last_folder_role || msg.folderRole
    const effectiveName = stats.inbox_folder_name || stats.last_folder_name || msg.folderName || 'Inbox'
    const waitingSince = stats.last_is_sent === 1 ? stats.last_date : null

    // Merge all message labels across the thread so custom labels (e.g. Gmail folders) are always up to date
    const labelRows = this.db
      .prepare('SELECT labels_json FROM messages WHERE thread_id = ?')
      .all(msg.threadId) as { labels_json: string | null }[]
    const mergedLabels = Array.from(
      new Set(
        labelRows.flatMap((r) => {
          try {
            return JSON.parse(r.labels_json || '[]') as string[]
          } catch {
            return []
          }
        })
      )
    )

    this.db
      .prepare(
        'UPDATE threads SET message_count = ?, last_message_at = COALESCE(?, last_message_at), waiting_since = ?, latest_from_json = ?, folder_role = ?, folder_name = ?, labels_json = ? WHERE id = ?'
      )
      .run(
        stats.cnt,
        stats.last_date,
        waitingSince,
        stats.last_from || JSON.stringify(msg.from),
        effectiveRole,
        effectiveName,
        JSON.stringify(mergedLabels),
        msg.threadId
      )
  }

  /**
   * Reconcile local messages in (accountId, folderRole) against the server's live remote IDs.
   * Removes local copies that were deleted or moved out of this folder in another client (e.g. Outlook/Gmail)
   * and recomputes or removes affected threads.
   */
  reconcileFolderMessages(
    accountId: string,
    folderRole: Folder['role'],
    liveRemoteIds: string[],
    minDateMs?: number
  ): number {
    const liveSet = new Set(liveRemoteIds)
    const rows = (
      minDateMs !== undefined
        ? this.db
            .prepare(
              'SELECT id, thread_id, remote_id FROM messages WHERE account_id = ? AND folder_role = ? AND date >= ?'
            )
            .all(accountId, folderRole, minDateMs)
        : this.db
            .prepare('SELECT id, thread_id, remote_id FROM messages WHERE account_id = ? AND folder_role = ?')
            .all(accountId, folderRole)
    ) as { id: string; thread_id: string; remote_id: string }[]

    const stale = rows.filter((r) => {
      if (liveSet.has(r.remote_id)) return false
      // Don't strip out a message that was just moved into this folder locally before remote sync completes
      const guard = this.getActiveMutation(r.thread_id)
      if (guard && guard.folderRole === folderRole) return false
      return true
    })
    if (stale.length === 0) return 0

    const affectedThreads = new Set<string>()
    const delMsg = this.db.prepare('DELETE FROM messages WHERE id = ?')
    const delFts = this.db.prepare('DELETE FROM messages_fts WHERE message_id = ?')

    for (const s of stale) {
      delMsg.run(s.id)
      delFts.run(s.id)
      affectedThreads.add(s.thread_id)
    }

    for (const threadId of affectedThreads) {
      const remaining = this.db
        .prepare(
          `SELECT COUNT(*) AS cnt,
            MAX(date) AS last_date,
            MIN(is_read) AS all_read,
            MAX(is_starred) AS any_starred,
            MAX(has_attachments) AS any_att,
            (SELECT subject FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_subject,
            (SELECT snippet FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_snippet,
            (SELECT is_sent FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_is_sent,
            (SELECT from_json FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_from,
            (SELECT folder_role FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_folder_role,
            (SELECT folder_name FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_folder_name,
            (SELECT folder_name FROM messages WHERE thread_id = ? AND folder_role = 'inbox' ORDER BY date DESC LIMIT 1) AS inbox_folder_name
          FROM messages WHERE thread_id = ?`
        )
        .get(threadId, threadId, threadId, threadId, threadId, threadId, threadId, threadId) as {
        cnt: number
        last_date: number | null
        all_read: number | null
        any_starred: number | null
        any_att: number | null
        last_subject: string | null
        last_snippet: string | null
        last_is_sent: number | null
        last_from: string | null
        last_folder_role: string | null
        last_folder_name: string | null
        inbox_folder_name: string | null
      }

      if (!remaining || remaining.cnt === 0) {
        this.db.prepare('DELETE FROM threads WHERE id = ?').run(threadId)
      } else {
        const effectiveRole = remaining.inbox_folder_name ? 'inbox' : remaining.last_folder_role || 'archive'
        const effectiveName = remaining.inbox_folder_name || remaining.last_folder_name || 'Archive'
        const waitingSince = remaining.last_is_sent === 1 ? remaining.last_date : null
        this.db
          .prepare(
            `UPDATE threads
             SET message_count = ?, last_message_at = ?, is_read = ?, is_starred = ?, has_attachments = ?,
                 subject = COALESCE(?, subject), snippet = COALESCE(?, snippet),
                 waiting_since = ?, latest_from_json = COALESCE(?, latest_from_json),
                 folder_role = ?, folder_name = ?
             WHERE id = ?`
          )
          .run(
            remaining.cnt,
            remaining.last_date || Date.now(),
            remaining.all_read ? 1 : 0,
            remaining.any_starred ? 1 : 0,
            remaining.any_att ? 1 : 0,
            remaining.last_subject,
            remaining.last_snippet,
            waitingSince,
            remaining.last_from,
            effectiveRole,
            effectiveName,
            threadId
          )
      }
    }

    return stale.length
  }

  listThreads(opts: {
    accountIds?: string[]
    mailbox: MailboxId
    category?: 'all' | 'people' | 'updates'
    folderName?: string
    limit?: number
  }): ThreadSummary[] {
    const where: string[] = []
    const params: (string | number)[] = []

    if (opts.accountIds && opts.accountIds.length > 0) {
      where.push(`t.account_id IN (${opts.accountIds.map(() => '?').join(',')})`)
      params.push(...opts.accountIds)
    }

    if (opts.folderName) {
      const lowerFolder = opts.folderName.toLowerCase()
      const isTrashOrJunkFolder =
        lowerFolder === 'trash' ||
        lowerFolder === 'deleted items' ||
        lowerFolder === 'junk' ||
        lowerFolder === 'junk email' ||
        lowerFolder === 'spam'
      where.push(
        isTrashOrJunkFolder
          ? '(t.folder_name = ? OR t.labels_json LIKE ?)'
          : "((t.folder_name = ? OR t.labels_json LIKE ?) AND t.folder_role NOT IN ('trash', 'junk'))"
      )
      params.push(opts.folderName, `%"${opts.folderName}"%`)
    } else {
      switch (opts.mailbox) {
        case 'inbox':
          where.push("t.folder_role = 'inbox' AND (t.snoozed_until IS NULL OR t.snoozed_until <= ?)")
          params.push(Date.now())
          if (opts.category && opts.category !== 'all') {
            where.push('t.category = ?')
            params.push(opts.category)
          }
          break
        case 'starred':
          where.push("t.is_starred = 1 AND t.folder_role NOT IN ('trash', 'junk')")
          break
        case 'snoozed':
          where.push("t.snoozed_until IS NOT NULL AND t.snoozed_until > ? AND t.folder_role NOT IN ('trash', 'junk')")
          params.push(Date.now())
          break
        case 'waiting':
          where.push("t.waiting_since IS NOT NULL AND t.folder_role NOT IN ('trash', 'junk')")
          break
        case 'drafts':
          where.push(
            "((t.folder_role = 'drafts' OR EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = t.id AND m.is_draft = 1)) AND t.folder_role NOT IN ('trash', 'junk'))"
          )
          break
        case 'sent':
          where.push(
            "((t.folder_role = 'sent' OR EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = t.id AND m.is_sent = 1)) AND t.folder_role NOT IN ('trash', 'junk'))"
          )
          break
        case 'archive':
          where.push("t.folder_role = 'archive'")
          break
        case 'junk':
          where.push("t.folder_role = 'junk'")
          break
        case 'trash':
          where.push("t.folder_role = 'trash'")
          break
        case 'subscriptions':
          where.push("(t.unsubscribe_url IS NOT NULL OR t.unsubscribe_mailto IS NOT NULL) AND t.folder_role NOT IN ('trash', 'junk')")
          break
        default:
          where.push("t.folder_role NOT IN ('trash', 'junk')")
          break
      }
    }

    const isSentView = !opts.folderName && opts.mailbox === 'sent'

    if (isSentView) {
      const sql = `
        SELECT
          t.*,
          a.color AS account_color,
          a.icon AS account_icon,
          a.email AS account_email,
          COALESCE(sm.snippet, t.snippet) AS sent_snippet,
          COALESCE(sm.date, t.last_message_at) AS sent_date,
          sm.to_json AS sent_to_json,
          sm.from_json AS sent_from_json
        FROM threads t
        JOIN accounts a ON a.id = t.account_id
        LEFT JOIN messages sm ON sm.id = (
          SELECT m2.id
          FROM messages m2
          WHERE m2.thread_id = t.id AND m2.is_sent = 1
          ORDER BY m2.date DESC
          LIMIT 1
        )
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY COALESCE(sm.date, t.last_message_at) DESC
        LIMIT ?
      `
      params.push(opts.limit ?? 200)
      const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
      return rows.map((r) => {
        const base = this.mapThreadSummary(r)
        const sentTo = r.sent_to_json ? (JSON.parse(String(r.sent_to_json)) as EmailAddress[]) : []
        const sentFrom = r.sent_from_json ? (JSON.parse(String(r.sent_from_json)) as EmailAddress) : base.latestFrom
        return {
          ...base,
          isRead: true,
          lastMessageAt: Number(r.sent_date ?? base.lastMessageAt),
          snippet: cleanSnippet(String(r.sent_snippet ?? base.snippet)),
          participants: sentTo.length > 0 ? sentTo : base.participants,
          latestFrom: sentFrom
        }
      })
    }

    const isDraftsView = !opts.folderName && opts.mailbox === 'drafts'

    if (isDraftsView) {
      const sql = `
        SELECT
          t.*,
          a.color AS account_color,
          a.icon AS account_icon,
          a.email AS account_email,
          COALESCE(dm.snippet, t.snippet) AS draft_snippet,
          COALESCE(dm.date, t.last_message_at) AS draft_date,
          dm.to_json AS draft_to_json,
          dm.from_json AS draft_from_json
        FROM threads t
        JOIN accounts a ON a.id = t.account_id
        LEFT JOIN messages dm ON dm.id = (
          SELECT m2.id
          FROM messages m2
          WHERE m2.thread_id = t.id AND m2.is_draft = 1
          ORDER BY m2.date DESC
          LIMIT 1
        )
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY COALESCE(dm.date, t.last_message_at) DESC
        LIMIT ?
      `
      params.push(opts.limit ?? 200)
      const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
      return rows.map((r) => {
        const base = this.mapThreadSummary(r)
        const draftTo = r.draft_to_json ? (JSON.parse(String(r.draft_to_json)) as EmailAddress[]) : []
        const draftFrom = r.draft_from_json ? (JSON.parse(String(r.draft_from_json)) as EmailAddress) : base.latestFrom
        return {
          ...base,
          isRead: true,
          hasDraft: true,
          lastMessageAt: Number(r.draft_date ?? base.lastMessageAt),
          snippet: cleanSnippet(String(r.draft_snippet ?? base.snippet)),
          participants: draftTo.length > 0 ? draftTo : base.participants,
          latestFrom: draftFrom
        }
      })
    }

    const useReceivedDate =
      Boolean(opts.folderName) || !['sent', 'drafts', 'waiting'].includes(opts.mailbox)

    if (useReceivedDate) {
      const sql = `
        SELECT
          t.*,
          a.color AS account_color,
          a.icon AS account_icon,
          a.email AS account_email,
          rm.from_json AS latest_external_from_json,
          COALESCE(rm.date, t.last_message_at) AS received_date,
          EXISTS (SELECT 1 FROM messages md WHERE md.thread_id = t.id AND md.is_draft = 1) AS has_draft
        FROM threads t
        JOIN accounts a ON a.id = t.account_id
        LEFT JOIN messages rm ON rm.id = (
          SELECT m2.id
          FROM messages m2
          WHERE m2.thread_id = t.id
            AND m2.is_draft = 0
            AND (
              m2.is_sent = 0
              OR (
                m2.folder_role = 'inbox'
                AND COALESCE(json_extract(m2.from_json, '$.email'), '') != ''
                AND LOWER(json_extract(m2.from_json, '$.email')) != LOWER(a.email)
              )
            )
          ORDER BY m2.date DESC
          LIMIT 1
        )
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY COALESCE(rm.date, t.last_message_at) DESC
        LIMIT ?
      `
      params.push(opts.limit ?? 200)
      const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
      return rows.map((r) => {
        const base = this.mapThreadSummary(r)
        return {
          ...base,
          lastMessageAt: Number(r.received_date ?? base.lastMessageAt)
        }
      })
    }

    const sql = `
      SELECT
        t.*,
        a.color AS account_color,
        a.icon AS account_icon,
        a.email AS account_email,
        (
          SELECT m2.from_json
          FROM messages m2
          WHERE m2.thread_id = t.id AND m2.is_sent = 0
          ORDER BY m2.date DESC
          LIMIT 1
        ) AS latest_external_from_json,
        EXISTS (SELECT 1 FROM messages md WHERE md.thread_id = t.id AND md.is_draft = 1) AS has_draft
      FROM threads t
      JOIN accounts a ON a.id = t.account_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY t.last_message_at DESC
      LIMIT ?
    `
    params.push(opts.limit ?? 200)
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.map((r) => this.mapThreadSummary(r))
  }

  getThreadDetail(threadId: string): ThreadDetail | null {
    const row = this.db
      .prepare(`
        SELECT t.*, a.color AS account_color, a.icon AS account_icon, a.email AS account_email
        FROM threads t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.id = ?
      `)
      .get(threadId) as Record<string, unknown> | undefined
    if (!row) return null

    const msgRows = this.db
      .prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY date ASC')
      .all(threadId) as Record<string, unknown>[]

    const messages: Message[] = msgRows.map((m) => {
      const attRows = this.db
        .prepare('SELECT * FROM attachments WHERE message_id = ?')
        .all(String(m.id)) as Record<string, unknown>[]
      const attachments: Attachment[] = attRows.map((a) => ({
        id: String(a.id),
        messageId: String(a.message_id),
        filename: String(a.filename),
        mimeType: String(a.mime_type),
        size: Number(a.size || 0),
        contentId: a.content_id ? String(a.content_id) : undefined,
        isInline: Boolean(a.is_inline),
        localPath: a.local_path ? String(a.local_path) : undefined,
        remoteAttachmentId: a.remote_attachment_id ? String(a.remote_attachment_id) : undefined
      }))

      return {
        id: String(m.id),
        accountId: String(m.account_id),
        threadId: String(m.thread_id),
        remoteId: String(m.remote_id),
        messageIdHeader: m.message_id_header ? String(m.message_id_header) : undefined,
        from: JSON.parse(String(m.from_json || '{}')),
        to: JSON.parse(String(m.to_json || '[]')),
        cc: JSON.parse(String(m.cc_json || '[]')),
        bcc: JSON.parse(String(m.bcc_json || '[]')),
        subject: String(m.subject || ''),
        snippet: cleanSnippet(String(m.snippet || '')),
        bodyText: String(m.body_text || ''),
        bodyHtml: String(m.body_html || ''),
        date: Number(m.date),
        isRead: Boolean(m.is_read),
        isStarred: Boolean(m.is_starred),
        isDraft: Boolean(m.is_draft),
        isSent: Boolean(m.is_sent),
        folderRole: m.folder_role as Folder['role'],
        folderName: m.folder_name ? String(m.folder_name) : undefined,
        labels: JSON.parse(String(m.labels_json || '[]')),
        category: (m.category as 'people' | 'updates') || 'people',
        hasAttachments: Boolean(m.has_attachments),
        attachments,
        signInCode: m.sign_in_code ? String(m.sign_in_code) : undefined,
        trackersBlocked: Number(m.trackers_blocked || 0),
        scamWarning: m.scam_warning ? String(m.scam_warning) : undefined,
        unsubscribeUrl: m.unsubscribe_url ? String(m.unsubscribe_url) : undefined,
        unsubscribeMailto: m.unsubscribe_mailto ? String(m.unsubscribe_mailto) : undefined,
        calendarInvite: m.calendar_invite_json ? JSON.parse(String(m.calendar_invite_json)) : undefined
      }
    })

    return {
      ...this.mapThreadSummary(row),
      messages
    }
  }

  searchThreads(
    parsed: ParsedSearchQuery,
    accountIds?: string[],
    includeTrashAndJunk = false
  ): ThreadSummary[] {
    const where: string[] = []
    const params: (string | number)[] = []

    if (accountIds && accountIds.length > 0) {
      where.push(`t.account_id IN (${accountIds.map(() => '?').join(',')})`)
      params.push(...accountIds)
    }
    if (parsed.from) {
      where.push(`(LOWER(t.latest_from_json) LIKE ? OR LOWER(t.participants_json) LIKE ?)`)
      const pat = `%${parsed.from.toLowerCase()}%`
      params.push(pat, pat)
    }
    if (parsed.hasAttachment) {
      where.push('t.has_attachments = 1')
    }
    if (parsed.attachmentType) {
      where.push(`EXISTS (SELECT 1 FROM messages m JOIN attachments att ON att.message_id = m.id WHERE m.thread_id = t.id AND LOWER(att.filename) LIKE ?)`)
      params.push(`%.${parsed.attachmentType.toLowerCase()}`)
    }
    if (parsed.afterDate) {
      where.push('t.last_message_at >= ?')
      params.push(parsed.afterDate)
    }
    if (parsed.beforeDate) {
      where.push('t.last_message_at <= ?')
      params.push(parsed.beforeDate)
    }
    if (parsed.folder) {
      where.push('(LOWER(t.folder_name) LIKE ? OR LOWER(t.folder_role) = ?)')
      params.push(`%${parsed.folder.toLowerCase()}%`, parsed.folder.toLowerCase())
    } else if (!includeTrashAndJunk) {
      where.push("t.folder_role NOT IN ('trash', 'junk')")
    }
    if (parsed.isUnread) {
      where.push('t.is_read = 0')
    }
    if (parsed.textQuery.trim()) {
      const ftsSafe = parsed.textQuery
        .trim()
        .replace(/["'*]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => `"${w}"*`)
        .join(' AND ')
      if (ftsSafe) {
        where.push(`t.id IN (SELECT thread_id FROM messages_fts WHERE messages_fts MATCH ?)`)
        params.push(ftsSafe)
      }
    }

    const sql = `
      SELECT
        t.*,
        a.color AS account_color,
        a.icon AS account_icon,
        a.email AS account_email,
        (
          SELECT m2.from_json
          FROM messages m2
          WHERE m2.thread_id = t.id AND m2.is_sent = 0
          ORDER BY m2.date DESC
          LIMIT 1
        ) AS latest_external_from_json,
        EXISTS (SELECT 1 FROM messages md WHERE md.thread_id = t.id AND md.is_draft = 1) AS has_draft
      FROM threads t
      JOIN accounts a ON a.id = t.account_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY t.last_message_at DESC
      LIMIT 150
    `
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.map((r) => this.mapThreadSummary(r))
  }

  // ---- AI Assistant Exact SQL Analytics ----
  getMailDateWindowData(
    startMs: number,
    endMs: number,
    accountIds?: string[]
  ): {
    totalReceived: number
    inboxReceived: number
    totalSent: number
    unreadReceived: number
    byAccount: { email: string; received: number; inboxReceived: number; sent: number; unread: number }[]
    threads: ThreadSummary[]
  } {
    const accFilter =
      accountIds && accountIds.length > 0
        ? ` AND m.account_id IN (${accountIds.map(() => '?').join(',')})`
        : ''
    const accParams = accountIds && accountIds.length > 0 ? accountIds : []

    const msgRows = this.db
      .prepare(
        `SELECT m.is_sent, m.is_read, m.folder_role, a.email AS account_email
         FROM messages m
         JOIN accounts a ON a.id = m.account_id
         WHERE m.date >= ? AND m.date <= ?
           AND m.folder_role NOT IN ('trash', 'junk')
           ${accFilter}`
      )
      .all(startMs, endMs, ...accParams) as {
      is_sent: number
      is_read: number
      folder_role: string
      account_email: string
    }[]

    let totalReceived = 0
    let inboxReceived = 0
    let totalSent = 0
    let unreadReceived = 0
    const byAccMap = new Map<string, { email: string; received: number; inboxReceived: number; sent: number; unread: number }>()

    for (const r of msgRows) {
      const email = String(r.account_email)
      let entry = byAccMap.get(email)
      if (!entry) {
        entry = { email, received: 0, inboxReceived: 0, sent: 0, unread: 0 }
        byAccMap.set(email, entry)
      }
      if (r.is_sent === 1) {
        totalSent += 1
        entry.sent += 1
      } else {
        totalReceived += 1
        entry.received += 1
        if (r.folder_role === 'inbox') {
          inboxReceived += 1
          entry.inboxReceived += 1
        }
        if (r.is_read === 0) {
          unreadReceived += 1
          entry.unread += 1
        }
      }
    }

    const threadRows = this.db
      .prepare(
        `SELECT DISTINCT t.*, a.color AS account_color, a.icon AS account_icon, a.email AS account_email
         FROM threads t
         JOIN accounts a ON a.id = t.account_id
         JOIN messages m ON m.thread_id = t.id
         WHERE m.date >= ? AND m.date <= ?
           AND m.folder_role NOT IN ('trash', 'junk')
           ${accFilter}
         ORDER BY t.last_message_at DESC
         LIMIT 40`
      )
      .all(startMs, endMs, ...accParams) as Record<string, unknown>[]

    return {
      totalReceived,
      inboxReceived,
      totalSent,
      unreadReceived,
      byAccount: Array.from(byAccMap.values()).sort((a, b) => b.received - a.received),
      threads: threadRows.map((r) => this.mapThreadSummary(r))
    }
  }

  getDailyMailVolume(
    days = 14,
    accountIds?: string[]
  ): {
    dateKey: string
    label: string
    received: number
    inboxReceived: number
    sent: number
    unread: number
    byAccount: Record<string, number>
  }[] {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1), 0, 0, 0, 0)
    const startMs = start.getTime()

    const accFilter =
      accountIds && accountIds.length > 0
        ? ` AND m.account_id IN (${accountIds.map(() => '?').join(',')})`
        : ''
    const accParams = accountIds && accountIds.length > 0 ? accountIds : []

    const rows = this.db
      .prepare(
        `SELECT m.date, m.is_sent, m.is_read, m.folder_role, a.email AS account_email
         FROM messages m
         JOIN accounts a ON a.id = m.account_id
         WHERE m.date >= ?
           AND m.folder_role NOT IN ('trash', 'junk')
           ${accFilter}`
      )
      .all(startMs, ...accParams) as {
      date: number
      is_sent: number
      is_read: number
      folder_role: string
      account_email: string
    }[]

    const bucketMap = new Map<
      string,
      {
        dateKey: string
        label: string
        received: number
        inboxReceived: number
        sent: number
        unread: number
        byAccount: Record<string, number>
      }
    >()

    for (let i = 0; i < days; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      bucketMap.set(key, { dateKey: key, label, received: 0, inboxReceived: 0, sent: 0, unread: 0, byAccount: {} })
    }

    for (const r of rows) {
      const d = new Date(Number(r.date))
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const b = bucketMap.get(key)
      if (!b) continue
      if (r.is_sent === 1) {
        b.sent += 1
      } else {
        b.received += 1
        if (r.folder_role === 'inbox') b.inboxReceived += 1
        if (r.is_read === 0) b.unread += 1
        const email = String(r.account_email)
        b.byAccount[email] = (b.byAccount[email] || 0) + 1
      }
    }

    return Array.from(bucketMap.values()).reverse()
  }

  // ---- Thread mutations ----
  getKnownRemoteIds(accountId: string): Set<string> {
    const rows = this.db
      .prepare('SELECT remote_id FROM messages WHERE account_id = ?')
      .all(accountId) as { remote_id: string }[]
    return new Set(rows.map((r) => r.remote_id))
  }

  getRemoteIdsMissingAttachments(accountId: string): Set<string> {
    const rows = this.db
      .prepare(`
        SELECT m.remote_id
        FROM messages m
        WHERE m.account_id = ?
          AND m.has_attachments = 1
          AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id)
      `)
      .all(accountId) as { remote_id: string }[]
    return new Set(rows.map((r) => r.remote_id))
  }

  updateLocalMessageFlagsByRemoteId(
    accountId: string,
    remoteId: string,
    isRead: boolean,
    isStarred: boolean
  ): void {
    const row = this.db
      .prepare('SELECT id, thread_id, is_read, is_starred, date FROM messages WHERE account_id = ? AND remote_id = ?')
      .get(accountId, remoteId) as
      | { id: string; thread_id: string; is_read: number; is_starred: number; date: number }
      | undefined
    if (!row) return

    const guard = this.getActiveMutation(row.thread_id)
    const nextRead = guard && row.date <= guard.recordedAt && guard.isRead !== undefined ? guard.isRead : isRead
    const nextStarred =
      guard && row.date <= guard.recordedAt && guard.isStarred !== undefined ? guard.isStarred : isStarred
    const rVal = nextRead ? 1 : 0
    const sVal = nextStarred ? 1 : 0

    if (row.is_read === rVal && row.is_starred === sVal) return

    this.db.prepare('UPDATE messages SET is_read = ?, is_starred = ? WHERE id = ?').run(rVal, sVal, row.id)
    const agg = this.db
      .prepare('SELECT MIN(is_read) AS all_read, MAX(is_starred) AS any_starred FROM messages WHERE thread_id = ?')
      .get(row.thread_id) as { all_read: number | null; any_starred: number | null } | undefined
    if (agg) {
      this.db
        .prepare('UPDATE threads SET is_read = ?, is_starred = ? WHERE id = ?')
        .run(agg.all_read ?? rVal, agg.any_starred ?? sVal, row.thread_id)
    }
  }

  updateLocalMessageLabelsByRemoteId(
    accountId: string,
    remoteId: string,
    patch: {
      isRead: boolean
      isStarred: boolean
      isDraft: boolean
      folderRole: Folder['role']
      folderName: string
      labels: string[]
    }
  ): boolean {
    const row = this.db
      .prepare('SELECT id, thread_id, date FROM messages WHERE account_id = ? AND remote_id = ?')
      .get(accountId, remoteId) as { id: string; thread_id: string; date: number } | undefined
    if (!row) return false

    const guard = this.getActiveMutation(row.thread_id)
    if (guard && row.date <= guard.recordedAt) {
      if (guard.deleted) return true
      if (guard.folderRole && patch.folderRole !== guard.folderRole) {
        return true
      }
    }

    const nextRead =
      guard && row.date <= guard.recordedAt && guard.isRead !== undefined ? guard.isRead : patch.isRead
    const nextStarred =
      guard && row.date <= guard.recordedAt && guard.isStarred !== undefined ? guard.isStarred : patch.isStarred

    this.db
      .prepare(
        `UPDATE messages
         SET is_read = ?, is_starred = ?, is_draft = ?, folder_role = ?, folder_name = ?, labels_json = ?
         WHERE id = ?`
      )
      .run(
        nextRead ? 1 : 0,
        nextStarred ? 1 : 0,
        patch.isDraft ? 1 : 0,
        patch.folderRole,
        patch.folderName,
        JSON.stringify(patch.labels),
        row.id
      )

    this.recomputeThreadFromMessages(row.thread_id)
    return true
  }

  private recomputeThreadFromMessages(threadId: string): void {
    const remaining = this.db
      .prepare(
        `SELECT COUNT(*) AS cnt,
          MAX(date) AS last_date,
          MIN(is_read) AS all_read,
          MAX(is_starred) AS any_starred,
          MAX(has_attachments) AS any_att,
          (SELECT subject FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_subject,
          (SELECT snippet FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_snippet,
          (SELECT is_sent FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_is_sent,
          (SELECT from_json FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_from,
          (SELECT folder_role FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_folder_role,
          (SELECT folder_name FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_folder_name,
          (SELECT folder_name FROM messages WHERE thread_id = ? AND folder_role = 'inbox' ORDER BY date DESC LIMIT 1) AS inbox_folder_name
        FROM messages WHERE thread_id = ?`
      )
      .get(threadId, threadId, threadId, threadId, threadId, threadId, threadId, threadId) as {
      cnt: number
      last_date: number | null
      all_read: number | null
      any_starred: number | null
      any_att: number | null
      last_subject: string | null
      last_snippet: string | null
      last_is_sent: number | null
      last_from: string | null
      last_folder_role: string | null
      last_folder_name: string | null
      inbox_folder_name: string | null
    }

    if (!remaining || remaining.cnt === 0) {
      this.db.prepare('DELETE FROM threads WHERE id = ?').run(threadId)
      return
    }

    const labelRows = this.db
      .prepare('SELECT labels_json FROM messages WHERE thread_id = ?')
      .all(threadId) as { labels_json: string | null }[]
    const mergedLabels = Array.from(
      new Set(
        labelRows.flatMap((r) => {
          try {
            return JSON.parse(r.labels_json || '[]') as string[]
          } catch {
            return []
          }
        })
      )
    )

    const effectiveRole = remaining.inbox_folder_name ? 'inbox' : remaining.last_folder_role || 'archive'
    const effectiveName = remaining.inbox_folder_name || remaining.last_folder_name || 'Archive'
    const waitingSince = remaining.last_is_sent === 1 ? remaining.last_date : null

    this.db
      .prepare(
        `UPDATE threads
         SET message_count = ?, last_message_at = COALESCE(?, last_message_at),
             is_read = ?, is_starred = ?, has_attachments = ?,
             subject = COALESCE(?, subject), snippet = COALESCE(?, snippet),
             waiting_since = ?, latest_from_json = COALESCE(?, latest_from_json),
             folder_role = ?, folder_name = ?, labels_json = ?
         WHERE id = ?`
      )
      .run(
        remaining.cnt,
        remaining.last_date,
        remaining.all_read ? 1 : 0,
        remaining.any_starred ? 1 : 0,
        remaining.any_att ? 1 : 0,
        remaining.last_subject,
        remaining.last_snippet,
        waitingSince,
        remaining.last_from,
        effectiveRole,
        effectiveName,
        JSON.stringify(mergedLabels),
        threadId
      )
  }

  setThreadRead(threadIds: string[], isRead: boolean): void {
    if (threadIds.length === 0) return
    const ph = threadIds.map(() => '?').join(',')
    this.db.prepare(`UPDATE threads SET is_read = ? WHERE id IN (${ph})`).run(isRead ? 1 : 0, ...threadIds)
    this.db.prepare(`UPDATE messages SET is_read = ? WHERE thread_id IN (${ph})`).run(isRead ? 1 : 0, ...threadIds)
    this.recordThreadMutation(threadIds, { isRead }, 30_000)
  }

  setThreadStarred(threadIds: string[], isStarred: boolean): void {
    if (threadIds.length === 0) return
    const ph = threadIds.map(() => '?').join(',')
    this.db.prepare(`UPDATE threads SET is_starred = ? WHERE id IN (${ph})`).run(isStarred ? 1 : 0, ...threadIds)
    this.recordThreadMutation(threadIds, { isStarred }, 30_000)
  }

  moveThreads(threadIds: string[], folderRole: Folder['role'], folderName?: string): void {
    if (threadIds.length === 0) return
    const ph = threadIds.map(() => '?').join(',')
    const name = folderName || folderRole.charAt(0).toUpperCase() + folderRole.slice(1)
    this.db
      .prepare(`UPDATE threads SET folder_role = ?, folder_name = ?, snoozed_until = NULL WHERE id IN (${ph})`)
      .run(folderRole, name, ...threadIds)
    this.db
      .prepare(`UPDATE messages SET folder_role = ?, folder_name = ? WHERE thread_id IN (${ph})`)
      .run(folderRole, name, ...threadIds)
    this.recordThreadMutation(threadIds, { deleted: false, folderRole, folderName: name }, 90_000)

    // Keep labels_json in sync when moving to a custom folder (e.g. Gmail labels)
    if (folderRole === 'custom' && folderName) {
      for (const tid of threadIds) {
        const row = this.db.prepare('SELECT labels_json FROM threads WHERE id = ?').get(tid) as
          | { labels_json: string | null }
          | undefined
        let labels: string[] = []
        try {
          labels = JSON.parse(row?.labels_json || '[]') as string[]
        } catch {
          labels = []
        }
        const nextLabels = Array.from(new Set([...labels.filter((l) => l !== 'INBOX'), folderName]))
        const serialized = JSON.stringify(nextLabels)
        this.db.prepare('UPDATE threads SET labels_json = ? WHERE id = ?').run(serialized, tid)
        this.db.prepare('UPDATE messages SET labels_json = ? WHERE thread_id = ?').run(serialized, tid)
      }
    }
  }

  snoozeThreads(threadIds: string[], untilMs: number | null): void {
    const ph = threadIds.map(() => '?').join(',')
    this.db.prepare(`UPDATE threads SET snoozed_until = ? WHERE id IN (${ph})`).run(untilMs, ...threadIds)
  }

  deleteThreadsPermanently(threadIds: string[]): void {
    if (threadIds.length === 0) return
    const ph = threadIds.map(() => '?').join(',')
    const msgs = this.db
      .prepare(`SELECT account_id, remote_id FROM messages WHERE thread_id IN (${ph})`)
      .all(...threadIds) as { account_id: string; remote_id: string }[]
    const exp = Date.now() + 90_000
    for (const m of msgs) {
      if (m.remote_id) this.recentDeletedRemoteIds.set(`${m.account_id}|${m.remote_id}`, exp)
    }
    this.recordThreadMutation(threadIds, { deleted: true }, 90_000)
    this.db.prepare(`DELETE FROM messages_fts WHERE thread_id IN (${ph})`).run(...threadIds)
    this.db.prepare(`DELETE FROM threads WHERE id IN (${ph})`).run(...threadIds)
  }

  emptyFolder(role: 'trash' | 'junk', accountIds?: string[]): void {
    if (accountIds && accountIds.length > 0) {
      const ph = accountIds.map(() => '?').join(',')
      const ids = (
        this.db.prepare(`SELECT id FROM threads WHERE folder_role = ? AND account_id IN (${ph})`).all(role, ...accountIds) as {
          id: string
        }[]
      ).map((r) => r.id)
      if (ids.length) this.deleteThreadsPermanently(ids)
    } else {
      const ids = (this.db.prepare('SELECT id FROM threads WHERE folder_role = ?').all(role) as { id: string }[]).map((r) => r.id)
      if (ids.length) this.deleteThreadsPermanently(ids)
    }
  }

  listSubscriptions(accountIds?: string[]): SubscriptionGroup[] {
    const where = ["(t.unsubscribe_url IS NOT NULL OR t.unsubscribe_mailto IS NOT NULL)", "t.folder_role != 'trash'"]
    const params: string[] = []
    if (accountIds && accountIds.length > 0) {
      where.push(`t.account_id IN (${accountIds.map(() => '?').join(',')})`)
      params.push(...accountIds)
    }
    const rows = this.db
      .prepare(`
        SELECT t.id, t.account_id, t.latest_from_json, t.last_message_at, t.unsubscribe_url, t.unsubscribe_mailto
        FROM threads t
        WHERE ${where.join(' AND ')}
        ORDER BY t.last_message_at DESC
      `)
      .all(...params) as Record<string, unknown>[]

    const map = new Map<string, SubscriptionGroup>()
    for (const r of rows) {
      const from = JSON.parse(String(r.latest_from_json || '{}')) as { name?: string; email?: string }
      const email = (from.email || 'unknown').toLowerCase()
      const key = `${r.account_id}|${email}`
      const existing = map.get(key)
      if (existing) {
        existing.count += 1
        existing.threadIds.push(String(r.id))
        if (Number(r.last_message_at) > existing.latestAt) existing.latestAt = Number(r.last_message_at)
      } else {
        map.set(key, {
          senderEmail: email,
          senderName: from.name || email,
          accountId: String(r.account_id),
          count: 1,
          latestAt: Number(r.last_message_at),
          unsubscribeUrl: r.unsubscribe_url ? String(r.unsubscribe_url) : undefined,
          unsubscribeMailto: r.unsubscribe_mailto ? String(r.unsubscribe_mailto) : undefined,
          threadIds: [String(r.id)]
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }

  getMailboxCounts(accountIds?: string[]): Record<string, number> {
    const accFilter = accountIds && accountIds.length > 0 ? `AND account_id IN (${accountIds.map(() => '?').join(',')})` : ''
    const params = accountIds && accountIds.length > 0 ? accountIds : []
    const now = Date.now()

    const countQuery = (sql: string, extra: (string | number)[] = []) =>
      Number((this.db.prepare(sql).get(...extra, ...params) as { c: number }).c)

    return {
      inbox: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE folder_role = 'inbox' AND is_read = 0 AND (snoozed_until IS NULL OR snoozed_until <= ?) ${accFilter}`, [now]),
      inboxTotal: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE folder_role = 'inbox' AND (snoozed_until IS NULL OR snoozed_until <= ?) ${accFilter}`, [now]),
      people: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE folder_role = 'inbox' AND category = 'people' AND is_read = 0 AND (snoozed_until IS NULL OR snoozed_until <= ?) ${accFilter}`, [now]),
      updates: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE folder_role = 'inbox' AND category = 'updates' AND is_read = 0 AND (snoozed_until IS NULL OR snoozed_until <= ?) ${accFilter}`, [now]),
      starred: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE is_starred = 1 AND folder_role NOT IN ('trash', 'junk') ${accFilter}`),
      starredUnread: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE is_starred = 1 AND is_read = 0 AND folder_role NOT IN ('trash', 'junk') ${accFilter}`),
      snoozed: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE snoozed_until IS NOT NULL AND snoozed_until > ? ${accFilter}`, [now]),
      snoozedUnread: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE snoozed_until IS NOT NULL AND snoozed_until > ? AND is_read = 0 ${accFilter}`, [now]),
      waiting: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE waiting_since IS NOT NULL AND folder_role NOT IN ('trash', 'junk') ${accFilter}`),
      waitingUnread: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE waiting_since IS NOT NULL AND folder_role NOT IN ('trash', 'junk') AND is_read = 0 ${accFilter}`),
      drafts: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE (folder_role = 'drafts' OR EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = threads.id AND m.is_draft = 1)) AND folder_role NOT IN ('trash', 'junk') ${accFilter}`),
      draftsUnread: 0,
      sent: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE (folder_role = 'sent' OR EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = threads.id AND m.is_sent = 1)) AND folder_role NOT IN ('trash', 'junk') ${accFilter}`),
      sentUnread: 0,
      archive: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE folder_role = 'archive' ${accFilter}`),
      archiveUnread: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE folder_role = 'archive' AND is_read = 0 ${accFilter}`),
      junk: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE folder_role = 'junk' ${accFilter}`),
      junkUnread: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE folder_role = 'junk' AND is_read = 0 ${accFilter}`),
      trash: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE folder_role = 'trash' ${accFilter}`),
      trashUnread: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE folder_role = 'trash' AND is_read = 0 ${accFilter}`),
      scheduled: countQuery(`SELECT COUNT(*) AS c FROM scheduled_emails WHERE status = 'pending' ${accFilter}`)
    }
  }

  // ---- Calendar Events ----
  upsertCalendarEvent(ev: Omit<CalendarEvent, 'accountColor' | 'accountEmail'>): void {
    this.db
      .prepare(`
        INSERT INTO calendar_events (
          id, account_id, calendar_id, calendar_name, remote_id, title, description,
          location, meeting_url, start_at, end_at, all_day, attendees_json, attachments_json, status, source, read_only
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          location = excluded.location,
          meeting_url = excluded.meeting_url,
          start_at = excluded.start_at,
          end_at = excluded.end_at,
          all_day = excluded.all_day,
          attendees_json = excluded.attendees_json,
          attachments_json = excluded.attachments_json,
          status = excluded.status
      `)
      .run(
        ev.id,
        ev.accountId,
        ev.calendarId,
        ev.calendarName,
        ev.remoteId,
        ev.title,
        ev.description ?? '',
        ev.location ?? '',
        ev.meetingUrl ?? null,
        ev.startAt,
        ev.endAt,
        ev.allDay ? 1 : 0,
        JSON.stringify(ev.attendees || []),
        JSON.stringify(ev.attachments || []),
        ev.status,
        ev.source,
        ev.readOnly ? 1 : 0
      )
  }

  listCalendarEvents(startAt: number, endAt: number, accountIds?: string[]): CalendarEvent[] {
    const where = ['e.end_at >= ? AND e.start_at <= ?', "e.status != 'cancelled'"]
    const params: (string | number)[] = [startAt, endAt]
    if (accountIds && accountIds.length > 0) {
      where.push(`e.account_id IN (${accountIds.map(() => '?').join(',')})`)
      params.push(...accountIds)
    }
    const rows = this.db
      .prepare(`
        SELECT e.*, a.color AS account_color, a.icon AS account_icon, a.email AS account_email
        FROM calendar_events e
        JOIN accounts a ON a.id = e.account_id
        WHERE ${where.join(' AND ')}
        ORDER BY e.start_at ASC
      `)
      .all(...params) as Record<string, unknown>[]

    return rows.map((r) => ({
      id: String(r.id),
      accountId: String(r.account_id),
      accountColor: String(r.account_color),
      accountEmail: String(r.account_email),
      calendarId: String(r.calendar_id),
      calendarName: String(r.calendar_name),
      remoteId: String(r.remote_id),
      title: String(r.title),
      description: r.description ? String(r.description) : undefined,
      location: r.location ? String(r.location) : undefined,
      meetingUrl: r.meeting_url ? String(r.meeting_url) : undefined,
      startAt: Number(r.start_at),
      endAt: Number(r.end_at),
      allDay: Boolean(r.all_day),
      attendees: JSON.parse(String(r.attendees_json || '[]')),
      attachments: JSON.parse(String(r.attachments_json || '[]')),
      status: r.status as CalendarEvent['status'],
      source: r.source as CalendarEvent['source'],
      readOnly: Boolean(r.read_only)
    }))
  }

  deleteCalendarEvent(id: string): void {
    this.db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id)
  }

  deleteCalendarEventsBySource(accountId: string, source: CalendarEvent['source']): void {
    this.db.prepare('DELETE FROM calendar_events WHERE account_id = ? AND source = ?').run(accountId, source)
  }

  // ---- Scheduled Emails ----
  listScheduledEmails(accountIds?: string[]): ScheduledEmail[] {
    let sql = "SELECT * FROM scheduled_emails WHERE status = 'pending'"
    const params: string[] = []
    if (accountIds && accountIds.length > 0) {
      sql += ` AND account_id IN (${accountIds.map(() => '?').join(',')})`
      params.push(...accountIds)
    }
    sql += ' ORDER BY send_at ASC'
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: String(r.id),
      accountId: String(r.account_id),
      to: JSON.parse(String(r.to_json)),
      cc: JSON.parse(String(r.cc_json || '[]')),
      bcc: JSON.parse(String(r.bcc_json || '[]')),
      subject: String(r.subject),
      bodyHtml: String(r.body_html),
      bodyText: String(r.body_text),
      replyToThreadId: r.reply_to_thread_id ? String(r.reply_to_thread_id) : undefined,
      sendAt: Number(r.send_at),
      status: r.status as ScheduledEmail['status'],
      error: r.error ? String(r.error) : undefined
    }))
  }

  insertScheduledEmail(s: ScheduledEmail): void {
    this.db
      .prepare(`
        INSERT INTO scheduled_emails (id, account_id, to_json, cc_json, bcc_json, subject, body_html, body_text, reply_to_thread_id, send_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        s.id,
        s.accountId,
        JSON.stringify(s.to),
        JSON.stringify(s.cc),
        JSON.stringify(s.bcc),
        s.subject,
        s.bodyHtml,
        s.bodyText,
        s.replyToThreadId ?? null,
        s.sendAt,
        s.status
      )
  }

  updateScheduledStatus(id: string, status: ScheduledEmail['status'], error?: string): void {
    this.db.prepare('UPDATE scheduled_emails SET status = ?, error = ? WHERE id = ?').run(status, error ?? null, id)
  }

  // ---- Snippets ----
  listSnippets(): Snippet[] {
    const rows = this.db.prepare('SELECT * FROM snippets ORDER BY title ASC').all() as Record<string, unknown>[]
    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      shortcut: String(r.shortcut),
      body: String(r.body)
    }))
  }

  upsertSnippet(s: Snippet): void {
    this.db
      .prepare('INSERT INTO snippets (id, title, shortcut, body) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, shortcut = excluded.shortcut, body = excluded.body')
      .run(s.id, s.title, s.shortcut, s.body)
  }

  deleteSnippet(id: string): void {
    this.db.prepare('DELETE FROM snippets WHERE id = ?').run(id)
  }

  // ---- Sent samples for AI Voice Profile ----
  getRecentSentBodies(accountId: string, limit = 12): string[] {
    const rows = this.db
      .prepare('SELECT body_text FROM messages WHERE account_id = ? AND is_sent = 1 AND LENGTH(body_text) > 15 ORDER BY date DESC LIMIT ?')
      .all(accountId, limit) as { body_text: string }[]
    return rows.map((r) => r.body_text.slice(0, 600))
  }

  private mapThreadSummary(r: Record<string, unknown>): ThreadSummary {
    return {
      id: String(r.id),
      accountId: String(r.account_id),
      accountColor: String(r.account_color || '#E87A48'),
      accountIcon: (r.account_icon ? String(r.account_icon) : undefined) as ThreadSummary['accountIcon'],
      accountEmail: String(r.account_email || ''),
      subject: String(r.subject || '(No subject)'),
      snippet: cleanSnippet(String(r.snippet || '')),
      participants: JSON.parse(String(r.participants_json || '[]')),
      lastMessageAt: Number(r.last_message_at),
      messageCount: Number(r.message_count || 1),
      isRead: Boolean(r.is_read),
      isStarred: Boolean(r.is_starred),
      hasAttachments: Boolean(r.has_attachments),
      category: (r.category as 'people' | 'updates') || 'people',
      folderRole: (r.folder_role as Folder['role']) || 'inbox',
      folderName: r.folder_name ? String(r.folder_name) : undefined,
      labels: JSON.parse(String(r.labels_json || '[]')),
      signInCode: r.sign_in_code ? String(r.sign_in_code) : undefined,
      snoozedUntil: r.snoozed_until ? Number(r.snoozed_until) : undefined,
      waitingSince: r.waiting_since ? Number(r.waiting_since) : undefined,
      trackersBlocked: Number(r.trackers_blocked || 0),
      scamWarning: r.scam_warning ? String(r.scam_warning) : undefined,
      unsubscribeUrl: r.unsubscribe_url ? String(r.unsubscribe_url) : undefined,
      latestFrom: JSON.parse(String(r.latest_from_json || '{"name":"","email":""}')),
      latestExternalFrom: r.latest_external_from_json
        ? (JSON.parse(String(r.latest_external_from_json)) as EmailAddress)
        : undefined,
      hasDraft: Boolean(r.has_draft)
    }
  }

  // ---- Reminders ----
  listReminders(accountIds?: string[]): Reminder[] {
    let rows: Record<string, unknown>[]
    if (accountIds && accountIds.length > 0) {
      const ph = accountIds.map(() => '?').join(',')
      rows = this.db
        .prepare(
          `SELECT * FROM reminders
           WHERE completed_at IS NULL AND (account_id IS NULL OR account_id = '' OR account_id IN (${ph}))
           ORDER BY due_at ASC`
        )
        .all(...accountIds) as Record<string, unknown>[]
    } else {
      rows = this.db
        .prepare('SELECT * FROM reminders WHERE completed_at IS NULL ORDER BY due_at ASC')
        .all() as Record<string, unknown>[]
    }
    return rows.map((r) => this.mapReminder(r))
  }

  createReminder(id: string, payload: CreateReminderPayload): Reminder {
    const now = Date.now()
    this.db
      .prepare(`
        INSERT INTO reminders (
          id, account_id, thread_id, thread_subject, thread_sender, title, note,
          due_at, only_if_no_reply, completed_at, notified_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
      `)
      .run(
        id,
        payload.accountId || null,
        payload.threadId || null,
        payload.threadSubject || null,
        payload.threadSender || null,
        payload.title,
        payload.note || null,
        payload.dueAt,
        payload.onlyIfNoReply ? 1 : 0,
        now
      )
    return {
      id,
      accountId: payload.accountId,
      threadId: payload.threadId,
      threadSubject: payload.threadSubject,
      threadSender: payload.threadSender,
      title: payload.title,
      note: payload.note,
      dueAt: payload.dueAt,
      onlyIfNoReply: Boolean(payload.onlyIfNoReply),
      completedAt: null,
      notifiedAt: null,
      createdAt: now
    }
  }

  completeReminder(id: string): void {
    this.db.prepare('UPDATE reminders SET completed_at = ? WHERE id = ?').run(Date.now(), id)
  }

  snoozeReminder(id: string, dueAt: number): void {
    this.db.prepare('UPDATE reminders SET due_at = ?, notified_at = NULL WHERE id = ?').run(dueAt, id)
  }

  deleteReminder(id: string): void {
    this.db.prepare('DELETE FROM reminders WHERE id = ?').run(id)
  }

  getDueUnnotifiedReminders(now: number): Reminder[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM reminders WHERE completed_at IS NULL AND notified_at IS NULL AND due_at <= ? ORDER BY due_at ASC'
      )
      .all(now) as Record<string, unknown>[]
    return rows.map((r) => this.mapReminder(r))
  }

  markReminderNotified(id: string): void {
    this.db.prepare('UPDATE reminders SET notified_at = ? WHERE id = ?').run(Date.now(), id)
  }

  autoCancelNoReplyReminders(): number {
    const rows = this.db
      .prepare(
        `SELECT r.id FROM reminders r
         WHERE r.completed_at IS NULL AND r.only_if_no_reply = 1 AND r.thread_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM messages m
             WHERE m.thread_id = r.thread_id AND m.is_sent = 0 AND m.date > r.created_at
           )`
      )
      .all() as { id: string }[]
    const now = Date.now()
    for (const row of rows) {
      this.db.prepare('UPDATE reminders SET completed_at = ? WHERE id = ?').run(now, row.id)
    }
    return rows.length
  }

  private mapReminder(r: Record<string, unknown>): Reminder {
    return {
      id: String(r.id),
      accountId: r.account_id ? String(r.account_id) : undefined,
      threadId: r.thread_id ? String(r.thread_id) : undefined,
      threadSubject: r.thread_subject ? String(r.thread_subject) : undefined,
      threadSender: r.thread_sender ? String(r.thread_sender) : undefined,
      title: String(r.title),
      note: r.note ? String(r.note) : undefined,
      dueAt: Number(r.due_at),
      onlyIfNoReply: Boolean(r.only_if_no_reply),
      completedAt: r.completed_at ? Number(r.completed_at) : null,
      notifiedAt: r.notified_at ? Number(r.notified_at) : null,
      createdAt: Number(r.created_at)
    }
  }

  // ---- AI Thread Pre-Drafts ----
  listPreDrafts(): ThreadPreDraft[] {
    const rows = this.db
      .prepare('SELECT * FROM thread_predrafts ORDER BY created_at DESC LIMIT 100')
      .all() as Record<string, unknown>[]
    return rows.map((r) => ({
      threadId: String(r.thread_id),
      accountId: String(r.account_id),
      subject: String(r.subject),
      body: String(r.body),
      providerLabel: String(r.provider_label),
      createdAt: Number(r.created_at)
    }))
  }

  getPreDraft(threadId: string): ThreadPreDraft | null {
    const r = this.db
      .prepare('SELECT * FROM thread_predrafts WHERE thread_id = ?')
      .get(threadId) as Record<string, unknown> | undefined
    if (!r) return null
    return {
      threadId: String(r.thread_id),
      accountId: String(r.account_id),
      subject: String(r.subject),
      body: String(r.body),
      providerLabel: String(r.provider_label),
      createdAt: Number(r.created_at)
    }
  }

  upsertPreDraft(pd: ThreadPreDraft): void {
    this.db
      .prepare(`
        INSERT INTO thread_predrafts (thread_id, account_id, subject, body, provider_label, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET
          subject = excluded.subject,
          body = excluded.body,
          provider_label = excluded.provider_label,
          created_at = excluded.created_at
      `)
      .run(pd.threadId, pd.accountId, pd.subject, pd.body, pd.providerLabel, pd.createdAt)
  }

  deletePreDraft(threadId: string): void {
    this.db.prepare('DELETE FROM thread_predrafts WHERE thread_id = ?').run(threadId)
  }

  deletePreDraftsBySender(senderEmail: string): number {
    const target = senderEmail.toLowerCase().trim()
    if (!target) return 0
    const rows = this.db
      .prepare(
        `SELECT p.thread_id, t.latest_from_json
         FROM thread_predrafts p
         JOIN threads t ON t.id = p.thread_id`
      )
      .all() as { thread_id: string; latest_from_json: string }[]
    let removed = 0
    const del = this.db.prepare('DELETE FROM thread_predrafts WHERE thread_id = ?')
    for (const r of rows) {
      try {
        const from = JSON.parse(r.latest_from_json || '{}') as EmailAddress
        if ((from.email || '').toLowerCase().trim() === target) {
          del.run(r.thread_id)
          removed++
        }
      } catch {
        // ignore
      }
    }
    return removed
  }

  clearAllPreDrafts(): void {
    this.db.prepare('DELETE FROM thread_predrafts').run()
  }

  // ---- Autopilot Rules & Activity Log ----
  listAutopilotRules(): AutopilotRule[] {
    const rows = this.db
      .prepare('SELECT * FROM autopilot_rules ORDER BY created_at DESC')
      .all() as Record<string, unknown>[]
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      prompt: String(r.prompt),
      enabled: Boolean(r.enabled),
      conditions: JSON.parse(String(r.conditions_json || '{}')),
      actions: JSON.parse(String(r.actions_json || '[]')),
      runCount: Number(r.run_count || 0),
      lastRunAt: r.last_run_at ? Number(r.last_run_at) : null,
      createdAt: Number(r.created_at)
    }))
  }

  upsertAutopilotRule(rule: AutopilotRule): void {
    this.db
      .prepare(`
        INSERT INTO autopilot_rules (id, name, prompt, enabled, conditions_json, actions_json, run_count, last_run_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          prompt = excluded.prompt,
          enabled = excluded.enabled,
          conditions_json = excluded.conditions_json,
          actions_json = excluded.actions_json
      `)
      .run(
        rule.id,
        rule.name,
        rule.prompt,
        rule.enabled ? 1 : 0,
        JSON.stringify(rule.conditions),
        JSON.stringify(rule.actions),
        rule.runCount || 0,
        rule.lastRunAt || null,
        rule.createdAt
      )
  }

  toggleAutopilotRule(id: string, enabled: boolean): void {
    this.db.prepare('UPDATE autopilot_rules SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  }

  recordAutopilotRuleRun(id: string, delta: number): void {
    this.db
      .prepare('UPDATE autopilot_rules SET run_count = run_count + ?, last_run_at = ? WHERE id = ?')
      .run(delta, Date.now(), id)
  }

  deleteAutopilotRule(id: string): void {
    this.db.prepare('DELETE FROM autopilot_rules WHERE id = ?').run(id)
  }

  listAutopilotLogs(limit = 50): AutopilotLogEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM autopilot_logs ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: String(r.id),
      ruleId: r.rule_id ? String(r.rule_id) : undefined,
      ruleName: String(r.rule_name),
      threadId: r.thread_id ? String(r.thread_id) : undefined,
      threadSubject: r.thread_subject ? String(r.thread_subject) : undefined,
      actionSummary: String(r.action_summary),
      undoAction: (r.undo_action as AutopilotLogEntry['undoAction']) || null,
      createdAt: Number(r.created_at)
    }))
  }

  addAutopilotLog(entry: AutopilotLogEntry): void {
    this.db
      .prepare(`
        INSERT INTO autopilot_logs (id, rule_id, rule_name, thread_id, thread_subject, action_summary, undo_action, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        entry.id,
        entry.ruleId || null,
        entry.ruleName,
        entry.threadId || null,
        entry.threadSubject || null,
        entry.actionSummary,
        entry.undoAction || null,
        entry.createdAt
      )
  }

  deleteAutopilotLog(id: string): void {
    this.db.prepare('DELETE FROM autopilot_logs WHERE id = ?').run(id)
  }

  hasAutopilotProcessed(ruleId: string, threadId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS ok FROM autopilot_logs WHERE rule_id = ? AND thread_id = ? LIMIT 1')
      .get(ruleId, threadId) as { ok: number } | undefined
    return Boolean(row?.ok)
  }

  // ---- Voice Profiles ----
  listVoiceProfiles(): VoiceProfile[] {
    const rows = this.db
      .prepare('SELECT * FROM voice_profiles ORDER BY is_default DESC, updated_at DESC')
      .all() as Record<string, unknown>[]
    return rows.map((r) => ({
      id: String(r.id),
      kind: (r.kind as VoiceProfileKind) || 'custom',
      name: String(r.name),
      description: String(r.description || ''),
      accountIds: JSON.parse(String(r.account_ids_json || '[]')),
      styleSummary: String(r.style_summary || ''),
      greetingStyle: r.greeting_style ? String(r.greeting_style) : undefined,
      signOffStyle: r.sign_off_style ? String(r.sign_off_style) : undefined,
      sampleCount: Number(r.sample_count || 0),
      isDefault: Boolean(r.is_default),
      updatedAt: Number(r.updated_at)
    }))
  }

  upsertVoiceProfile(vp: VoiceProfile): void {
    if (vp.isDefault) {
      this.db.prepare('UPDATE voice_profiles SET is_default = 0').run()
    }
    this.db
      .prepare(`
        INSERT INTO voice_profiles (
          id, kind, name, description, account_ids_json, style_summary,
          greeting_style, sign_off_style, sample_count, is_default, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind,
          name = excluded.name,
          description = excluded.description,
          account_ids_json = excluded.account_ids_json,
          style_summary = excluded.style_summary,
          greeting_style = excluded.greeting_style,
          sign_off_style = excluded.sign_off_style,
          sample_count = excluded.sample_count,
          is_default = excluded.is_default,
          updated_at = excluded.updated_at
      `)
      .run(
        vp.id,
        vp.kind,
        vp.name,
        vp.description || '',
        JSON.stringify(vp.accountIds || []),
        vp.styleSummary || '',
        vp.greetingStyle || null,
        vp.signOffStyle || null,
        vp.sampleCount || 0,
        vp.isDefault ? 1 : 0,
        vp.updatedAt
      )
  }

  deleteVoiceProfile(id: string): void {
    this.db.prepare('DELETE FROM voice_profiles WHERE id = ?').run(id)
  }

  getSentSamplesForAccounts(
    accountIds: string[],
    limit = 200
  ): { accountEmail: string; subject: string; to: string; toEmails: string[]; body: string }[] {
    let rows: Record<string, unknown>[]
    if (accountIds && accountIds.length > 0) {
      const ph = accountIds.map(() => '?').join(',')
      rows = this.db
        .prepare(
          `SELECT m.subject, m.to_json, m.body_text, a.email AS account_email
           FROM messages m
           JOIN accounts a ON a.id = m.account_id
           WHERE m.is_sent = 1 AND m.account_id IN (${ph}) AND LENGTH(TRIM(m.body_text)) > 20
           ORDER BY m.date DESC LIMIT ?`
        )
        .all(...accountIds, limit) as Record<string, unknown>[]
    } else {
      rows = this.db
        .prepare(
          `SELECT m.subject, m.to_json, m.body_text, a.email AS account_email
           FROM messages m
           JOIN accounts a ON a.id = m.account_id
           WHERE m.is_sent = 1 AND LENGTH(TRIM(m.body_text)) > 20
           ORDER BY m.date DESC LIMIT ?`
        )
        .all(limit) as Record<string, unknown>[]
    }
    return rows.map((r) => {
      const toList = JSON.parse(String(r.to_json || '[]')) as EmailAddress[]
      return {
        accountEmail: String(r.account_email || ''),
        subject: String(r.subject || ''),
        to: toList.map((p) => p.name || p.email).join(', '),
        toEmails: toList.map((p) => (p.email || '').toLowerCase()).filter(Boolean),
        body: String(r.body_text || '').trim().slice(0, 600)
      }
    })
  }

  getKnownCorrespondentEmails(): Set<string> {
    const rows = this.db
      .prepare('SELECT to_json, cc_json FROM messages WHERE is_sent = 1 ORDER BY date DESC LIMIT 500')
      .all() as { to_json: string; cc_json: string }[]
    const set = new Set<string>()
    for (const r of rows) {
      for (const raw of [r.to_json, r.cc_json]) {
        try {
          const list = JSON.parse(raw || '[]') as EmailAddress[]
          for (const p of list) {
            if (p.email) set.add(p.email.toLowerCase().trim())
          }
        } catch {
          // ignore
        }
      }
    }
    return set
  }

  getThreadIdsWithUserSent(threadIds: string[]): Set<string> {
    if (threadIds.length === 0) return new Set()
    const ph = threadIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT DISTINCT thread_id FROM messages WHERE is_sent = 1 AND thread_id IN (${ph})`)
      .all(...threadIds) as { thread_id: string }[]
    return new Set(rows.map((r) => String(r.thread_id)))
  }

  /**
   * Removes specific messages locally from SQLite only (never deletes from the remote server).
   * Used when filtering Outlook "Other" items out of EveryBox's Inbox.
   */
  removeLocalMessagesByRemoteIds(accountId: string, remoteIds: string[]): void {
    if (remoteIds.length === 0) return
    const ph = remoteIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT id, thread_id FROM messages WHERE account_id = ? AND remote_id IN (${ph})`)
      .all(accountId, ...remoteIds) as { id: string; thread_id: string }[]
    if (rows.length === 0) return
    const msgIds = rows.map((r) => r.id)
    const threadIds = Array.from(new Set(rows.map((r) => r.thread_id)))
    const msgPh = msgIds.map(() => '?').join(',')
    this.db.prepare(`DELETE FROM messages_fts WHERE message_id IN (${msgPh})`).run(...msgIds)
    this.db.prepare(`DELETE FROM messages WHERE id IN (${msgPh})`).run(...msgIds)
    for (const tid of threadIds) {
      this.recomputeThreadFromMessages(tid)
    }
  }
}
