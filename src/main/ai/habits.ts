import { randomUUID } from 'crypto'
import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type {
  AutopilotAction,
  AutopilotCondition,
  AutopilotRule,
  HabitActionType,
  HabitSuggestion,
  SenderProfile,
  ThreadAIBundle
} from '../../shared/types'
import { compileNaturalLanguageRule } from './autopilot'

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
const MIN_SENDER_REPETITIONS = 3
const MIN_SENDER_CONSISTENCY = 0.85
const MIN_BUNDLE_CONSECUTIVE = 5

export interface RecordUserHabitActionInput {
  senderEmail: string
  displayName?: string
  action: HabitActionType
  folderName?: string | null
  bundle?: ThreadAIBundle | null
  hadOpened?: boolean
  threadId?: string | null
  createdAt?: number
}

function extractDomain(email: string): string {
  const idx = email.lastIndexOf('@')
  return idx >= 0 ? email.slice(idx + 1).trim().toLowerCase() : ''
}

function emptyProfile(senderEmail: string, senderDomain: string, now: number): SenderProfile {
  return {
    senderEmail,
    senderDomain,
    displayName: '',
    totalSeen: 0,
    repliedCount: 0,
    starredCount: 0,
    archivedUnreadCount: 0,
    trashedUnreadCount: 0,
    draftAcceptedCount: 0,
    draftDismissedCount: 0,
    movedFolders: {},
    preference: 'normal',
    preferenceLocked: false,
    lastRepliedAt: null,
    updatedAt: now
  }
}

function isHumanSafetyLocked(
  profile: SenderProfile,
  bundle: ThreadAIBundle | null | undefined,
  now: number
): boolean {
  if (profile.repliedCount > 0) return true
  if (profile.lastRepliedAt && now - profile.lastRepliedAt <= NINETY_DAYS_MS) return true
  if (profile.preference === 'vip') return true
  if (bundle === 'security' || bundle === 'action') return true
  return false
}

function maybeCreateSuggestion(
  db: GlassmailDB,
  suggestion: HabitSuggestion
): HabitSuggestion | null {
  // Permanent mute: if this pattern was ever suggested (pending, accepted, or dismissed), never re-ask
  if (db.getHabitSuggestionByPatternKey(suggestion.patternKey)) {
    return null
  }
  db.upsertHabitSuggestion(suggestion)
  return suggestion
}

export function recordUserHabitAction(
  db: GlassmailDB,
  input: RecordUserHabitActionInput
): { profile: SenderProfile; newSuggestion: HabitSuggestion | null } {
  const now = input.createdAt ?? Date.now()
  const senderEmail = (input.senderEmail || '').trim().toLowerCase()
  const senderDomain = extractDomain(senderEmail)

  if (!senderEmail || !senderDomain) {
    return { profile: emptyProfile(senderEmail, senderDomain, now), newSuggestion: null }
  }

  const folderName = input.folderName?.trim() || null
  const hadOpened = Boolean(input.hadOpened)
  const bundle = input.bundle ?? null

  // 1. Log raw habit event
  db.insertHabitEvent({
    id: randomUUID(),
    senderEmail,
    senderDomain,
    bundle,
    action: input.action,
    folderName,
    hadOpened,
    threadId: input.threadId ?? null,
    createdAt: now
  })

  // 2. Update sender profile counters
  const existing = db.getSenderProfile(senderEmail) ?? emptyProfile(senderEmail, senderDomain, now)
  const movedFolders: Record<string, number> = { ...existing.movedFolders }
  const cleanDisplayName = input.displayName?.trim() || ''

  const profile: SenderProfile = {
    ...existing,
    senderEmail,
    senderDomain,
    displayName:
      cleanDisplayName && (!existing.displayName || existing.displayName.toLowerCase() === senderEmail)
        ? cleanDisplayName
        : existing.displayName,
    totalSeen: existing.totalSeen + 1,
    movedFolders,
    updatedAt: now
  }

  switch (input.action) {
    case 'reply':
      profile.repliedCount += 1
      profile.lastRepliedAt = now
      break
    case 'star':
      profile.starredCount += 1
      break
    case 'archive':
      if (!hadOpened) profile.archivedUnreadCount += 1
      break
    case 'trash':
      if (!hadOpened) profile.trashedUnreadCount += 1
      break
    case 'draft_accepted':
      profile.draftAcceptedCount += 1
      break
    case 'draft_dismissed':
      profile.draftDismissedCount += 1
      break
    case 'move_folder':
      if (folderName) {
        profile.movedFolders[folderName] = (profile.movedFolders[folderName] || 0) + 1
      }
      break
  }

  // 3. Lane 1 (Silent Safe Tuning) — only when user hasn't explicitly locked preference
  if (!profile.preferenceLocked) {
    if (
      profile.draftDismissedCount >= 2 ||
      (profile.archivedUnreadCount + profile.trashedUnreadCount >= 4 && profile.repliedCount === 0)
    ) {
      profile.preference = 'no_autodraft'
    } else if (profile.repliedCount >= 3 || profile.starredCount >= 2) {
      profile.preference = 'vip'
    }
  }

  db.upsertSenderProfile(profile)

  // 4. Lane 2 (Permission-First Rule Suggestions)
  let newSuggestion: HabitSuggestion | null = null
  const senderLabel = profile.displayName || senderEmail

  if (input.action === 'move_folder' && folderName) {
    const recent = db.listRecentHabitEventsForSender(senderEmail, 20)
    const targetLower = folderName.toLowerCase()
    const matching = recent.filter(
      (e) => e.action === 'move_folder' && (e.folderName || '').toLowerCase() === targetLower
    ).length
    const confidence = recent.length > 0 ? matching / recent.length : 0

    if (matching >= MIN_SENDER_REPETITIONS && confidence >= MIN_SENDER_CONSISTENCY) {
      newSuggestion = maybeCreateSuggestion(db, {
        id: randomUUID(),
        kind: 'sender_move',
        patternKey: `sender_move:${senderEmail}:${targetLower}`,
        senderEmail,
        senderDomain,
        targetFolder: folderName,
        title: `Auto-file ${senderLabel} to ${folderName}`,
        reason: `You moved ${matching} emails from ${senderLabel} to "${folderName}"`,
        rulePrompt: `Move emails from ${senderEmail} to ${folderName}`,
        sampleCount: matching,
        confidence: Number(confidence.toFixed(2)),
        status: 'pending',
        createdAt: now,
        resolvedAt: null
      })
    }
  } else if (input.action === 'archive' && !hadOpened) {
    if (!isHumanSafetyLocked(profile, bundle, now)) {
      const recent = db.listRecentHabitEventsForSender(senderEmail, 20)
      const matching = recent.filter((e) => e.action === 'archive' && !e.hadOpened).length
      const confidence = recent.length > 0 ? matching / recent.length : 0

      if (matching >= MIN_SENDER_REPETITIONS && confidence >= MIN_SENDER_CONSISTENCY) {
        newSuggestion = maybeCreateSuggestion(db, {
          id: randomUUID(),
          kind: 'sender_archive',
          patternKey: `sender_archive:${senderEmail}`,
          senderEmail,
          senderDomain,
          title: `Auto-archive ${senderLabel}`,
          reason: `You archived ${matching} unread emails from ${senderLabel} without replying`,
          rulePrompt: `Archive emails from ${senderEmail}`,
          sampleCount: matching,
          confidence: Number(confidence.toFixed(2)),
          status: 'pending',
          createdAt: now,
          resolvedAt: null
        })
      }
    }
  } else if (input.action === 'trash' && !hadOpened) {
    if (!isHumanSafetyLocked(profile, bundle, now)) {
      const recent = db.listRecentHabitEventsForSender(senderEmail, 20)
      const matching = recent.filter((e) => e.action === 'trash' && !e.hadOpened).length
      const confidence = recent.length > 0 ? matching / recent.length : 0

      if (matching >= MIN_SENDER_REPETITIONS && confidence >= MIN_SENDER_CONSISTENCY) {
        newSuggestion = maybeCreateSuggestion(db, {
          id: randomUUID(),
          kind: 'sender_trash',
          patternKey: `sender_trash:${senderEmail}`,
          senderEmail,
          senderDomain,
          title: `Auto-trash ${senderLabel}`,
          reason: `You trashed ${matching} unread emails from ${senderLabel}`,
          rulePrompt: `Trash emails from ${senderEmail}`,
          sampleCount: matching,
          confidence: Number(confidence.toFixed(2)),
          status: 'pending',
          createdAt: now,
          resolvedAt: null
        })
      }
    }
  }

  // Bundle-level suggestion: >= 5 consecutive archive/trash on cold_outreach or promo with 0 replies
  if (
    !newSuggestion &&
    (input.action === 'archive' || input.action === 'trash') &&
    (bundle === 'cold_outreach' || bundle === 'promo')
  ) {
    const recentBundle = db.listRecentHabitEventsForBundle(bundle, 20)
    let consecutive = 0
    for (const ev of recentBundle) {
      if (ev.action === 'archive' || ev.action === 'trash') {
        consecutive++
      } else {
        break
      }
    }
    const hasBundleReply = recentBundle.some((ev) => ev.action === 'reply')

    if (consecutive >= MIN_BUNDLE_CONSECUTIVE && !hasBundleReply) {
      const isColdOutreach = bundle === 'cold_outreach'
      const confidence = recentBundle.length > 0 ? consecutive / recentBundle.length : 0.9
      newSuggestion = maybeCreateSuggestion(db, {
        id: randomUUID(),
        kind: 'bundle_archive',
        patternKey: `bundle_archive:${bundle}`,
        bundle,
        title: isColdOutreach ? 'Auto-archive cold outreach' : 'Auto-archive promotional emails',
        reason: isColdOutreach
          ? `You archived or trashed ${consecutive} consecutive cold outreach emails without replying`
          : `You archived or trashed ${consecutive} consecutive promotional emails without replying`,
        rulePrompt: isColdOutreach ? 'Archive cold sales outreach emails' : 'Archive promotional emails',
        sampleCount: consecutive,
        confidence: Number(Math.max(0.85, Math.min(0.99, confidence)).toFixed(2)),
        status: 'pending',
        createdAt: now,
        resolvedAt: null
      })
    }
  }

  return { profile, newSuggestion }
}

export async function acceptHabitSuggestion(
  db: GlassmailDB,
  secrets: SecretStore,
  suggestionId: string
): Promise<{ ok: boolean; rule?: AutopilotRule; error?: string }> {
  const suggestion = db.getHabitSuggestion(suggestionId)
  if (!suggestion) {
    return { ok: false, error: 'Habit suggestion not found' }
  }
  if (suggestion.status === 'accepted') {
    return { ok: false, error: 'Habit suggestion was already accepted' }
  }

  const now = Date.now()
  let conditions: AutopilotCondition = {}
  let actions: AutopilotAction[] = []
  let name = suggestion.title

  if (
    (suggestion.kind === 'sender_archive' ||
      suggestion.kind === 'sender_trash' ||
      suggestion.kind === 'sender_move') &&
    suggestion.senderEmail
  ) {
    // Deterministic 0-token sender rule
    conditions = { fromContains: suggestion.senderEmail }
    if (suggestion.kind === 'sender_archive') {
      actions = [{ type: 'archive' }]
    } else if (suggestion.kind === 'sender_trash') {
      actions = [{ type: 'trash' }]
    } else {
      actions = [{ type: 'moveToFolder', folderName: suggestion.targetFolder || 'Archive' }]
    }
  } else if (suggestion.kind === 'bundle_archive' || suggestion.kind === 'bundle_move') {
    // Semantic AI rule so Decision AI evaluates across new senders
    const aiPrompt =
      suggestion.bundle === 'cold_outreach'
        ? 'Is this an unsolicited cold sales pitch or cold outreach email?'
        : suggestion.bundle === 'promo'
          ? 'Is this a promotional marketing email, sale, or commercial offer?'
          : suggestion.rulePrompt
    conditions = { aiPrompt }
    actions =
      suggestion.kind === 'bundle_move' && suggestion.targetFolder
        ? [{ type: 'moveToFolder', folderName: suggestion.targetFolder }]
        : [{ type: 'archive' }]
  } else {
    const compiled = await compileNaturalLanguageRule(suggestion.rulePrompt, db, secrets)
    name = compiled.rule.name
    conditions = compiled.rule.conditions
    actions = compiled.rule.actions
  }

  const rule: AutopilotRule = {
    id: randomUUID(),
    name,
    prompt: suggestion.rulePrompt,
    enabled: true,
    conditions,
    actions,
    runCount: 0,
    lastRunAt: null,
    createdAt: now,
    source: 'learned'
  }

  db.upsertAutopilotRule(rule)
  db.updateHabitSuggestionStatus(suggestion.id, 'accepted', now)

  return { ok: true, rule }
}

export function dismissHabitSuggestion(
  db: GlassmailDB,
  suggestionId: string
): { ok: boolean } {
  const suggestion = db.getHabitSuggestion(suggestionId)
  if (!suggestion) {
    return { ok: false }
  }
  db.updateHabitSuggestionStatus(suggestionId, 'dismissed', Date.now())
  return { ok: true }
}
