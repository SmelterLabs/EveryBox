export interface GmailRateLimitInfo {
  isRateLimit: boolean
  retryAfterMs?: number
  reason?: string
  formattedMessage?: string
}

const RATE_LIMIT_REASONS = new Set([
  'ratelimitexceeded',
  'userratelimitexceeded',
  'quotaexceeded',
  'dailylimitexceeded'
])

// Fallback exponential backoff schedule when Google omits a Retry-After timestamp
const FALLBACK_BACKOFF_MS = [
  2 * 60_000, // 2 min
  5 * 60_000, // 5 min
  15 * 60_000, // 15 min
  30 * 60_000 // 30 min
]

const MIN_RATE_LIMIT_WAIT_MS = 60_000
const MAX_RATE_LIMIT_WAIT_MS = 6 * 60 * 60_000
const RETRY_AFTER_BUFFER_MS = 15_000

function collectErrorStrings(err: unknown): string[] {
  const out: string[] = []
  if (!err || typeof err !== 'object') {
    if (err !== undefined && err !== null) out.push(String(err))
    return out
  }
  const e = err as Record<string, unknown>
  if (typeof e.message === 'string') out.push(e.message)
  if (Array.isArray(e.errors)) {
    for (const item of e.errors) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>
        if (typeof rec.message === 'string') out.push(rec.message)
        if (typeof rec.reason === 'string') out.push(rec.reason)
      }
    }
  }
  const resp = e.response as Record<string, unknown> | undefined
  const data = resp?.data as Record<string, unknown> | undefined
  const apiErr = data?.error as Record<string, unknown> | undefined
  if (typeof apiErr?.message === 'string') out.push(apiErr.message)
  if (Array.isArray(apiErr?.errors)) {
    for (const item of apiErr.errors) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>
        if (typeof rec.message === 'string') out.push(rec.message)
        if (typeof rec.reason === 'string') out.push(rec.reason)
      }
    }
  }
  return out
}

function getHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as Record<string, unknown>
  const resp = e.response as Record<string, unknown> | undefined
  const candidates = [e.status, e.code, resp?.status]
  for (const c of candidates) {
    const num = Number(c)
    if (Number.isFinite(num) && num >= 100 && num <= 599) return num
  }
  return undefined
}

function getRetryAfterHeader(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as Record<string, unknown>
  const resp = e.response as Record<string, unknown> | undefined
  const headers = resp?.headers as Record<string, unknown> | { get?: (k: string) => string | null } | undefined
  if (!headers) return undefined
  if (typeof (headers as { get?: unknown }).get === 'function') {
    const val = (headers as { get: (k: string) => string | null }).get('retry-after')
    if (val) return val
  }
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    if (k.toLowerCase() === 'retry-after' && typeof v === 'string' && v.trim()) {
      return v.trim()
    }
  }
  return undefined
}

function getErrorReasons(err: unknown): string[] {
  const reasons: string[] = []
  if (!err || typeof err !== 'object') return reasons
  const e = err as Record<string, unknown>
  const collect = (arr: unknown) => {
    if (!Array.isArray(arr)) return
    for (const item of arr) {
      if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).reason === 'string') {
        reasons.push(String((item as Record<string, unknown>).reason).toLowerCase())
      }
    }
  }
  collect(e.errors)
  const resp = e.response as Record<string, unknown> | undefined
  const data = resp?.data as Record<string, unknown> | undefined
  const apiErr = data?.error as Record<string, unknown> | undefined
  collect(apiErr?.errors)
  return reasons
}

export function isGmailNotFoundError(err: unknown): boolean {
  const status = getHttpStatus(err)
  if (status === 404) return true
  const texts = collectErrorStrings(err).join(' ').toLowerCase()
  return texts.includes('not found') && texts.includes('404')
}

export function formatRetryTime(targetMs: number): string {
  try {
    return new Date(targetMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return new Date(targetMs).toISOString()
  }
}

export function parseGmailRateLimit(
  err: unknown,
  nowMs = Date.now(),
  consecutiveCount = 1
): GmailRateLimitInfo {
  const status = getHttpStatus(err)
  const reasons = getErrorReasons(err)
  const texts = collectErrorStrings(err)
  const joined = texts.join(' ')
  const lower = joined.toLowerCase()

  const hasRateReason = reasons.some((r) => RATE_LIMIT_REASONS.has(r))
  const hasRateText =
    lower.includes('user-rate limit exceeded') ||
    lower.includes('rate limit exceeded') ||
    lower.includes('too many requests') ||
    lower.includes('quota exceeded')

  const isRateLimit = status === 429 || (status === 403 && (hasRateReason || hasRateText)) || hasRateReason || hasRateText
  if (!isRateLimit) {
    return { isRateLimit: false }
  }

  let retryAfterMs: number | undefined

  // 1. Parse explicit Google ISO timestamp: "Retry after 2026-11-25T22:34:00.531Z"
  const isoMatch = joined.match(/retry\s+after\s+(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2}))/i)
  if (isoMatch) {
    const parsed = Date.parse(isoMatch[1])
    if (Number.isFinite(parsed) && parsed > nowMs) {
      retryAfterMs = parsed + RETRY_AFTER_BUFFER_MS
    }
  }

  // 2. Parse HTTP Retry-After header (seconds or HTTP-date)
  if (retryAfterMs === undefined) {
    const hdr = getRetryAfterHeader(err)
    if (hdr) {
      if (/^\d+$/.test(hdr)) {
        const secs = Number(hdr)
        if (Number.isFinite(secs) && secs > 0) {
          retryAfterMs = nowMs + secs * 1000 + RETRY_AFTER_BUFFER_MS
        }
      } else {
        const parsed = Date.parse(hdr)
        if (Number.isFinite(parsed) && parsed > nowMs) {
          retryAfterMs = parsed + RETRY_AFTER_BUFFER_MS
        }
      }
    }
  }

  // 3. Exponential backoff fallback when no explicit timestamp is returned
  if (retryAfterMs === undefined) {
    const idx = Math.min(Math.max(consecutiveCount - 1, 0), FALLBACK_BACKOFF_MS.length - 1)
    retryAfterMs = nowMs + FALLBACK_BACKOFF_MS[idx]
  }

  // Clamp to sensible bounds
  retryAfterMs = Math.max(nowMs + MIN_RATE_LIMIT_WAIT_MS, Math.min(nowMs + MAX_RATE_LIMIT_WAIT_MS, retryAfterMs))

  const reason = reasons[0] || (status === 429 ? 'rateLimitExceeded' : 'userRateLimitExceeded')
  const formattedMessage = `Gmail rate-limited — paused until ${formatRetryTime(retryAfterMs)}`

  return {
    isRateLimit: true,
    retryAfterMs,
    reason,
    formattedMessage
  }
}

export function computeGenericErrorBackoffMs(consecutiveCount: number, nowMs = Date.now()): number {
  const schedule = [60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000]
  const idx = Math.min(Math.max(consecutiveCount - 1, 0), schedule.length - 1)
  return nowMs + schedule[idx]
}
