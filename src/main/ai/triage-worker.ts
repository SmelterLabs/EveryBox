import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type { Message, ThreadAIBundle, ThreadAIMeta } from '../../shared/types'
import { evaluateEmailDecisions, readDecisionApiKeys } from './decisions'
import { extractImplicitCalendarEvent } from './extract-event'

const BACKFILL_MAX_AGE_MS = 14 * 24 * 3600_000
const DEBOUNCE_MS = 500
const MAX_BATCH_PER_PASS = 20

const TIER0_AUTOMATED_SENDER_RE =
  /^(no-?reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|newsletter|digest|marketing|promo|promotions?|offers?|deals?|notifications?|alerts?|updates?|automated|robot|system|weekly|daily|editors?|news|calendar-notification|drive-shares|comments-noreply)[@._-]/i

const TIER0_PROMO_RE =
  /\b(%\s*off|sale\s+ends|black\s+friday|cyber\s+monday|promo\s*code|coupon|discount|limited[\s-]time\s+offer|special\s+offer|flash\s+sale|save\s+\$?\d+|shop\s+now|free\s+shipping|unsubscribe)\b/i

const TIER0_SECURITY_RE =
  /\b(sign-?in\s+code|verification\s+code|one-?time\s+(?:code|passcode|password)|2fa|two-?factor|security\s+alert|unrecognized\s+device|new\s+sign-?in|password\s+reset|reset\s+your\s+password|login\s+attempt)\b/i

function matchesSenderPattern(email: string, patterns: string[]): boolean {
  const lower = email.toLowerCase().trim()
  if (!lower) return false
  return patterns.some((raw) => {
    const entry = raw.toLowerCase().trim()
    if (!entry) return false
    return entry.startsWith('@') ? lower.endsWith(entry) : lower === entry
  })
}

function classifyTier0FastReject(
  latestMsg: Message,
  vipSenders: string[]
): { bundle: ThreadAIBundle; reason: string } | null {
  // Never fast-reject sent mail or VIP senders
  if (latestMsg.isSent) return null
  const fromEmail = (latestMsg.from?.email || '').toLowerCase().trim()
  if (fromEmail && matchesSenderPattern(fromEmail, vipSenders)) return null

  // 1. Explicit 2FA / sign-in code
  if (latestMsg.signInCode) {
    return { bundle: 'security', reason: 'Sign-in verification code.' }
  }

  const subjectAndSnippet = `${latestMsg.subject || ''} ${latestMsg.snippet || ''}`

  // 2. List-Unsubscribe header present
  if (latestMsg.unsubscribeUrl || latestMsg.unsubscribeMailto) {
    if (TIER0_SECURITY_RE.test(subjectAndSnippet)) {
      return { bundle: 'security', reason: 'Automated security notice.' }
    }
    if (TIER0_PROMO_RE.test(subjectAndSnippet)) {
      return { bundle: 'promo', reason: 'Promotional email with unsubscribe.' }
    }
    return { bundle: 'newsletter', reason: 'Subscribed newsletter or digest.' }
  }

  // 3. Automated / no-reply sender address
  if (fromEmail && TIER0_AUTOMATED_SENDER_RE.test(fromEmail)) {
    if (TIER0_SECURITY_RE.test(subjectAndSnippet)) {
      return { bundle: 'security', reason: 'Automated security alert.' }
    }
    if (TIER0_PROMO_RE.test(subjectAndSnippet)) {
      return { bundle: 'promo', reason: 'Automated promotional message.' }
    }
    return { bundle: 'newsletter', reason: 'Automated notification or digest.' }
  }

  return null
}

interface QueuedThreadOpts {
  force: boolean
  skipAgeLimit: boolean
}

export class TriageWorker {
  private queue = new Map<string, QueuedThreadOpts>()
  private debounceTimer: NodeJS.Timeout | null = null
  private draining = false
  private stopped = false

  constructor(
    private db: GlassmailDB,
    private secrets: SecretStore,
    private onUpdated: () => void
  ) {}

  stop(): void {
    this.stopped = true
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.queue.clear()
  }

  enqueueThreads(
    threadIds: string[],
    opts?: { force?: boolean; skipAgeLimit?: boolean }
  ): void {
    if (this.stopped || threadIds.length === 0) return
    const force = Boolean(opts?.force)
    const skipAgeLimit = Boolean(opts?.skipAgeLimit || force)

    for (const id of threadIds) {
      if (!id) continue
      const existing = this.queue.get(id)
      if (existing) {
        existing.force = existing.force || force
        existing.skipAgeLimit = existing.skipAgeLimit || skipAgeLimit
      } else {
        this.queue.set(id, { force, skipAgeLimit })
      }
    }

    this.scheduleDrain()
  }

  enqueueRecentInbox(limit = 40): void {
    if (this.stopped) return
    const settings = this.db.getSettings()
    if (settings.ai.decision?.enabled === false || settings.ai.decision?.provider === 'off') {
      return
    }
    const cutoff = Date.now() - BACKFILL_MAX_AGE_MS
    const inboxThreads = this.db.listThreads({ mailbox: 'inbox', limit })
    const sentThreads = this.db.listThreads({ mailbox: 'sent', limit: Math.min(15, limit) })
    const recentIds: string[] = []
    for (const t of [...inboxThreads, ...sentThreads]) {
      if (t.lastMessageAt >= cutoff) {
        recentIds.push(t.id)
      }
    }
    if (recentIds.length > 0) {
      this.enqueueThreads(recentIds, { force: false, skipAgeLimit: false })
    }
  }

  async classifyThreadNow(threadId: string, force = true): Promise<ThreadAIMeta | null> {
    const meta = await this.classifySingleThread(threadId, {
      force,
      skipAgeLimit: true,
      priority: 'interactive'
    })
    if (meta) {
      this.onUpdated()
    }
    return meta
  }

  private scheduleDrain(): void {
    if (this.stopped || this.debounceTimer) return
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.drainQueue()
    }, DEBOUNCE_MS)
  }

  private async drainQueue(): Promise<void> {
    if (this.stopped || this.draining || this.queue.size === 0) return
    this.draining = true
    let updatedCount = 0

    try {
      const batch = Array.from(this.queue.entries()).slice(0, MAX_BATCH_PER_PASS)
      for (const [threadId] of batch) {
        this.queue.delete(threadId)
      }

      for (const [threadId, opts] of batch) {
        if (this.stopped) break
        try {
          const meta = await this.classifySingleThread(threadId, {
            force: opts.force,
            skipAgeLimit: opts.skipAgeLimit,
            priority: 'background'
          })
          if (meta) {
            updatedCount++
          }
        } catch (err) {
          console.warn('[EveryBox TriageWorker] classification failed for thread', threadId, err)
        }
      }
    } finally {
      this.draining = false
      if (updatedCount > 0 && !this.stopped) {
        this.onUpdated()
      }
      if (this.queue.size > 0 && !this.stopped) {
        this.scheduleDrain()
      }
    }
  }

  private async classifySingleThread(
    threadId: string,
    opts: { force: boolean; skipAgeLimit: boolean; priority: 'interactive' | 'background' }
  ): Promise<ThreadAIMeta | null> {
    const settings = this.db.getSettings()
    const decisionCfg = settings.ai.decision
    if (decisionCfg?.enabled === false || decisionCfg?.provider === 'off') {
      return null
    }

    const detail = this.db.getThreadDetail(threadId)
    if (!detail || detail.messages.length === 0) return null

    // Ignore drafts, trash, and junk during background triage unless explicitly forced
    if (!opts.force && ['trash', 'junk', 'drafts'].includes(detail.folderRole)) {
      return null
    }

    // Use the latest non-draft message (falling back to latest message)
    const nonDrafts = detail.messages.filter((m) => !m.isDraft)
    const latestMsg = nonDrafts.length > 0 ? nonDrafts[nonDrafts.length - 1] : detail.messages[detail.messages.length - 1]
    if (!latestMsg || latestMsg.isDraft) return null

    const latestMsgAt = detail.lastMessageAt || latestMsg.date

    // Backfill age guard: never hammer APIs on initial sync of old history
    if (!opts.skipAgeLimit && Date.now() - latestMsgAt > BACKFILL_MAX_AGE_MS) {
      return null
    }

    // Skip if already classified at the exact same latest message timestamp
    const existing = this.db.getThreadAiMeta(threadId)
    if (!opts.force && existing && existing.classifiedMsgAt === latestMsgAt && existing.modelLabel) {
      return null
    }

    // Clear waiting_since if an inbound reply has arrived on a thread that was marked waiting
    if (!latestMsg.isSent && detail.waitingSince) {
      this.db.setThreadWaitingSince(threadId, null)
    }

    // Tier 0: deterministic 0-token fast-reject for automated/2FA/newsletter/promo mail
    const vipSenders = settings.autopilot?.preDraftAlwaysSenders || []
    const fromEmail = (latestMsg.from?.email || '').toLowerCase().trim()
    const senderProfile = fromEmail ? this.db.getSenderProfile(fromEmail) : null
    const isLearnedVip = senderProfile?.preference === 'vip'
    const tier0 = isLearnedVip ? null : classifyTier0FastReject(latestMsg, vipSenders)
    if (tier0) {
      const meta: ThreadAIMeta = {
        threadId,
        classifiedMsgAt: latestMsgAt,
        bundle: tier0.bundle,
        urgency: 0,
        needsReply: false,
        replyConfidence: 0,
        autoDraftWorthy: false,
        aiReason: tier0.reason,
        hasImplicitEvent: false,
        implicitEvent: null,
        phishingRisk: 0,
        matchedRuleIds: [],
        modelLabel: 'tier0-rules',
        updatedAt: Date.now()
      }
      this.db.upsertThreadAiMeta(meta)
      return meta
    }

    // Gather enabled Autopilot rules with semantic aiPrompt to evaluate in the same single pass
    const aiRules = this.db
      .listAutopilotRules()
      .filter((r) => r.enabled && Boolean(r.conditions.aiPrompt?.trim()))
      .map((r) => ({ id: r.id, prompt: r.conditions.aiPrompt!.trim() }))

    const apiKeys = readDecisionApiKeys(this.secrets)

    // Tier 1A: Single-pass Decision AI classification
    const decision = await evaluateEmailDecisions(
      {
        threadId,
        subject: latestMsg.subject || detail.subject,
        fromName: latestMsg.from?.name || '',
        fromEmail: latestMsg.from?.email || '',
        toEmails: (latestMsg.to || []).map((a) => a.email).filter(Boolean),
        dateMs: latestMsg.date,
        snippet: latestMsg.snippet || detail.snippet,
        bodyText: latestMsg.bodyText,
        isSent: latestMsg.isSent,
        hasCalendarInvite: Boolean(latestMsg.calendarInvite),
        hasUnsubscribe: Boolean(latestMsg.unsubscribeUrl || latestMsg.unsubscribeMailto),
        signInCode: latestMsg.signInCode,
        accountEmail: detail.accountEmail,
        rules: aiRules,
        priority: opts.priority
      },
      settings.ai,
      apiKeys,
      this.secrets
    )

    // Outbound Sent-mail Waiting-On tracking
    if (latestMsg.isSent) {
      if (decision.expectsReply === true) {
        this.db.setThreadWaitingSince(threadId, latestMsg.date)
      } else if (decision.expectsReply === false) {
        this.db.setThreadWaitingSince(threadId, null)
      }
    }

    const boostedUrgency: 0 | 1 | 2 | 3 =
      isLearnedVip && decision.needsReply && decision.urgency < 2 ? 2 : decision.urgency

    const meta: ThreadAIMeta = {
      threadId,
      classifiedMsgAt: latestMsgAt,
      bundle: decision.bundle,
      urgency: boostedUrgency,
      needsReply: decision.needsReply,
      replyConfidence: decision.replyConfidence,
      autoDraftWorthy: decision.autoDraftWorthy,
      aiReason: decision.aiReason,
      hasImplicitEvent: decision.hasImplicitEvent,
      implicitEvent: null,
      phishingRisk: decision.phishingRisk,
      expectsReply: decision.expectsReply,
      matchedRuleIds: decision.matchedRuleIds,
      modelLabel: decision.modelLabel,
      updatedAt: Date.now()
    }
    this.db.upsertThreadAiMeta(meta)

    // Tier 1B: Conditional implicit calendar event extraction
    if (decision.hasImplicitEvent && !latestMsg.calendarInvite) {
      try {
        const extracted = await extractImplicitCalendarEvent(
          {
            subject: latestMsg.subject || detail.subject,
            fromName: latestMsg.from?.name,
            fromEmail: latestMsg.from?.email,
            dateMs: latestMsg.date,
            bodySnippet: latestMsg.bodyText || latestMsg.snippet || detail.snippet,
            priority: opts.priority
          },
          settings.ai,
          this.secrets
        )
        if (extracted) {
          meta.implicitEvent = extracted
          meta.updatedAt = Date.now()
          this.db.upsertThreadAiMeta(meta)
        }
      } catch (err) {
        console.warn('[EveryBox TriageWorker] implicit event extraction failed:', err)
      }
    }

    return meta
  }
}
