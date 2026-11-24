import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import { completeAI } from './provider'

export async function draftVoiceMatchedReply(opts: {
  accountId: string
  threadId?: string
  instruction: string
  db: GlassmailDB
  secrets: SecretStore
}): Promise<{ draft: string; providerLabel: string }> {
  const account = opts.db.getAccount(opts.accountId)
  const settings = opts.db.getSettings()
  const sentSamples = opts.db.getRecentSentBodies(opts.accountId, 8)
  const detail = opts.threadId ? opts.db.getThreadDetail(opts.threadId) : null

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

  const styleBlock =
    sentSamples.length > 0
      ? `Match the user's personal greeting, length, tone, and sign-off from their past sent emails:\n${sentSamples
          .slice(0, 4)
          .map((s, i) => `Sample ${i + 1}:\n${s.slice(0, 300)}`)
          .join('\n---\n')}`
      : `Write in a calm, natural, concise voice${account?.name ? ` signed as ${account.name}` : ''}.`

  try {
    const res = await completeAI(
      {
        system: `You are Glassmail's voice-matched email writer.
${styleBlock}
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
  } catch {
    const recipient = detail?.latestFrom.name?.split(' ')[0] || 'there'
    const sender = account?.name || ''
    return {
      draft: `Hi ${recipient},\n\n${opts.instruction.charAt(0).toUpperCase() + opts.instruction.slice(1)}.\n\nBest,\n${sender}`,
      providerLabel: 'Quick Draft Template (Configure Ollama / CLI in Settings › AI)'
    }
  }
}
