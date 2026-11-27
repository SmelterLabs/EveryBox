export type AccountProvider = 'gmail' | 'imap' | 'microsoft' | 'outlook-local'

export type ThemeId = 'light' | 'paper' | 'dark' | 'black' | 'graphite'

export type UIThemeId = 'everybox' | 'outlook-classic' | 'gmail'

export type ListDensity = 'compact' | 'comfortable' | 'expanded'

export type ReaderWidth = 'narrow' | 'comfortable' | 'wide'

export type AccountRowStyle = 'gradient' | 'bar' | 'dot'

export type OutlookFocusedMode = 'all' | 'focused-only' | 'other-to-updates'

export type AccountIconId =
  | 'none'
  | 'home'
  | 'briefcase'
  | 'building'
  | 'flame'
  | 'rocket'
  | 'globe'
  | 'shield'
  | 'star'
  | 'heart'
  | 'code'
  | 'user'
  | 'sparkles'

export type AccountSwitchBehavior = 'home' | 'last-email' | 'first-email'

export type ShortcutActionId =
  | 'delete'
  | 'archive'
  | 'compose'
  | 'reply'
  | 'replyAll'
  | 'forward'
  | 'star'
  | 'toggleRead'
  | 'snooze'
  | 'nextThread'
  | 'prevThread'
  | 'search'
  | 'commandPalette'
  | 'settings'
  | 'undo'
  | 'inboxHome'

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

export type ActiveView = 'mail' | 'calendar' | 'assistant' | 'triage' | 'subscriptions' | 'autopilot'

export type AIProviderType =
  | 'local-openai'
  | 'ollama'
  | 'lmstudio'
  | 'claude-cli'
  | 'codex-cli'
  | 'antigravity-cli'
  | 'anthropic'
  | 'gemini'
  | 'openai'
  | 'grok'

export interface Account {
  id: string
  provider: AccountProvider
  name: string
  email: string
  color: string
  icon?: AccountIconId
  signatureHtml: string
  isEnabled: boolean
  isDemo?: boolean
  // IMAP/SMTP config (passwords stored encrypted in OS keystore / safeStorage)
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
  outlookFocusedMode?: OutlookFocusedMode
  calendarEnabled: boolean
  lastSyncAt?: number
  syncStatus: 'idle' | 'syncing' | 'error'
  syncError?: string
  syncBackoffUntil?: number
  syncConsecutiveErrors?: number
  gmailHistoryId?: string
  unreadCount?: number
  totalCount?: number
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
  descriptionHtml?: string
  location?: string
  meetingUrl?: string
  startIso: string
  endIso: string
  allDay?: boolean
  organizerEmail?: string
  organizerName?: string
  attendees?: { name?: string; email: string; status?: string; organizer?: boolean; optional?: boolean }[]
  attachments?: { title: string; fileUrl: string; mimeType?: string }[]
  method?: string
  status?: 'NEEDS-ACTION' | 'ACCEPTED' | 'TENTATIVE' | 'DECLINED' | 'CANCELLED'
  calendarEventId?: string
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
  accountIcon?: AccountIconId
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
  latestExternalFrom?: EmailAddress
  hasDraft?: boolean
}

export interface ThreadDetail extends ThreadSummary {
  messages: Message[]
}

export interface CalendarEvent {
  id: string
  accountId: string
  accountColor: string
  accountIcon?: AccountIconId
  accountEmail: string
  calendarId: string
  calendarName: string
  remoteId: string
  title: string
  description?: string
  descriptionHtml?: string
  location?: string
  meetingUrl?: string
  htmlLink?: string
  organizer?: { name?: string; email: string }
  startAt: number // unix ms
  endAt: number // unix ms
  allDay: boolean
  attendees: { name?: string; email: string; status?: string; organizer?: boolean; optional?: boolean }[]
  attachments?: { title: string; fileUrl: string; mimeType?: string }[]
  status: 'confirmed' | 'tentative' | 'cancelled'
  source: 'google' | 'microsoft' | 'caldav' | 'ics' | 'local'
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

export type DecisionProvider =
  | 'auto'
  | 'jev'
  | 'gemini-decisions'
  | 'openai-decisions'
  | 'openrouter-jev'
  | 'local-fast'
  | 'off'

export interface DecisionAISettings {
  enabled: boolean
  provider: DecisionProvider
  model?: string
  endpoint?: string
  apiKeyConfigured?: boolean
  autoDraftMinConfidence?: number // 0..1
}

export interface AISettings {
  provider: AIProviderType
  localOpenAiUrl?: string
  localOpenAiModel?: string
  ollamaUrl: string
  ollamaModel: string
  lmStudioUrl: string
  lmStudioModel: string
  claudeCliModel?: string
  codexCliModel?: string
  antigravityCliModel?: string
  anthropicModel: string
  geminiModel: string
  openaiModel: string
  grokModel?: string
  responseLanguage: 'auto' | string
  decision?: DecisionAISettings
}

export interface DiscoveredModel {
  id: string
  label?: string
  sizeBytes?: number
  parameterSize?: string
}

export interface LocalAIStatus {
  gpuName: string | null
  localServerRunning: boolean
  localServerName: string | null
  localServerUrlUsed: string
  localServerModels: DiscoveredModel[]
  ollamaInstalled: boolean
  ollamaRunning: boolean
  ollamaUrlUsed: string
  ollamaModels: DiscoveredModel[]
  lmStudioInstalled: boolean
  lmStudioRunning: boolean
  lmStudioUrlUsed: string
  lmStudioModels: DiscoveredModel[]
  claudeCliAvailable: boolean
  claudeCliTierVersions: {
    sonnet: string | null
    haiku: string | null
    opus: string | null
  }
  codexCliAvailable: boolean
  codexCliModels: DiscoveredModel[]
  antigravityCliAvailable: boolean
  antigravityCliModels: DiscoveredModel[]
  apiKeysConfigured: {
    anthropic: boolean
    gemini: boolean
    openai: boolean
    grok: boolean
    jev?: boolean
    openrouter?: boolean
  }
  cloudModels: {
    anthropic: DiscoveredModel[]
    gemini: DiscoveredModel[]
    openai: DiscoveredModel[]
    grok: DiscoveredModel[]
  }
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

export interface AutopilotSettings {
  autoPreDraftPeople: boolean
  preDraftDisabledAccountIds?: string[]
  preDraftAlwaysSenders?: string[] // VIP email addresses or @domains to always auto-draft first
  preDraftExcludedSenders?: string[] // email addresses or @domains to skip
  waitingDismissedThreadIds?: string[] // threads manually dismissed from "Waiting on you"
  autoClean2FAHours: number | null // null = off, e.g. 12 or 24
}

export interface WaitingOnYouItem {
  thread: ThreadSummary
  reason: string
  aiVerified?: boolean
}

export interface Reminder {
  id: string
  accountId?: string
  threadId?: string
  threadSubject?: string
  threadSender?: string
  title: string
  note?: string
  dueAt: number
  onlyIfNoReply?: boolean
  completedAt?: number | null
  notifiedAt?: number | null
  createdAt: number
}

export interface CreateReminderPayload {
  accountId?: string
  threadId?: string
  threadSubject?: string
  threadSender?: string
  title: string
  note?: string
  dueAt: number
  onlyIfNoReply?: boolean
}

export interface ThreadPreDraft {
  threadId: string
  accountId: string
  subject: string
  body: string
  providerLabel: string
  createdAt: number
  messageId?: string
  status?: 'ready' | 'dismissed' | 'promoted'
  source?: 'auto' | 'manual'
}

export interface AutopilotCondition {
  fromContains?: string
  subjectContains?: string
  bodyContains?: string
  category?: 'people' | 'updates'
  hasSignInCode?: boolean
  olderThanHours?: number
  aiPrompt?: string
}

export interface AutopilotAction {
  type: 'archive' | 'trash' | 'markRead' | 'star' | 'moveToFolder' | 'notify' | 'preDraft'
  folderName?: string
}

export interface AutopilotRule {
  id: string
  name: string
  prompt: string
  enabled: boolean
  conditions: AutopilotCondition
  actions: AutopilotAction[]
  runCount: number
  lastRunAt?: number | null
  createdAt: number
  source?: 'manual' | 'learned'
}

export interface AutopilotLogEntry {
  id: string
  ruleId?: string
  ruleName: string
  threadId?: string
  threadSubject?: string
  actionSummary: string
  actionType?: string
  undoAction?: 'restoreInbox' | 'markUnread' | 'unstar' | null
  undoneAt?: number | null
  createdAt: number
}

export type VoiceProfileKind = 'personal' | 'business' | 'customer' | 'colleague' | 'executive' | 'custom'

export interface VoiceProfile {
  id: string
  kind: VoiceProfileKind
  name: string
  description: string
  accountIds: string[] // empty = learn from all accounts
  styleSummary: string // AI-learned (and user-editable) style guide
  greetingStyle?: string
  signOffStyle?: string
  sampleCount: number
  isDefault?: boolean
  updatedAt: number
}

export interface AppSettings {
  theme: ThemeId
  uiTheme?: UIThemeId
  listDensity?: ListDensity
  matchSystemTheme: boolean
  lightTheme: ThemeId
  darkTheme: ThemeId
  readerWidth?: ReaderWidth
  accountRowStyle?: AccountRowStyle
  showDateGroups?: boolean
  accountSwitchBehavior?: AccountSwitchBehavior
  accountOrder?: string[]
  shortcuts?: Partial<Record<ShortcutActionId, string>>
  defaultReplyAll: boolean
  undoSendSeconds: number
  ai: AISettings
  privacy: PrivacySettings
  mcp: MCPSettings
  autopilot?: AutopilotSettings
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

export type ThreadAIBundle =
  | 'action'
  | 'waiting'
  | 'fyi'
  | 'finance'
  | 'shipping'
  | 'newsletter'
  | 'promo'
  | 'cold_outreach'
  | 'security'

export interface ImplicitCalendarEvent {
  title: string
  startIso: string
  endIso?: string
  location?: string
  confidence: number
  notes?: string
}

export interface ThreadAIMeta {
  threadId: string
  classifiedMsgAt: number
  bundle: ThreadAIBundle
  urgency: 0 | 1 | 2 | 3
  needsReply: boolean
  replyConfidence: number
  autoDraftWorthy: boolean
  aiReason: string
  hasImplicitEvent: boolean
  implicitEvent?: ImplicitCalendarEvent | null
  phishingRisk: 0 | 1 | 2
  expectsReply?: boolean
  matchedRuleIds?: string[]
  summary?: ThreadAISummary | null
  modelLabel: string
  updatedAt: number
}

export interface DecisionProviderTestResult {
  ok: boolean
  latencyMs: number
  detail: string
  modelLabel: string
}

/**
 * Decision AI & Thread Triage IPC contract to be implemented on `GlassmailAPI`
 * in `src/preload/index.ts` and `src/main/index.ts`.
 */
export interface DecisionAIIpcAPI {
  saveDecisionApiKey: (
    provider: 'jev' | 'openrouter' | 'gemini' | 'openai',
    apiKey: string
  ) => Promise<{ ok: boolean }>
  testDecisionProvider: (override?: Partial<DecisionAISettings>) => Promise<DecisionProviderTestResult>
  getThreadAiMeta: (threadId: string) => Promise<ThreadAIMeta | null>
  getThreadAiMetaBatch: (threadIds: string[]) => Promise<Record<string, ThreadAIMeta>>
  reclassifyThread: (threadId: string) => Promise<ThreadAIMeta | null>
  dismissPreDraft: (threadId: string) => Promise<{ ok: boolean }>
  createCalendarEventFromImplicit: (input: {
    accountId: string
    threadId: string
    event: ImplicitCalendarEvent
  }) => Promise<{ ok: boolean; id?: string; error?: string }>
}

export type HabitActionType =
  | 'archive'
  | 'trash'
  | 'move_folder'
  | 'star'
  | 'reply'
  | 'draft_accepted'
  | 'draft_dismissed'

export type SenderPreference = 'normal' | 'vip' | 'no_autodraft'

export interface HabitEvent {
  id: string
  senderEmail: string
  senderDomain: string
  bundle?: ThreadAIBundle | null
  action: HabitActionType
  folderName?: string | null
  hadOpened: boolean
  threadId?: string | null
  createdAt: number
}

export interface SenderProfile {
  senderEmail: string
  senderDomain: string
  displayName: string
  totalSeen: number
  repliedCount: number
  starredCount: number
  archivedUnreadCount: number
  trashedUnreadCount: number
  draftAcceptedCount: number
  draftDismissedCount: number
  movedFolders: Record<string, number>
  preference: SenderPreference
  preferenceLocked: boolean
  lastRepliedAt?: number | null
  updatedAt: number
}

export type HabitSuggestionKind =
  | 'sender_archive'
  | 'sender_trash'
  | 'sender_move'
  | 'bundle_archive'
  | 'bundle_move'

export interface HabitSuggestion {
  id: string
  kind: HabitSuggestionKind
  patternKey: string
  senderEmail?: string
  senderDomain?: string
  bundle?: ThreadAIBundle
  targetFolder?: string
  title: string
  reason: string
  rulePrompt: string
  sampleCount: number
  confidence: number
  status: 'pending' | 'accepted' | 'dismissed'
  createdAt: number
  resolvedAt?: number | null
}

/**
 * Habit Learning & Rule Suggestions IPC contract to be implemented on `GlassmailAPI`
 * in `src/preload/index.ts` and `src/main/index.ts`.
 */
export interface HabitLearningIpcAPI {
  listHabitSuggestions: (status?: 'pending' | 'accepted' | 'dismissed' | 'all') => Promise<HabitSuggestion[]>
  acceptHabitSuggestion: (
    suggestionId: string
  ) => Promise<{ ok: boolean; rule?: AutopilotRule; error?: string }>
  dismissHabitSuggestion: (suggestionId: string) => Promise<{ ok: boolean }>
  listSenderProfiles: (limit?: number) => Promise<SenderProfile[]>
  setSenderPreference: (
    senderEmail: string,
    preference: SenderPreference,
    locked?: boolean
  ) => Promise<{ ok: boolean; profile?: SenderProfile }>
  undoAutopilotLog: (logId: string) => Promise<{ ok: boolean; error?: string }>
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

export interface ComposerAttachment {
  id: string
  filename: string
  mimeType: string
  size: number
  localPath?: string
  remoteMessageId?: string
  remoteAttachmentId?: string
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
  draftThreadId?: string
  draftRemoteId?: string
  attachments?: ComposerAttachment[]
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

export interface OutlookCalendarInfo {
  storeName: string
  folderName: string
  folderPath: string
  itemCount: number
}

export interface OutlookStoreInfo {
  storeId: string
  displayName: string
  email: string
  storeType: string
  inboxCount: number
  unreadCount: number
  calendarPath?: string
}

export interface AppUpdateStatus {
  currentVersion: string
  latestVersion?: string
  updateAvailable: boolean
  releaseUrl?: string
  releaseName?: string
  publishedAt?: string
  checkedAt: number
  error?: string
}
