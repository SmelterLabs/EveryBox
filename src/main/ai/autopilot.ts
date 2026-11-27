import { randomUUID } from 'crypto'
import { BrowserWindow, Notification } from 'electron'
import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type { SyncManager, ThreadMutationSnapshot } from '../mail/sync-manager'
import type {
  AutopilotAction,
  AutopilotCondition,
  AutopilotRule,
  SenderProfile,
  ThreadSummary,
  WaitingOnYouItem
} from '../../shared/types'
import { completeAI } from './provider'
import { draftVoiceMatchedReply } from './writer'

// Track (ruleId:threadId) pairs already handled in this process so rules don't re-fire in loops
const processedRuleThreads = new Set<string>()
const attemptedPreDraftThreads = new Set<string>()
let autopilotRunning = false

function heuristicCompileRule(prompt: string): Omit<AutopilotRule, 'id' | 'runCount' | 'lastRunAt' | 'createdAt'> {
  const lower = prompt.toLowerCase()
  const conditions: AutopilotCondition = {}
  const actions: AutopilotAction[] = []

  // Conditions
  const fromMatch = prompt.match(/(?:from|sender)\s+["']?([^\s"',]+)["']?/i)
  if (fromMatch) {
    conditions.fromContains = fromMatch[1].replace(/^@/, '')
  }

  const subjMatch = prompt.match(/subject\s+(?:contains|has|includes|with)\s+["']?([^"',]+?)["']?(?:\s+(?:to|and|->|then|$))/i)
  if (subjMatch) {
    conditions.subjectContains = subjMatch[1].trim()
  } else if (/invoice|receipt/i.test(lower)) {
    conditions.subjectContains = /invoice/i.test(lower) ? 'invoice' : 'receipt'
  }

  if (/2fa|sign-?in code|verification code|otp/i.test(lower)) {
    conditions.hasSignInCode = true
  }

  if (/newsletter|updates|promotional|marketing/i.test(lower)) {
    conditions.category = 'updates'
  } else if (/real person|people|human/i.test(lower)) {
    conditions.category = 'people'
  }

  const hoursMatch = lower.match(/after\s+(\d+)\s*(hour|hr|day|week)/i)
  if (hoursMatch) {
    const num = Number(hoursMatch[1])
    const unit = hoursMatch[2].toLowerCase()
    conditions.olderThanHours = unit.startsWith('day') ? num * 24 : unit.startsWith('week') ? num * 168 : num
  }

  // Actions
  const moveMatch = prompt.match(/move(?:\s+to)?\s+["']?([A-Za-z0-9 _/-]+?)["']?(?:\s+(?:and|folder|,|$))/i)
  if (moveMatch && !/archive|trash|inbox/i.test(moveMatch[1])) {
    actions.push({ type: 'moveToFolder', folderName: moveMatch[1].trim() })
  }
  if (/\bdelete\b|\btrash\b/i.test(lower)) {
    actions.push({ type: 'trash' })
  } else if (/\barchive\b/i.test(lower)) {
    actions.push({ type: 'archive' })
  }
  if (/mark(?:\s+as)?\s+read/i.test(lower)) {
    actions.push({ type: 'markRead' })
  }
  if (/\bstar\b|\bflag\b/i.test(lower)) {
    actions.push({ type: 'star' })
  }
  if (/\bnotify\b|\balert\b/i.test(lower)) {
    actions.push({ type: 'notify' })
  }
  if (/pre-?draft|draft(?:\s+a)?\s+repl/i.test(lower)) {
    actions.push({ type: 'preDraft' })
  }

  if (actions.length === 0) {
    actions.push({ type: 'archive' })
  }

  // If no deterministic condition matched, store as AI semantic check
  if (
    !conditions.fromContains &&
    !conditions.subjectContains &&
    !conditions.bodyContains &&
    !conditions.category &&
    !conditions.hasSignInCode
  ) {
    conditions.aiPrompt = prompt.trim()
  }

  const name = prompt.trim().length > 52 ? `${prompt.trim().slice(0, 52)}…` : prompt.trim()
  return { name, prompt: prompt.trim(), enabled: true, conditions, actions }
}

export async function compileNaturalLanguageRule(
  prompt: string,
  db: GlassmailDB,
  secrets: SecretStore
): Promise<{ rule: Omit<AutopilotRule, 'id' | 'runCount' | 'lastRunAt' | 'createdAt'>; usedAI: boolean }> {
  const settings = db.getSettings()
  const cleanPrompt = prompt.trim()
  if (!cleanPrompt) {
    return { rule: heuristicCompileRule('Archive old sign-in codes'), usedAI: false }
  }

  try {
    const res = await completeAI(
      {
        maxTokens: 600,
        system: `You convert plain-English email automation instructions into a compact JSON rule object.
Return ONLY valid JSON (no markdown fences, no commentary) with this exact shape:
{
  "name": "Short 3-7 word rule title",
  "conditions": {
    "fromContains": "optional substring to match sender name or email",
    "subjectContains": "optional substring to match subject",
    "bodyContains": "optional substring to match snippet",
    "category": "optional: 'people' or 'updates'",
    "hasSignInCode": false,
    "olderThanHours": null,
    "aiPrompt": "optional short yes/no question ONLY if the rule requires semantic AI judgement that cannot be expressed with the fields above"
  },
  "actions": [
    { "type": "archive" | "trash" | "markRead" | "star" | "moveToFolder" | "notify" | "preDraft", "folderName": "required only for moveToFolder" }
  ]
}
Omit null/false/empty optional fields in conditions. Always include at least one action.`,
        prompt: `User instruction: "${cleanPrompt}"`
      },
      settings.ai,
      secrets
    )

    const raw = res.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    const parsed = JSON.parse(raw) as {
      name?: string
      conditions?: AutopilotCondition
      actions?: AutopilotAction[]
    }

    const validActions = (parsed.actions || []).filter((a) =>
      ['archive', 'trash', 'markRead', 'star', 'moveToFolder', 'notify', 'preDraft'].includes(a.type)
    )
    if (validActions.length === 0) {
      return { rule: heuristicCompileRule(cleanPrompt), usedAI: false }
    }

    const cond: AutopilotCondition = {}
    if (parsed.conditions?.fromContains) cond.fromContains = String(parsed.conditions.fromContains).trim()
    if (parsed.conditions?.subjectContains) cond.subjectContains = String(parsed.conditions.subjectContains).trim()
    if (parsed.conditions?.bodyContains) cond.bodyContains = String(parsed.conditions.bodyContains).trim()
    if (parsed.conditions?.category === 'people' || parsed.conditions?.category === 'updates') {
      cond.category = parsed.conditions.category
    }
    if (parsed.conditions?.hasSignInCode) cond.hasSignInCode = true
    if (typeof parsed.conditions?.olderThanHours === 'number' && parsed.conditions.olderThanHours > 0) {
      cond.olderThanHours = parsed.conditions.olderThanHours
    }
    if (parsed.conditions?.aiPrompt) cond.aiPrompt = String(parsed.conditions.aiPrompt).trim()

    return {
      rule: {
        name: (parsed.name || cleanPrompt).trim().slice(0, 64),
        prompt: cleanPrompt,
        enabled: true,
        conditions: cond,
        actions: validActions
      },
      usedAI: true
    }
  } catch {
    return { rule: heuristicCompileRule(cleanPrompt), usedAI: false }
  }
}

async function threadMatchesRule(
  t: ThreadSummary,
  rule: AutopilotRule,
  db: GlassmailDB,
  secrets: SecretStore
): Promise<boolean> {
  const c = rule.conditions
  if (c.fromContains) {
    const hay = `${t.latestFrom.name} ${t.latestFrom.email}`.toLowerCase()
    if (!hay.includes(c.fromContains.toLowerCase())) return false
  }
  if (c.subjectContains) {
    if (!t.subject.toLowerCase().includes(c.subjectContains.toLowerCase())) return false
  }
  if (c.bodyContains) {
    if (!t.snippet.toLowerCase().includes(c.bodyContains.toLowerCase())) return false
  }
  if (c.category && t.category !== c.category) {
    return false
  }
  if (c.hasSignInCode && !t.signInCode) {
    return false
  }
  if (c.olderThanHours && c.olderThanHours > 0) {
    const ageHours = (Date.now() - t.lastMessageAt) / 3600_000
    if (ageHours < c.olderThanHours) return false
  }
  if (c.aiPrompt) {
    // Reuse single-pass Decision AI rule evaluation when already persisted for this message timestamp
    const meta = db.getThreadAiMeta(t.id)
    if (
      meta &&
      meta.classifiedMsgAt === t.lastMessageAt &&
      meta.modelLabel &&
      meta.modelLabel !== 'tier0-rules' &&
      Array.isArray(meta.matchedRuleIds)
    ) {
      return meta.matchedRuleIds.includes(rule.id)
    }

    try {
      const settings = db.getSettings()
      const res = await completeAI(
        {
          maxTokens: 20,
          priority: 'background',
          system: 'Answer ONLY "YES" or "NO".',
          prompt: `Rule question: ${c.aiPrompt}\n\nEmail:\nFrom: ${t.latestFrom.name} <${t.latestFrom.email}>\nSubject: ${t.subject}\nSnippet: ${t.snippet}`
        },
        settings.ai,
        secrets
      )
      if (!/^yes\b/i.test(res.text.trim())) return false
    } catch {
      return false
    }
  }
  return true
}

export async function runAutopilotPass(
  db: GlassmailDB,
  secrets: SecretStore,
  broadcast: () => void,
  syncManager?: Pick<SyncManager, 'syncThreadMutationToRemote'>
): Promise<{ actionsTaken: number }> {
  if (autopilotRunning) return { actionsTaken: 0 }
  autopilotRunning = true
  let actionsTaken = 0

  try {
    const settings = db.getSettings()
    const inboxThreads = db.listThreads({ mailbox: 'inbox', limit: 60 })

    // 1. Built-in Auto-Clean 2FA codes
    const clean2faHours = settings.autopilot?.autoClean2FAHours
    if (typeof clean2faHours === 'number' && clean2faHours > 0) {
      const cutoff = Date.now() - clean2faHours * 3600_000
      for (const t of inboxThreads) {
        if (!t.signInCode || t.lastMessageAt > cutoff) continue
        const key = `builtin-2fa:${t.id}`
        if (processedRuleThreads.has(key)) continue
        processedRuleThreads.add(key)
        db.moveThreads([t.id], 'archive', 'Archive')
        db.addAutopilotLog({
          id: randomUUID(),
          ruleName: 'Auto-clean 2FA codes',
          threadId: t.id,
          threadSubject: t.subject,
          actionSummary: 'Archived expired sign-in code',
          actionType: 'archive',
          undoAction: 'restoreInbox',
          createdAt: Date.now()
        })
        actionsTaken++
      }
    }

    // 2. User-defined Autopilot rules
    const rules = db.listAutopilotRules().filter((r) => r.enabled)
    for (const rule of rules) {
      let ruleMatched = 0
      for (const t of inboxThreads) {
        const key = `${rule.id}:${t.id}`
        if (processedRuleThreads.has(key) || db.hasAutopilotProcessed(rule.id, t.id)) {
          processedRuleThreads.add(key)
          continue
        }
        const matches = await threadMatchesRule(t, rule, db, secrets)
        if (!matches) continue
        processedRuleThreads.add(key)

        const summaries: string[] = []
        let actionType: string | undefined
        let undoAction: 'restoreInbox' | 'markUnread' | 'unstar' | null = null

        const buildMutationSnapshot = (): ThreadMutationSnapshot | undefined => {
          if (!syncManager) return undefined
          const detail = db.getThreadDetail(t.id)
          if (!detail) return undefined
          return {
            threadId: detail.id,
            accountId: detail.accountId,
            folderRole: detail.folderRole,
            folderName: detail.folderName,
            messageRemoteIds: detail.messages.map((m) => m.remoteId),
            messageFolders: detail.messages.map((m) => ({
              remoteId: m.remoteId,
              folderRole: m.folderRole,
              folderName: m.folderName
            }))
          }
        }

        for (const act of rule.actions) {
          if (act.type === 'archive') {
            const snap = buildMutationSnapshot()
            db.moveThreads([t.id], 'archive', 'Archive')
            if (syncManager) {
              void syncManager.syncThreadMutationToRemote([t.id], 'archive', 'archive', snap ? [snap] : undefined)
            }
            summaries.push('Archived')
            actionType = 'archive'
            undoAction = 'restoreInbox'
          } else if (act.type === 'trash') {
            const snap = buildMutationSnapshot()
            db.moveThreads([t.id], 'trash', 'Trash')
            if (syncManager) {
              void syncManager.syncThreadMutationToRemote([t.id], 'trash', 'trash', snap ? [snap] : undefined)
            }
            summaries.push('Moved to Trash')
            actionType = 'trash'
            undoAction = 'restoreInbox'
          } else if (act.type === 'moveToFolder' && act.folderName) {
            const snap = buildMutationSnapshot()
            db.moveThreads([t.id], 'custom', act.folderName)
            if (syncManager) {
              void syncManager.syncThreadMutationToRemote(
                [t.id],
                'move',
                'custom',
                snap ? [snap] : undefined,
                act.folderName
              )
            }
            summaries.push(`Moved to ${act.folderName}`)
            actionType = 'moveToFolder'
            undoAction = 'restoreInbox'
          } else if (act.type === 'markRead') {
            const snap = buildMutationSnapshot()
            db.setThreadRead([t.id], true)
            if (syncManager) {
              void syncManager.syncThreadMutationToRemote([t.id], 'read', undefined, snap ? [snap] : undefined)
            }
            summaries.push('Marked read')
            if (!actionType) actionType = 'markRead'
            if (!undoAction) undoAction = 'markUnread'
          } else if (act.type === 'star') {
            const snap = buildMutationSnapshot()
            db.setThreadStarred([t.id], true)
            if (syncManager) {
              void syncManager.syncThreadMutationToRemote([t.id], 'star', undefined, snap ? [snap] : undefined)
            }
            summaries.push('Starred')
            if (!actionType) actionType = 'star'
            if (!undoAction) undoAction = 'unstar'
          } else if (act.type === 'notify') {
            // Only fire desktop alerts for unread emails so restarts/rules never spam notifications for old read mail
            if (!t.isRead && Notification.isSupported()) {
              new Notification({
                title: `Autopilot (${rule.name}) · ${t.latestFrom.name || t.latestFrom.email}`,
                body: t.subject
              }).show()
              summaries.push('Notified')
              if (!actionType) actionType = 'notify'
            }
          } else if (act.type === 'preDraft') {
            if (!db.getPreDraft(t.id, { includeDismissed: true }) && !attemptedPreDraftThreads.has(t.id)) {
              attemptedPreDraftThreads.add(t.id)
              const detail = db.getThreadDetail(t.id)
              const latestMsg = detail?.messages[detail.messages.length - 1]
              const res = await draftVoiceMatchedReply({
                accountId: t.accountId,
                threadId: t.id,
                instruction: 'Write a concise, helpful, natural reply to this email.',
                db,
                secrets
              })
              if (res.draft && !res.error) {
                db.upsertPreDraft({
                  threadId: t.id,
                  accountId: t.accountId,
                  subject: t.subject.startsWith('Re:') ? t.subject : `Re: ${t.subject}`,
                  body: res.draft,
                  providerLabel: res.providerLabel,
                  createdAt: Date.now(),
                  messageId: latestMsg?.id,
                  status: 'ready',
                  source: 'auto'
                })
                summaries.push('Pre-drafted reply')
                if (!actionType) actionType = 'preDraft'
              }
            }
          }
        }

        if (summaries.length > 0) {
          db.addAutopilotLog({
            id: randomUUID(),
            ruleId: rule.id,
            ruleName: rule.name,
            threadId: t.id,
            threadSubject: t.subject,
            actionSummary: summaries.join(' · '),
            actionType,
            undoAction,
            createdAt: Date.now()
          })
          ruleMatched++
          actionsTaken++
        }
      }
      if (ruleMatched > 0) {
        db.recordAutopilotRuleRun(rule.id, ruleMatched)
      }
    }

    // 3. Built-in Background Pre-Drafts (6-Point Auto-Draft Gate):
    //    (a) Always-auto-draft VIP senders run first (even if blanket autoPreDraftPeople is off) and bypass Gate 4
    //    (b) General unread human emails run when autoPreDraftPeople is on and must pass all 6 gates
    const alwaysSenders = (settings.autopilot?.preDraftAlwaysSenders || []).map((s) => s.toLowerCase())
    if (settings.autopilot?.autoPreDraftPeople || alwaysSenders.length > 0) {
      const disabledAccs = new Set(settings.autopilot?.preDraftDisabledAccountIds || [])
      const excludedSenders = (settings.autopilot?.preDraftExcludedSenders || []).map((s) => s.toLowerCase())
      const minConfidence = settings.ai.decision?.autoDraftMinConfidence ?? 0.8
      const maxAgeMs = 48 * 3600_000
      const now = Date.now()
      const metaByThread = db.getThreadAiMetaBatch(inboxThreads.map((t) => t.id))

      const matchesList = (email: string, list: string[]) =>
        list.some((entry) => (entry.startsWith('@') ? email.endsWith(entry) : email === entry))
      const automatedSenderRe =
        /^(no-?reply|donotreply|do-not-reply|auto-?confirm|confirm|confirmation|orders?|ship-?confirm|shipping|delivery|tracking|mailer-daemon|notifications?|alerts?|updates?|news|newsletter|digest|billing|receipts?|invoices?|payments?|statements?|automated|robot|system|postmaster|bounce|marketing|promo|promotions?|offers?|deals?|sales|hello|info|team|support|help|store|shop|account|security|verify|editors?|weekly|daily|calendar-notification|drive-shares|comments-noreply)[@._-]/i
      const automatedSubjectRe =
        /\b(ordered\s+\d|order\s*#|your\s+order|has\s+shipped|out\s+for\s+delivery|delivered:|receipt\s+for|invoice\s*#|payment\s+received|black\s+friday|%\s*off|sale\s+ends|weekly\s+digest|daily\s+digest|price\s+change|security\s+alert|unrecognized\s+device|sign-?in\s+code|verification\s+code|newsletter|unsubscribe)\b/i

      const runDraftForThread = async (
        t: ThreadSummary,
        latestMsgId: string | undefined,
        label: string
      ): Promise<boolean> => {
        attemptedPreDraftThreads.add(t.id)
        const res = await draftVoiceMatchedReply({
          accountId: t.accountId,
          threadId: t.id,
          instruction: 'Draft a concise, natural, voice-matched reply to this email.',
          db,
          secrets
        })
        if (res.draft && !res.error) {
          // Gate 6: persist with messageId, status: 'ready', source: 'auto'
          db.upsertPreDraft({
            threadId: t.id,
            accountId: t.accountId,
            subject: t.subject.startsWith('Re:') ? t.subject : `Re: ${t.subject}`,
            body: res.draft,
            providerLabel: res.providerLabel,
            createdAt: Date.now(),
            messageId: latestMsgId,
            status: 'ready',
            source: 'auto'
          })
          db.addAutopilotLog({
            id: randomUUID(),
            ruleName: label,
            threadId: t.id,
            threadSubject: t.subject,
            actionSummary: `Drafted reply (${res.providerLabel})`,
            actionType: 'preDraft',
            undoAction: null,
            createdAt: Date.now()
          })
          actionsTaken++
          return true
        }
        return false
      }

      const senderProfileCache = new Map<string, SenderProfile | null>()
      const getSenderProfileCached = (email: string): SenderProfile | null => {
        if (!email) return null
        if (!senderProfileCache.has(email)) {
          senderProfileCache.set(email, db.getSenderProfile(email))
        }
        return senderProfileCache.get(email) ?? null
      }

      const evaluateSixPointGate = (
        t: ThreadSummary,
        isVip: boolean
      ): { pass: boolean; latestMsgId?: string } => {
        if (t.isRead || disabledAccs.has(t.accountId)) return { pass: false }
        const fromEmail = (t.latestFrom.email || '').toLowerCase()
        const accEmail = (t.accountEmail || '').toLowerCase()
        if (!fromEmail || fromEmail === accEmail) return { pass: false }
        if (matchesList(fromEmail, excludedSenders)) return { pass: false }
        if (attemptedPreDraftThreads.has(t.id)) return { pass: false }

        // Lane 1 Silent Safe Tuning: respect learned/locked sender preferences at 0 tokens
        const isExplicitAlways = matchesList(fromEmail, alwaysSenders)
        const senderProfile = getSenderProfileCached(fromEmail)
        if (senderProfile?.preference === 'no_autodraft' && !isExplicitAlways) {
          return { pass: false }
        }
        const effectiveVip = isVip || senderProfile?.preference === 'vip'

        // Gate 1: Tier 0 pass (not automated / unsubscribe / security)
        if (!effectiveVip) {
          if (t.category !== 'people') return { pass: false }
          if (t.unsubscribeUrl || t.signInCode) return { pass: false }
          if (automatedSenderRe.test(fromEmail)) return { pass: false }
          if (automatedSubjectRe.test(`${t.subject} ${t.snippet}`)) return { pass: false }
        }

        // Gate 3 (early check): not already replied to, not already drafted or dismissed in thread_predrafts
        if (t.waitingSince) return { pass: false }
        const existingPreDraft = db.getPreDraft(t.id, { includeDismissed: true })
        if (existingPreDraft) return { pass: false }

        const detail = db.getThreadDetail(t.id)
        const nonDrafts = detail?.messages.filter((m) => !m.isDraft) || []
        const latestMsg = nonDrafts[nonDrafts.length - 1]
        if (!latestMsg) return { pass: false }

        // Gate 3 (continued): latest message is inbound and < 48h old
        if (latestMsg.isSent) return { pass: false }
        if (now - latestMsg.date > maxAgeMs) return { pass: false }

        // Gate 1 (body check for disguised newsletters on non-VIP)
        if (!effectiveVip) {
          const fullBodyCheck = `${latestMsg.bodyText || ''} ${latestMsg.bodyHtml || ''}`
          if (
            /unsubscribe|manage\s+(?:your\s+)?(?:email\s+)?preferences|email\s+preferences|view\s+(?:this\s+email\s+)?in\s+(?:your\s+)?browser|opt[\s-]out/i.test(
              fullBodyCheck
            )
          ) {
            attemptedPreDraftThreads.add(t.id)
            return { pass: false }
          }

          // Gate 2: User's account email is in To: (not CC-only) and total recipients <= 4
          const toList = (latestMsg.to || []).map((a) => (a.email || '').toLowerCase().trim()).filter(Boolean)
          const ccList = (latestMsg.cc || []).map((a) => (a.email || '').toLowerCase().trim()).filter(Boolean)
          const totalRecipients = toList.length + ccList.length
          if (toList.length > 0 && accEmail && !toList.includes(accEmail)) {
            return { pass: false }
          }
          if (totalRecipients > 4) {
            return { pass: false }
          }
        }

        const meta = metaByThread[t.id]

        // Gate 5: Safety gate — never auto-draft on suspicious/phishing mail
        if (t.scamWarning || (meta && meta.phishingRisk > 0)) {
          return { pass: false }
        }

        // Gate 4: Persisted thread_ai_meta confidence check (VIP alwaysSenders / learned VIP bypasses Gate 4)
        if (!effectiveVip) {
          if (
            !meta ||
            !meta.modelLabel ||
            meta.modelLabel === 'tier0-rules' ||
            !meta.needsReply ||
            !meta.autoDraftWorthy ||
            meta.replyConfidence < minConfidence
          ) {
            return { pass: false }
          }
        }

        return { pass: true, latestMsgId: latestMsg.id }
      }

      // (a) Priority pass for "Always auto-draft" VIP senders
      if (alwaysSenders.length > 0) {
        let vipDrafted = 0
        for (const t of inboxThreads) {
          if (vipDrafted >= 4) break
          const fromEmail = (t.latestFrom.email || '').toLowerCase()
          if (!matchesList(fromEmail, alwaysSenders)) continue
          const gate = evaluateSixPointGate(t, true)
          if (!gate.pass) continue
          if (await runDraftForThread(t, gate.latestMsgId, 'Always Auto-Draft')) {
            vipDrafted++
          }
        }
      }

      // (b) General pass for unread human emails
      if (settings.autopilot?.autoPreDraftPeople) {
        let drafted = 0
        for (const t of inboxThreads) {
          if (drafted >= 2) break
          const gate = evaluateSixPointGate(t, false)
          if (!gate.pass) continue
          if (await runDraftForThread(t, gate.latestMsgId, 'Background Pre-Drafts')) {
            drafted++
          }
        }
      }
    }

    if (actionsTaken > 0) {
      broadcast()
    }
    return { actionsTaken }
  } finally {
    autopilotRunning = false
  }
}

export function checkDueReminders(
  db: GlassmailDB,
  getMainWindow: () => BrowserWindow | null,
  broadcast: () => void
): void {
  const autoCancelled = db.autoCancelNoReplyReminders()
  const due = db.getDueUnnotifiedReminders(Date.now())
  if (due.length === 0 && autoCancelled === 0) return

  const win = getMainWindow()

  for (const r of due) {
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: `Reminder: ${r.title}`,
        body: r.note || r.threadSubject || 'Due now in EveryBox'
      })
      notif.on('click', () => {
        const w = getMainWindow()
        if (w && !w.isDestroyed()) {
          if (w.isMinimized()) w.restore()
          w.focus()
          w.flashFrame(false)
          if (r.threadId) {
            w.webContents.send('glassmail:focus-thread', r.threadId)
          }
        }
      })
      notif.show()
    }
    if (win && !win.isDestroyed()) {
      win.webContents.send('glassmail:reminder-due', r.id)
      if (!win.isFocused() || win.isMinimized()) {
        win.flashFrame(true)
      }
    }
    db.markReminderNotified(r.id)
  }

  broadcast()
}

// Cache AI "Waiting on you" verdicts by threadId so Inbox Home stays instant
const waitingAICache = new Map<string, { needsYou: boolean; reason: string; lastMessageAt: number }>()

const WAITING_AUTOMATED_RE =
  /^(no-?reply|donotreply|mailer-daemon|notifications?|alerts?|updates?|news|newsletter|digest|billing|receipts?|automated|robot|system|postmaster|bounce|marketing|promotions?|offers?|deals?|hello|info|team|support|editors?|weekly|daily)[@._-]/i

const WAITING_QUESTION_RE =
  /\?|can you|could you|would you|please\s+(send|review|confirm|let me know|check|sign|approve)|let me know|your thoughts|waiting on|follow up|fyi|sow|contract|proposal|schedule|call me|meet/i

export async function getWaitingOnYouItems(
  db: GlassmailDB,
  secrets: SecretStore,
  accountIds?: string[],
  useAI = false
): Promise<WaitingOnYouItem[]> {
  const settings = db.getSettings()
  const excludedSenders = (settings.autopilot?.preDraftExcludedSenders || []).map((s) => s.toLowerCase())
  const dismissedIds = new Set(settings.autopilot?.waitingDismissedThreadIds || [])

  const inbox = db.listThreads({
    accountIds: accountIds && accountIds.length > 0 ? accountIds : undefined,
    mailbox: 'inbox',
    limit: 80
  })

  // First read persisted thread_ai_meta directly from SQLite — instant across restarts
  const metaMap = db.getThreadAiMetaBatch(inbox.map((t) => t.id))
  const persistedItems: { item: WaitingOnYouItem; urgency: number; confidence: number }[] = []
  const unclassifiedCandidates: ThreadSummary[] = []

  for (const t of inbox) {
    if (t.isRead) continue
    if (dismissedIds.has(t.id)) continue
    const fromEmail = (t.latestFrom.email || '').toLowerCase()
    if (!fromEmail || fromEmail === (t.accountEmail || '').toLowerCase()) continue
    if (excludedSenders.some((ex) => (ex.startsWith('@') ? fromEmail.endsWith(ex) : fromEmail === ex))) {
      continue
    }

    const meta = metaMap[t.id]
    if (meta && meta.classifiedMsgAt === t.lastMessageAt && meta.modelLabel) {
      if (meta.needsReply && (meta.phishingRisk ?? 0) < 2) {
        persistedItems.push({
          item: {
            thread: t,
            reason: meta.aiReason || 'Needs your reply',
            aiVerified: true
          },
          urgency: meta.urgency,
          confidence: meta.replyConfidence
        })
      }
      // Already classified in SQLite (needsReply === false) — skip redundant LLM calls
      continue
    }

    // Fallback candidate for threads not yet triaged by TriageWorker
    if (t.unsubscribeUrl || t.signInCode) continue
    if (t.category === 'updates') continue
    if (WAITING_AUTOMATED_RE.test(fromEmail)) continue
    unclassifiedCandidates.push(t)
  }

  persistedItems.sort(
    (a, b) =>
      b.urgency - a.urgency ||
      b.confidence - a.confidence ||
      b.item.thread.lastMessageAt - a.item.thread.lastMessageAt
  )

  const verifiedResults: WaitingOnYouItem[] = persistedItems.slice(0, 5).map((p) => p.item)
  if (verifiedResults.length >= 5 || unclassifiedCandidates.length === 0) {
    return verifiedResults
  }

  const remainingSlots = 5 - verifiedResults.length
  const knownContacts = db.getKnownCorrespondentEmails()
  const repliedThreadIds = db.getThreadIdsWithUserSent(unclassifiedCandidates.map((t) => t.id))

  const scored = unclassifiedCandidates
    .map((t) => {
      const fromEmail = (t.latestFrom.email || '').toLowerCase()
      let score = 0
      let reason = ''
      if (repliedThreadIds.has(t.id)) {
        score += 5
        reason = 'Replied to your email'
      }
      if (knownContacts.has(fromEmail)) {
        score += 4
        if (!reason) reason = 'Known contact'
      }
      if (t.isStarred) {
        score += 3
        if (!reason) reason = 'Starred'
      }
      if (WAITING_QUESTION_RE.test(`${t.subject} ${t.snippet}`)) {
        score += 2
        if (!reason) reason = 'Asking for a reply'
      }
      return { thread: t, score, reason: reason || 'Unread from person' }
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || b.thread.lastMessageAt - a.thread.lastMessageAt)
    .slice(0, 8)

  if (!useAI || scored.length === 0) {
    const fallback = scored.slice(0, remainingSlots).map((s) => {
      const cached = waitingAICache.get(s.thread.id)
      if (cached && cached.lastMessageAt === s.thread.lastMessageAt) {
        return { thread: s.thread, reason: cached.reason || s.reason, aiVerified: true }
      }
      return { thread: s.thread, reason: s.reason, aiVerified: false }
    })
    return [...verifiedResults, ...fallback]
  }

  // Tier 2: Enrich any uncached unclassified candidates in one fast batch AI call
  const uncached = scored.filter((s) => {
    const c = waitingAICache.get(s.thread.id)
    return !c || c.lastMessageAt !== s.thread.lastMessageAt
  })

  if (uncached.length > 0) {
    try {
      const listing = uncached
        .map(
          (s, i) =>
            `[${i}] id="${s.thread.id}" | From: ${s.thread.latestFrom.name} <${s.thread.latestFrom.email}> | Subject: ${s.thread.subject} | Snippet: ${s.thread.snippet.slice(0, 180)}`
        )
        .join('\n')
      const res = await completeAI(
        {
          maxTokens: 600,
          jsonMode: true,
          priority: 'background',
          system: `You filter an email inbox for "Waiting on you" — ONLY emails from real humans or important senders that genuinely require a reply, decision, or action from the user. Reject newsletters, digests, marketing, cold pitches, and FYI notifications.
Return ONLY a JSON array:
[{"id":"...","needsYou":true,"reason":"3-5 word reason like 'Needs final SOW' or 'Asking for meeting time'"}]`,
          prompt: `Classify these unread emails:\n${listing}`
        },
        settings.ai,
        secrets
      )
      const raw = res.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      const parsed = JSON.parse(raw) as { id: string; needsYou: boolean; reason?: string }[]
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const match = uncached.find((u) => u.thread.id === item.id)
          if (match) {
            waitingAICache.set(item.id, {
              needsYou: Boolean(item.needsYou),
              reason: (item.reason || match.reason).trim().slice(0, 48),
              lastMessageAt: match.thread.lastMessageAt
            })
          }
        }
      }
    } catch {
      // Fall back cleanly to Tier 1 deterministic scores
    }
  }

  const finalItems: WaitingOnYouItem[] = [...verifiedResults]
  for (const s of scored) {
    if (finalItems.length >= 5) break
    const c = waitingAICache.get(s.thread.id)
    if (c && c.lastMessageAt === s.thread.lastMessageAt) {
      if (!c.needsYou) continue
      finalItems.push({ thread: s.thread, reason: c.reason || s.reason, aiVerified: true })
    } else {
      finalItems.push({ thread: s.thread, reason: s.reason, aiVerified: false })
    }
  }

  return finalItems
}
