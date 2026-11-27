import type { AISettings, ImplicitCalendarEvent } from '../../shared/types'
import { completeFastAI, extractJsonBlock, type AIPriority, type SecretReader } from './provider'

export interface ExtractImplicitEventInput {
  subject: string
  fromName?: string
  fromEmail?: string
  dateMs: number
  bodySnippet: string
  timezone?: string
  priority?: AIPriority
}

interface RawExtractedEvent {
  hasEvent?: boolean
  title?: string
  startIso?: string
  endIso?: string | null
  location?: string | null
  confidence?: number
  notes?: string | null
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  const ms = Date.parse(value)
  return Number.isFinite(ms)
}

function clamp01(n: unknown, fallback = 0): number {
  const num = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(num)) return fallback
  return Math.max(0, Math.min(1, num))
}

/**
 * Tier 1B conditional extractor: given an email's subject, date, and body snippet,
 * uses `completeFastAI()` with strict JSON output to extract a concrete implicit
 * calendar event (meeting, appointment, flight, reservation, deadline with time)
 * or returns `null` if no actionable event is present.
 */
export async function extractImplicitCalendarEvent(
  input: ExtractImplicitEventInput,
  settings: AISettings,
  secrets: SecretReader
): Promise<ImplicitCalendarEvent | null> {
  const referenceDate = new Date(input.dateMs)
  const tz = input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const senderLine =
    input.fromName || input.fromEmail
      ? `From: ${[input.fromName, input.fromEmail ? `<${input.fromEmail}>` : ''].filter(Boolean).join(' ')}\n`
      : ''

  const body = (input.bodySnippet || '').replace(/\s+/g, ' ').trim().slice(0, 2400)
  if (!body && !input.subject.trim()) return null

  const res = await completeFastAI(
    {
      jsonMode: true,
      maxTokens: 320,
      priority: input.priority ?? 'background',
      system: `You extract concrete scheduled events (meetings, calls, appointments, dinners, flights, reservations) mentioned in email text.
Resolve relative dates ("tomorrow at 2pm", "this Friday at 10am") using the email's Reference Date and Timezone.
If no specific date/time event is scheduled or proposed with a concrete time, return {"hasEvent": false}.
Return STRICT JSON ONLY with no commentary:
{
  "hasEvent": true,
  "title": "Short event title",
  "startIso": "YYYY-MM-DDTHH:mm:ssZ or with timezone offset",
  "endIso": "optional ISO-8601 end time or null",
  "location": "optional physical address, room, or video link or null",
  "confidence": 0.0 to 1.0,
  "notes": "optional brief context (1 sentence max) or null"
}`,
      prompt: `Reference Date: ${referenceDate.toISOString()} (Local: ${referenceDate.toString()}, Timezone: ${tz})
${senderLine}Subject: ${input.subject}

Email:
${body}`
    },
    settings,
    secrets
  )

  const parsed = extractJsonBlock<RawExtractedEvent>(res.text)
  if (!parsed || parsed.hasEvent === false) return null

  const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
  if (!title || !isValidIsoDate(parsed.startIso)) return null

  const confidence = clamp01(parsed.confidence, 0.75)
  if (confidence < 0.5) return null

  const event: ImplicitCalendarEvent = {
    title: title.slice(0, 140),
    startIso: parsed.startIso.trim(),
    confidence: Math.round(confidence * 100) / 100
  }

  if (isValidIsoDate(parsed.endIso)) {
    const startMs = Date.parse(event.startIso)
    const endMs = Date.parse(parsed.endIso)
    if (endMs > startMs) {
      event.endIso = parsed.endIso.trim()
    }
  }
  if (typeof parsed.location === 'string' && parsed.location.trim()) {
    event.location = parsed.location.trim().slice(0, 200)
  }
  if (typeof parsed.notes === 'string' && parsed.notes.trim()) {
    event.notes = parsed.notes.trim().slice(0, 280)
  }

  return event
}
