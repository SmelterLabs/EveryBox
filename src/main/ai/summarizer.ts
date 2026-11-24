import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type { ThreadAISummary } from '../../shared/types'
import { completeAI, extractJsonBlock } from './provider'

export async function summarizeThread(
  threadId: string,
  db: GlassmailDB,
  secrets: SecretStore
): Promise<ThreadAISummary> {
  const detail = db.getThreadDetail(threadId)
  if (!detail) throw new Error('Thread not found.')
  const settings = db.getSettings()

  const transcript = detail.messages
    .map(
      (m) =>
        `From: ${m.from.name} <${m.from.email}> (${new Date(m.date).toLocaleString()})\n${m.bodyText.slice(0, 1800)}`
    )
    .join('\n\n---\n\n')

  try {
    const res = await completeAI(
      {
        jsonMode: true,
        system: `You summarize email threads for Glassmail.
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
  } catch {
    // Fallback extractive summary
  }

  const latest = detail.messages[detail.messages.length - 1]
  const sentences = (latest?.bodyText || detail.snippet)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 15)
  const dates = (latest?.bodyText || '').match(
    /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}:\d{2}\s*(?:am|pm)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2})\b/gi
  )

  return {
    gist: sentences.slice(0, 2).join(' ') || detail.snippet,
    actionItems: sentences.filter((s) => /\?|please|can you|let me know|review|confirm|send/i.test(s)).slice(0, 3),
    keyDates: Array.from(new Set((dates || []).map((d) => d.trim()))).slice(0, 4),
    providerLabel: 'Local Instant Summary (Configure Ollama / CLI in Settings › AI)'
  }
}
