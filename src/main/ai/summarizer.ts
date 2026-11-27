import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type { ThreadAISummary } from '../../shared/types'
import { extractEmailImages } from './images'
import { completeAI, extractJsonBlock } from './provider'

export interface SummarizeThreadOptions {
  cachedSummary?: ThreadAISummary | null
  forceRefresh?: boolean
}

export async function summarizeThread(
  threadId: string,
  db: GlassmailDB,
  secrets: SecretStore,
  options?: SummarizeThreadOptions
): Promise<ThreadAISummary> {
  if (!options?.forceRefresh && options?.cachedSummary?.gist) {
    return options.cachedSummary
  }

  const detail = db.getThreadDetail(threadId)
  if (!detail) throw new Error('Thread not found.')
  const settings = db.getSettings()

  const transcript = detail.messages
    .map(
      (m) =>
        `From: ${m.from.name} <${m.from.email}> (${new Date(m.date).toLocaleString()})\n${m.bodyText.slice(0, 1800)}`
    )
    .join('\n\n---\n\n')

  const images = await extractEmailImages(detail.messages, 3)

  let aiError: string | null = null
  try {
    const res = await completeAI(
      {
        jsonMode: true,
        maxTokens: 2048,
        priority: 'interactive',
        images,
        system: `You summarize email threads for EveryBox. If embedded images (charts, receipts, tables, screenshots) are included, read their contents and include the key facts in the summary.
Return STRICT JSON:
{
  "gist": "2 concise sentences explaining what this thread is about.",
  "actionItems": ["short bullet points of what the user is being asked to do"],
  "keyDates": ["any deadlines or dates mentioned"]
}`,
        prompt: `Subject: ${detail.subject}\n\n${transcript}`
      },
      settings.ai,
      secrets
    )

    const parsed = extractJsonBlock<{ gist: string; actionItems?: string[]; keyDates?: string[] }>(res.text)
    if (parsed?.gist) {
      return {
        gist: parsed.gist,
        actionItems: parsed.actionItems || [],
        keyDates: parsed.keyDates || [],
        providerLabel: res.providerLabel
      }
    }
    aiError = 'AI returned a non-JSON response.'
  } catch (err) {
    aiError = err instanceof Error ? err.message : String(err)
  }

  return {
    gist: `AI provider (${settings.ai.provider}) could not summarize: ${aiError || 'Unknown error'}. Check Settings › AI Providers.`,
    actionItems: [],
    keyDates: [],
    providerLabel: `AI Error (${settings.ai.provider})`
  }
}
