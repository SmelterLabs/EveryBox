import type { ParsedSearchQuery } from '../../shared/types'

export function parseNaturalLanguageSearch(raw: string): ParsedSearchQuery {
  let working = raw.trim()
  const pills: ParsedSearchQuery['pills'] = []
  let from: string | undefined
  let to: string | undefined
  let hasAttachment: boolean | undefined
  let attachmentType: string | undefined
  let afterDate: number | undefined
  let beforeDate: number | undefined
  let folder: string | undefined
  let isUnread: boolean | undefined

  const now = Date.now()
  const dayMs = 86400_000

  // 1. Explicit operators: from:, to:, in:, has:attachment, is:unread
  const fromOp = working.match(/\bfrom:([^\s]+)/i)
  if (fromOp) {
    from = fromOp[1]
    pills.push({ label: `From: ${from}`, key: 'from', value: from })
    working = working.replace(fromOp[0], '')
  }

  const inOp = working.match(/\bin:([^\s]+)/i)
  if (inOp) {
    folder = inOp[1]
    pills.push({ label: `In: ${folder}`, key: 'folder', value: folder })
    working = working.replace(inOp[0], '')
  }

  if (/\bhas:attachment\b/i.test(working)) {
    hasAttachment = true
    pills.push({ label: 'Has attachment', key: 'hasAttachment', value: 'true' })
    working = working.replace(/\bhas:attachment\b/gi, '')
  }

  if (/\b(?:is:unread|unread)\b/i.test(working)) {
    isUnread = true
    pills.push({ label: 'Unread', key: 'isUnread', value: 'true' })
    working = working.replace(/\b(?:is:unread|unread)\b/gi, '')
  }

  // 2. Natural-language attachment types ("pdf from maya last week")
  const fileTypeMatch = working.match(/\b(pdf|docx?|xlsx?|csv|png|jpg|zip|attachment|attachments)\b/i)
  if (fileTypeMatch) {
    hasAttachment = true
    const t = fileTypeMatch[1].toLowerCase()
    if (!t.startsWith('attachment')) {
      attachmentType = t.replace(/x$/, '')
      pills.push({ label: `Type: ${t.toUpperCase()}`, key: 'attachmentType', value: attachmentType })
    } else if (!pills.some((p) => p.key === 'hasAttachment')) {
      pills.push({ label: 'Has attachment', key: 'hasAttachment', value: 'true' })
    }
    working = working.replace(fileTypeMatch[0], '')
  }

  // 3. Natural-language sender ("from maya")
  if (!from) {
    const nlFrom = working.match(/\bfrom\s+([a-zA-Z0-9._@-]+)/i)
    if (nlFrom) {
      from = nlFrom[1]
      pills.push({ label: `From: ${from}`, key: 'from', value: from })
      working = working.replace(nlFrom[0], '')
    }
  }

  // 4. Natural-language dates ("today", "yesterday", "last week", "this week", "last month")
  if (/\btoday\b/i.test(working)) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    afterDate = start.getTime()
    pills.push({ label: 'Today', key: 'date', value: 'today' })
    working = working.replace(/\btoday\b/gi, '')
  } else if (/\byesterday\b/i.test(working)) {
    const start = new Date(now - dayMs)
    start.setHours(0, 0, 0, 0)
    afterDate = start.getTime()
    beforeDate = start.getTime() + dayMs
    pills.push({ label: 'Yesterday', key: 'date', value: 'yesterday' })
    working = working.replace(/\byesterday\b/gi, '')
  } else if (/\b(?:last week|past week|this week)\b/i.test(working)) {
    afterDate = now - 7 * dayMs
    pills.push({ label: 'Last 7 days', key: 'date', value: 'last_week' })
    working = working.replace(/\b(?:last week|past week|this week)\b/gi, '')
  } else if (/\b(?:last month|past month|this month)\b/i.test(working)) {
    afterDate = now - 30 * dayMs
    pills.push({ label: 'Last 30 days', key: 'date', value: 'last_month' })
    working = working.replace(/\b(?:last month|past month|this month)\b/gi, '')
  }

  // Clean leftover filler words if pills were extracted
  const textQuery = pills.length > 0 ? working.replace(/\b(what|i|sent|to|emails?|messages?|find|show|me|the|a|an)\b/gi, ' ').replace(/\s+/g, ' ').trim() : working

  return {
    raw,
    textQuery,
    from,
    to,
    hasAttachment,
    attachmentType,
    afterDate,
    beforeDate,
    folder,
    isUnread,
    pills
  }
}
