import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import type {
  Account,
  AppSettings,
  Attachment,
  CalendarEvent,
  Folder,
  MailboxId,
  Message,
  ParsedSearchQuery,
  ScheduledEmail,
  Snippet,
  SubscriptionGroup,
  ThreadDetail,
  ThreadSummary,
  Workspace
} from '../../shared/types'

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  matchSystemTheme: false,
  lightTheme: 'light',
  darkTheme: 'dark',
  readerWidth: 'comfortable',
  accountOrder: [],
  defaultReplyAll: false,
  undoSendSeconds: 5,
  ai: {
    provider: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: '',
    lmStudioUrl: 'http://localhost:1234',
    lmStudioModel: '',
    anthropicModel: 'claude-sonnet-4-5',
    geminiModel: 'gemini-2.5-flash',
    openaiModel: 'gpt-4.1-mini',
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

export class GlassmailDB {
  public db: DatabaseSync
  public dbPath: string

  constructor(userDataDir: string) {
    this.dbPath = join(userDataDir, 'glassmail.sqlite')
    mkdirSync(dirname(this.dbPath), { recursive: true })
    this.db = new DatabaseSync(this.dbPath)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA foreign_keys = ON;')
    this.initSchema()
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
    `)
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
          (SELECT COUNT(*) FROM threads t WHERE t.account_id = a.id AND t.folder_role = 'inbox' AND t.is_read = 0 AND t.snoozed_until IS NULL) AS unread_count
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
          id, provider, name, email, color, signature_html, is_enabled, is_demo,
          imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure,
          smtp_separate_auth, smtp_username, caldav_url, caldav_username, ics_feed_url,
          calendar_enabled, last_sync_at, sync_status, sync_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          color = excluded.color,
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
        a.calendarEnabled === false ? 0 : 1,
        a.lastSyncAt ?? null,
        a.syncStatus ?? 'idle',
        a.syncError ?? null
      )
  }

  updateAccountSyncState(id: string, status: Account['syncStatus'], error?: string): void {
    this.db
      .prepare('UPDATE accounts SET sync_status = ?, sync_error = ?, last_sync_at = ? WHERE id = ?')
      .run(status, error ?? null, status === 'idle' ? Date.now() : null, id)
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
      calendarEnabled: r.calendar_enabled !== 0,
      lastSyncAt: r.last_sync_at ? Number(r.last_sync_at) : undefined,
      syncStatus: (r.sync_status as Account['syncStatus']) || 'idle',
      syncError: r.sync_error ? String(r.sync_error) : undefined,
      unreadCount: r.unread_count !== undefined ? Number(r.unread_count) : 0
    }
  }

  // ---- Workspaces ----
  listWorkspaces(): Workspace[] {
    const rows = this.db.prepare('SELECT * FROM workspaces ORDER BY shortcut_index ASC, name ASC').all() as Record<string, unknown>[]
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      accountIds: JSON.parse(String(r.account_ids || '[]')),
      color: String(r.color),
      shortcutIndex: r.shortcut_index ? Number(r.shortcut_index) : undefined
    }))
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
    return {
      id: String(r.id),
      accountId: String(r.account_id),
      remoteId: String(r.remote_id),
      name: String(r.name),
      path: String(r.path),
      role: r.role as Folder['role'],
      unreadCount: Number(r.unread_count || 0),
      totalCount: Number(r.total_count || 0)
    }
  }

  // ---- Threads & Messages ----
  upsertMessageAndThread(msg: Message, remoteThreadId: string): void {
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
        msg.subject || '(No subject)',
        msg.snippet || '',
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
          is_read = excluded.is_read,
          is_starred = excluded.is_starred,
          folder_role = excluded.folder_role,
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
        msg.subject || '(No subject)',
        msg.snippet || '',
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

    // Recompute thread message count & waiting_since
    const stats = this.db
      .prepare(`
        SELECT COUNT(*) AS cnt,
          (SELECT is_sent FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_is_sent,
          (SELECT date FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_date,
          (SELECT from_json FROM messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1) AS last_from
        FROM messages WHERE thread_id = ?
      `)
      .get(msg.threadId, msg.threadId, msg.threadId, msg.threadId) as {
      cnt: number
      last_is_sent: number
      last_date: number
      last_from: string
    }

    const waitingSince = stats.last_is_sent === 1 ? stats.last_date : null
    this.db
      .prepare('UPDATE threads SET message_count = ?, waiting_since = ?, latest_from_json = ? WHERE id = ?')
      .run(stats.cnt, waitingSince, stats.last_from || JSON.stringify(msg.from), msg.threadId)
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
      where.push('t.folder_name = ?')
      params.push(opts.folderName)
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
          where.push('t.is_starred = 1')
          break
        case 'snoozed':
          where.push('t.snoozed_until IS NOT NULL AND t.snoozed_until > ?')
          params.push(Date.now())
          break
        case 'waiting':
          where.push("t.waiting_since IS NOT NULL AND t.folder_role NOT IN ('trash', 'junk')")
          break
        case 'drafts':
          where.push("t.folder_role = 'drafts'")
          break
        case 'sent':
          where.push("t.folder_role = 'sent' OR EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = t.id AND m.is_sent = 1)")
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
          where.push('(t.unsubscribe_url IS NOT NULL OR t.unsubscribe_mailto IS NOT NULL)')
          break
        default:
          break
      }
    }

    const sql = `
      SELECT t.*, a.color AS account_color, a.email AS account_email
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
        SELECT t.*, a.color AS account_color, a.email AS account_email
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
        snippet: String(m.snippet || ''),
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

  searchThreads(parsed: ParsedSearchQuery, accountIds?: string[]): ThreadSummary[] {
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
      SELECT t.*, a.color AS account_color, a.email AS account_email
      FROM threads t
      JOIN accounts a ON a.id = t.account_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY t.last_message_at DESC
      LIMIT 150
    `
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.map((r) => this.mapThreadSummary(r))
  }

  // ---- Thread mutations ----
  setThreadRead(threadIds: string[], isRead: boolean): void {
    const ph = threadIds.map(() => '?').join(',')
    this.db.prepare(`UPDATE threads SET is_read = ? WHERE id IN (${ph})`).run(isRead ? 1 : 0, ...threadIds)
    this.db.prepare(`UPDATE messages SET is_read = ? WHERE thread_id IN (${ph})`).run(isRead ? 1 : 0, ...threadIds)
  }

  setThreadStarred(threadIds: string[], isStarred: boolean): void {
    const ph = threadIds.map(() => '?').join(',')
    this.db.prepare(`UPDATE threads SET is_starred = ? WHERE id IN (${ph})`).run(isStarred ? 1 : 0, ...threadIds)
  }

  moveThreads(threadIds: string[], folderRole: Folder['role'], folderName?: string): void {
    const ph = threadIds.map(() => '?').join(',')
    const name = folderName || folderRole.charAt(0).toUpperCase() + folderRole.slice(1)
    this.db
      .prepare(`UPDATE threads SET folder_role = ?, folder_name = ?, snoozed_until = NULL WHERE id IN (${ph})`)
      .run(folderRole, name, ...threadIds)
    this.db
      .prepare(`UPDATE messages SET folder_role = ?, folder_name = ? WHERE thread_id IN (${ph})`)
      .run(folderRole, name, ...threadIds)
  }

  snoozeThreads(threadIds: string[], untilMs: number | null): void {
    const ph = threadIds.map(() => '?').join(',')
    this.db.prepare(`UPDATE threads SET snoozed_until = ? WHERE id IN (${ph})`).run(untilMs, ...threadIds)
  }

  deleteThreadsPermanently(threadIds: string[]): void {
    const ph = threadIds.map(() => '?').join(',')
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
      people: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE folder_role = 'inbox' AND category = 'people' AND is_read = 0 AND (snoozed_until IS NULL OR snoozed_until <= ?) ${accFilter}`, [now]),
      updates: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE folder_role = 'inbox' AND category = 'updates' AND is_read = 0 AND (snoozed_until IS NULL OR snoozed_until <= ?) ${accFilter}`, [now]),
      starred: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE is_starred = 1 ${accFilter}`),
      snoozed: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE snoozed_until IS NOT NULL AND snoozed_until > ? ${accFilter}`, [now]),
      waiting: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE waiting_since IS NOT NULL AND folder_role NOT IN ('trash', 'junk') ${accFilter}`),
      drafts: countQuery(`SELECT COUNT(*) AS c FROM threads WHERE folder_role = 'drafts' ${accFilter}`),
      scheduled: countQuery(`SELECT COUNT(*) AS c FROM scheduled_emails WHERE status = 'pending' ${accFilter}`)
    }
  }

  // ---- Calendar Events ----
  upsertCalendarEvent(ev: Omit<CalendarEvent, 'accountColor' | 'accountEmail'>): void {
    this.db
      .prepare(`
        INSERT INTO calendar_events (
          id, account_id, calendar_id, calendar_name, remote_id, title, description,
          location, meeting_url, start_at, end_at, all_day, attendees_json, status, source, read_only
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          location = excluded.location,
          meeting_url = excluded.meeting_url,
          start_at = excluded.start_at,
          end_at = excluded.end_at,
          all_day = excluded.all_day,
          attendees_json = excluded.attendees_json,
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
        SELECT e.*, a.color AS account_color, a.email AS account_email
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
      accountEmail: String(r.account_email || ''),
      subject: String(r.subject || '(No subject)'),
      snippet: String(r.snippet || ''),
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
      latestFrom: JSON.parse(String(r.latest_from_json || '{"name":"","email":""}'))
    }
  }
}
