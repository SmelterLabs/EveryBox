import { randomUUID } from 'crypto'
import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type { VoiceProfile, VoiceProfileKind } from '../../shared/types'
import { extractEmailImages } from './images'
import { completeAI } from './provider'

export async function draftVoiceMatchedReply(opts: {
  accountId: string
  threadId?: string
  instruction: string
  voiceProfileId?: string
  db: GlassmailDB
  secrets: SecretStore
}): Promise<{ draft: string; providerLabel: string; error?: string }> {
  const account = opts.db.getAccount(opts.accountId)
  const settings = opts.db.getSettings()
  const sentSamples = opts.db.getRecentSentBodies(opts.accountId, 8)
  const detail = opts.threadId ? opts.db.getThreadDetail(opts.threadId) : null

  // Pick explicit VoiceProfile, or account-matched VoiceProfile, or default VoiceProfile
  const voices = opts.db.listVoiceProfiles()
  const matchedVoice =
    (opts.voiceProfileId ? voices.find((v) => v.id === opts.voiceProfileId) : undefined) ||
    voices.find((v) => v.accountIds.includes(opts.accountId) && v.styleSummary.trim()) ||
    voices.find((v) => v.isDefault && v.styleSummary.trim()) ||
    voices.find((v) => v.styleSummary.trim())

  // Include next 5 days of combined calendar so scheduling replies ("yes, next week") know real availability!
  const now = Date.now()
  const upcomingEvents = opts.db.listCalendarEvents(now, now + 5 * 86400_000)
  const calendarLines = upcomingEvents
    .slice(0, 12)
    .map((e) => `- ${new Date(e.startAt).toLocaleString()} to ${new Date(e.endAt).toLocaleTimeString()}: ${e.title}`)
    .join('\n')

  const threadText = detail
    ? detail.messages
        .slice(-3)
        .map((m) => `From ${m.from.name}: ${m.bodyText.slice(0, 1000)}`)
        .join('\n---\n')
    : '(New email)'

  const styleBlock = matchedVoice
    ? `Use this learned Voice Profile ("${matchedVoice.name}"):
${matchedVoice.styleSummary}
${matchedVoice.greetingStyle ? `Typical greeting: ${matchedVoice.greetingStyle}` : ''}
${matchedVoice.signOffStyle ? `Typical sign-off: ${matchedVoice.signOffStyle}` : ''}`
    : sentSamples.length > 0
      ? `Match the user's personal greeting, length, tone, and sign-off from their past sent emails:\n${sentSamples
          .slice(0, 4)
          .map((s, i) => `Sample ${i + 1}:\n${s.slice(0, 300)}`)
          .join('\n---\n')}`
      : `Write in a calm, natural, concise voice${account?.name ? ` signed as ${account.name}` : ''}.`

  const images = detail ? await extractEmailImages(detail.messages, 3) : []

  try {
    const res = await completeAI(
      {
        maxTokens: 2048,
        images,
        system: `You are EveryBox's voice-matched email writer.
${styleBlock}
If embedded images are attached from the email (charts, receipts, screenshots), read and reference their actual contents accurately.
Return ONLY the email body text (no subject line, no markdown fences, no commentary).`,
        prompt: `User's shorthand instruction: "${opts.instruction}"

Conversation context:
${threadText}

User's upcoming calendar (for reference if scheduling):
${calendarLines || '(No conflicts listed)'}`
      },
      settings.ai,
      opts.secrets
    )
    return { draft: res.text.trim(), providerLabel: res.providerLabel }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      draft: '',
      providerLabel: `AI Error (${settings.ai.provider})`,
      error: msg
    }
  }
}

function stripQuotedReply(body: string): string {
  const cutMarkers = [
    /\r?\nOn .+wrote:\s*[\r\n]/i,
    /\r?\n-{2,}\s*Original Message\s*-{2,}/i,
    /\r?\n-{2,}\s*Forwarded message\s*-{2,}/i,
    /\r?\nFrom:\s.+\r?\nSent:\s/i
  ]
  let cleaned = body
  for (const re of cutMarkers) {
    const idx = cleaned.search(re)
    if (idx > 20) cleaned = cleaned.slice(0, idx)
  }
  return cleaned
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('>'))
    .join('\n')
    .trim()
}

export async function learnVoiceProfile(opts: {
  id?: string
  kind: VoiceProfileKind
  name: string
  description: string
  accountIds: string[]
  recipientFilter?: string
  db: GlassmailDB
  secrets: SecretStore
}): Promise<{ profile?: VoiceProfile; providerLabel: string; error?: string }> {
  const settings = opts.db.getSettings()
  const rawSamples = opts.db.getSentSamplesForAccounts(opts.accountIds, 200)
  if (rawSamples.length === 0) {
    return {
      providerLabel: settings.ai.provider,
      error: 'No sent emails found for the selected account(s) yet. Send a few emails or sync first.'
    }
  }

  // Classify each sent email as INTERNAL (same domain as sender account, excluding public webmail) vs EXTERNAL
  const publicDomains = new Set(['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'live.com'])
  const annotated = rawSamples
    .map((s) => {
      const senderDomain = (s.accountEmail.split('@')[1] || '').toLowerCase()
      const isInternal =
        Boolean(senderDomain) &&
        !publicDomains.has(senderDomain) &&
        s.toEmails.some((e) => e.endsWith(`@${senderDomain}`))
      const ownBody = stripQuotedReply(s.body).slice(0, 320)
      return { ...s, body: ownBody, isInternal }
    })
    .filter((s) => s.body.length >= 15)

  // Optional user-supplied recipient/domain filter (comma-separated)
  const filterTokens = (opts.recipientFilter || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)

  let filtered = annotated
  if (filterTokens.length > 0) {
    const matched = annotated.filter((s) => {
      const hay = `${s.to} ${s.toEmails.join(' ')}`.toLowerCase()
      return filterTokens.some((tok) => hay.includes(tok))
    })
    if (matched.length > 0) filtered = matched
  } else if (opts.kind === 'colleague') {
    const internalOnly = annotated.filter((s) => s.isInternal)
    if (internalOnly.length >= 3) filtered = internalOnly
  } else if (opts.kind === 'customer') {
    const externalOnly = annotated.filter((s) => !s.isInternal)
    if (externalOnly.length >= 3) filtered = externalOnly
  }

  // Pack as many clean user-written samples as fit comfortably (~18KB cap for fast CLI + API execution)
  const chosen: typeof filtered = []
  let totalChars = 0
  for (const s of filtered) {
    if (chosen.length >= 80 || totalChars + s.body.length > 18_000) break
    chosen.push(s)
    totalChars += s.body.length + 80
  }
  const sampleText = chosen
    .map(
      (s, i) =>
        `Email ${i + 1} [${s.isInternal ? 'INTERNAL COLLEAGUE' : 'EXTERNAL'}] (To: ${s.to || 'recipient'} | Subject: ${s.subject}):\n${s.body}`
    )
    .join('\n---\n')

  const audienceHint =
    opts.kind === 'colleague'
      ? 'Focus specifically on emails tagged [INTERNAL COLLEAGUE] or addressed to teammates.'
      : opts.kind === 'customer'
        ? 'Focus specifically on emails tagged [EXTERNAL] addressed to clients, prospects, or customers.'
        : opts.kind === 'executive'
          ? 'Focus on high-level, concise, decision-oriented emails (proposals, leadership updates, key stakeholders) and distill an executive-ready version of the user\'s voice.'
          : ''

  try {
    const res = await completeAI(
      {
        maxTokens: 900,
        system: `You are a writing-style analyst for an email app. Analyze the user's real sent emails and distill a concise, actionable Voice Profile tailored to the target audience ("${opts.name}" — ${opts.description}).
${audienceHint}
Return ONLY valid JSON (no markdown fences) with this shape:
{
  "styleSummary": "3-5 concise bullet points describing sentence length, directness, warmth, vocabulary, formatting habits, and tone",
  "greetingStyle": "e.g. Hey [Name], or Hi [Name], or none",
  "signOffStyle": "e.g. Thanks, [Name] or Best, or just name"
}`,
        prompt: `Target Voice: ${opts.name} (${opts.description})\n\nUser's sent email samples (${chosen.length} analyzed):\n${sampleText}`
      },
      settings.ai,
      opts.secrets
    )

    const raw = res.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    let styleSummary = raw
    let greetingStyle: string | undefined
    let signOffStyle: string | undefined
    try {
      const parsed = JSON.parse(raw) as {
        styleSummary?: string
        greetingStyle?: string
        signOffStyle?: string
      }
      if (parsed.styleSummary) styleSummary = parsed.styleSummary.trim()
      if (parsed.greetingStyle) greetingStyle = parsed.greetingStyle.trim()
      if (parsed.signOffStyle) signOffStyle = parsed.signOffStyle.trim()
    } catch {
      // Plain text fallback
    }

    const existing = opts.db.listVoiceProfiles()
    const profile: VoiceProfile = {
      id: opts.id || `voice-${opts.kind}-${randomUUID().slice(0, 8)}`,
      kind: opts.kind,
      name: opts.name,
      description: opts.description,
      accountIds: opts.accountIds,
      styleSummary,
      greetingStyle,
      signOffStyle,
      sampleCount: chosen.length,
      isDefault: existing.length === 0,
      updatedAt: Date.now()
    }
    opts.db.upsertVoiceProfile(profile)
    return { profile, providerLabel: res.providerLabel }
  } catch (err) {
    return {
      providerLabel: settings.ai.provider,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
