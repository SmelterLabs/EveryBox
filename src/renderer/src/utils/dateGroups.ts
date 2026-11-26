import type { ThreadSummary } from '../../../shared/types'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_MS = 86_400_000

/**
 * Classic Outlook style day & date group bucket:
 * Today, Yesterday, <Weekday> (earlier in current Sun-Sat week),
 * Last Week, Two Weeks Ago, Three Weeks Ago, Last Month, Older.
 */
export function getDateGroupLabel(ms: number, nowDate: Date = new Date()): string {
  const d = new Date(ms)
  const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime()
  const msgDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((todayStart - msgDayStart) / DAY_MS)

  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'

  const thisWeekStart = todayStart - nowDate.getDay() * DAY_MS
  const msgWeekStart = msgDayStart - d.getDay() * DAY_MS
  const diffWeeks = Math.round((thisWeekStart - msgWeekStart) / (7 * DAY_MS))

  if (diffWeeks === 0) return WEEKDAYS[d.getDay()]
  if (diffWeeks === 1) return 'Last Week'
  if (diffWeeks === 2) return 'Two Weeks Ago'
  if (diffWeeks === 3) return 'Three Weeks Ago'

  const prevMonthYear = nowDate.getMonth() === 0 ? nowDate.getFullYear() - 1 : nowDate.getFullYear()
  const prevMonth = nowDate.getMonth() === 0 ? 11 : nowDate.getMonth() - 1
  if (d.getFullYear() === prevMonthYear && d.getMonth() === prevMonth) {
    return 'Last Month'
  }

  return 'Older'
}

export function groupThreadsByDate(threads: ThreadSummary[]): [string, ThreadSummary[]][] {
  const now = new Date()
  const map = new Map<string, ThreadSummary[]>()
  for (const t of threads) {
    const label = getDateGroupLabel(t.lastMessageAt, now)
    const list = map.get(label)
    if (list) list.push(t)
    else map.set(label, [t])
  }
  return Array.from(map.entries())
}
