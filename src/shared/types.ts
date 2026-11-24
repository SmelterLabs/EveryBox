export type AccountProvider = 'gmail' | 'imap'

export type ThemeId = 'light' | 'paper' | 'dark' | 'black' | 'graphite'

export type MailboxId =
  | 'inbox'
  | 'starred'
  | 'snoozed'
  | 'waiting'
  | 'drafts'
  | 'sent'
  | 'subscriptions'
  | 'scheduled'
  | 'archive'
  | 'junk'
  | 'trash'

export type InboxCategory = 'all' | 'people' | 'updates'

export type ActiveView = 'mail' | 'calendar' | 'assistant' | 'triage' | 'subscriptions'

export type AIProviderType = 'ollama' | 'lmstudio' | 'claude-cli' | 'codex-cli' | 'anthropic' | 'gemini' | 'openai'

export interface Account {
  id: string
  provider: AccountProvider
  name: string
  email: string
  color: string
  signatureHtml: string
  isEnabled: boolean
  isDemo?: boolean
  // IMAP/SMTP config (passwords stored encrypted in DPAPI safeStorage)
  imapHost?: string
  imapPort?: number
  imapSecure?: boolean
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  smtpSeparateAuth?: boolean
  smtpUsername?: string
  // Calendar config for IMAP (optional CalDAV or read-only ICS feed)
  caldavUrl?: string
  caldavUsername?: string
  icsFeedUrl?: string
  calendarEnabled: boolean
  lastSyncAt?: number
  syncStatus: 'idle' | 'syncing' | 'error'
  syncError?: string
  unreadCount?: number
}

export interface Workspace {
  id: string
  name: string
  accountIds: string[] // empty = all accounts
  color: string
  shortcutIndex?: number // Ctrl+1..9
}

export interface Folder {
  id: string
  accountId: string
  remoteId: string
  name: string
  path: string
  role: 'inbox' | 'sent' | 'drafts' | 'archive' | 'junk' | 'trash' | 'custom'
  unreadCount: number
  totalCount: number
}

export interface Attachment {
  id: string
  messageId: string
  filename: string
  mimeType: string
  size: number
  contentId?: string
  isInline: boolean
  localPath?: string
  remoteAttachmentId?: string
}

export interface CalendarInvite {
  uid: string
  summary: string
  description?: string
  location?: string
  startIso: string
  endIso: string
  organizerEmail?: string
  organizerName?: string
  status?: 'NEEDS-ACTION' | 'ACCEPTED' | 'TENTATIVE' | 'DECLINED'
  rawIcs: string
}

export interface EmailAddress {
  name: string
  email: string
}

export interface Message {
  id: string
  accountId: string
  threadId: string
  remoteId: string
  messageIdHeader?: string
  from: EmailAddress
  to: EmailAddress[]
  cc: EmailAddress[]
  bcc: EmailAddress[]
  subject: string
  snippet: string
  bodyText: string
  bodyHtml: string
  date: number // unix ms
  isRead: boolean
  isStarred: boolean
  isDraft: boolean
  isSent: boolean
  folderRole: Folder['role']
  folderName?: string
  labels: string[]
  category: 'people' | 'updates'
  hasAttachments: boolean
  attachments: Attachment[]
  signInCode?: string
  trackersBlocked: number
  scamWarning?: string
  unsubscribeUrl?: string
  unsubscribeMailto?: string
  calendarInvite?: CalendarInvite
}

export interface ThreadSummary {
  id: string
  accountId: string
  accountColor: string
  accountEmail: string
  subject: string
  snippet: string
  participants: EmailAddress[]
  lastMessageAt: number
  messageCount: number
  isRead: boolean
  isStarred: boolean
  hasAttachments: boolean
  category: 'people' | 'updates'
  folderRole: Folder['role']
  folderName?: string
  labels: string[]
  signInCode?: string
  snoozedUntil?: number
  waitingSince?: number
  trackersBlocked: number
  scamWarning?: string
  unsubscribeUrl?: string
  latestFrom: EmailAddress
}

export interface ThreadDetail extends ThreadSummary {
  messages: Message[]
}

export interface CalendarEvent {
  id: string
  accountId: string
  accountColor: string
  accountEmail: string
  calendarId: string
  calendarName: string
  remoteId: string
  title: string
  description?: string
  location?: string
  meetingUrl?: string
  startAt: number // unix ms
  endAt: number // unix ms
  allDay: boolean
  attendees: { name?: string; email: string; status?: string }[]
  status: 'confirmed' | 'tentative' | 'cancelled'
  source: 'google' | 'caldav' | 'ics' | 'local'
  readOnly: boolean
}

export interface ScheduledEmail {
  id: string
  accountId: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  bodyHtml: string
  bodyText: string
  replyToThreadId?: string
  sendAt: number
  status: 'pending' | 'sent' | 'cancelled' | 'failed'
  error?: string
}

export interface Snippet {
  id: string
  title: string
  shortcut: string
  body: string
}

export interface AISettings {
  provider: AIProviderType
  ollamaUrl: string
  ollamaModel: string
  lmStudioUrl: string
  lmStudioModel: string
  anthropicModel: string
  geminiModel: string
  openaiModel: string
  responseLanguage: 'auto' | string
}

export interface PrivacySettings {
  blockRemoteImages: boolean
  stripTrackingPixels: boolean
  trustedImageSenders: string[] // domains or personal emails
}

export interface MCPSettings {
  enabled: boolean
  allowMutations: boolean
  hiddenAccountIds: string[]
  hiddenFolders: string[]
  hiddenSenders: string[]
}

export interface AppSettings {
  theme: ThemeId
  matchSystemTheme: boolean
  lightTheme: ThemeId
  darkTheme: ThemeId
  defaultReplyAll: boolean
  undoSendSeconds: number
  ai: AISettings
  privacy: PrivacySettings
  mcp: MCPSettings
  googleOAuthClientId?: string
  googleOAuthClientSecret?: string
}

export interface AssistantCard {
  threadId: string
  accountId: string
  senderName: string
  senderEmail: string
  subject: string
  date: number
  bucket: 'needs_you' | 'worth_a_look' | 'updates'
  badge: 'Urgent' | 'Reply' | 'Read' | 'Deadline' | 'Update'
  reason: string
}

export interface AssistantResponse {
  summary: string
  counts: { needsYou: number; worthALook: number; updates: number }
  dateRange: string
  cards: AssistantCard[]
  followUps: string[]
  providerLabel: string
}

export interface ThreadAISummary {
  gist: string
  actionItems: string[]
  keyDates: string[]
  providerLabel: string
}

export interface ParsedSearchQuery {
  raw: string
  textQuery: string
  from?: string
  to?: string
  hasAttachment?: boolean
  attachmentType?: string
  afterDate?: number
  beforeDate?: number
  folder?: string
  isUnread?: boolean
  pills: { label: string; key: string; value: string }[]
}

export interface SubscriptionGroup {
  senderEmail: string
  senderName: string
  accountId: string
  count: number
  latestAt: number
  unsubscribeUrl?: string
  unsubscribeMailto?: string
  threadIds: string[]
}

export interface SendEmailPayload {
  accountId: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  bodyHtml: string
  bodyText: string
  replyToMessageId?: string
  threadId?: string
  scheduleAt?: number
}

export interface CreateCalendarEventPayload {
  accountId: string
  calendarId?: string
  title: string
  description?: string
  location?: string
  startAt: number
  endAt: number
  allDay: boolean
  attendees?: string[]
}
