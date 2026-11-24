import type { ShortcutActionId } from '../../../shared/types'
import { isMac } from './platform'

export interface ShortcutDefinition {
  id: ShortcutActionId
  label: string
  category: 'Mail Actions' | 'Navigation' | 'App & Search'
  defaultWin: string
  defaultMac: string
  allowInInput?: boolean
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: 'delete',
    label: 'Delete email(s)',
    category: 'Mail Actions',
    defaultWin: 'Delete',
    defaultMac: 'Backspace'
  },
  {
    id: 'archive',
    label: 'Archive email(s)',
    category: 'Mail Actions',
    defaultWin: 'E',
    defaultMac: 'E'
  },
  {
    id: 'compose',
    label: 'New message',
    category: 'Mail Actions',
    defaultWin: 'Mod+N',
    defaultMac: 'Mod+N',
    allowInInput: true
  },
  {
    id: 'reply',
    label: 'Reply',
    category: 'Mail Actions',
    defaultWin: 'Mod+R',
    defaultMac: 'Mod+R'
  },
  {
    id: 'replyAll',
    label: 'Reply all',
    category: 'Mail Actions',
    defaultWin: 'Mod+Shift+R',
    defaultMac: 'Mod+Shift+R'
  },
  {
    id: 'forward',
    label: 'Forward',
    category: 'Mail Actions',
    defaultWin: 'Mod+Shift+F',
    defaultMac: 'Mod+Shift+F'
  },
  {
    id: 'star',
    label: 'Star / Unstar',
    category: 'Mail Actions',
    defaultWin: 'S',
    defaultMac: 'S'
  },
  {
    id: 'toggleRead',
    label: 'Mark read / unread',
    category: 'Mail Actions',
    defaultWin: 'Mod+U',
    defaultMac: 'Mod+U'
  },
  {
    id: 'snooze',
    label: 'Snooze until tomorrow',
    category: 'Mail Actions',
    defaultWin: 'H',
    defaultMac: 'H'
  },
  {
    id: 'undo',
    label: 'Undo last delete / send / archive',
    category: 'Mail Actions',
    defaultWin: 'Mod+Z',
    defaultMac: 'Mod+Z'
  },
  {
    id: 'nextThread',
    label: 'Next email',
    category: 'Navigation',
    defaultWin: 'ArrowDown',
    defaultMac: 'ArrowDown'
  },
  {
    id: 'prevThread',
    label: 'Previous email',
    category: 'Navigation',
    defaultWin: 'ArrowUp',
    defaultMac: 'ArrowUp'
  },
  {
    id: 'inboxHome',
    label: 'Back to Inbox Home',
    category: 'Navigation',
    defaultWin: 'Alt+Home',
    defaultMac: 'Mod+Shift+H'
  },
  {
    id: 'search',
    label: 'Focus universal search',
    category: 'App & Search',
    defaultWin: 'Mod+F',
    defaultMac: 'Mod+F',
    allowInInput: true
  },
  {
    id: 'commandPalette',
    label: 'Command Palette',
    category: 'App & Search',
    defaultWin: 'Mod+K',
    defaultMac: 'Mod+K',
    allowInInput: true
  },
  {
    id: 'settings',
    label: 'Open Settings',
    category: 'App & Search',
    defaultWin: 'Mod+,',
    defaultMac: 'Mod+,',
    allowInInput: true
  }
]

const DEF_BY_ID = new Map(SHORTCUT_DEFINITIONS.map((d) => [d.id, d]))

export function getDefaultShortcut(id: ShortcutActionId): string {
  const def = DEF_BY_ID.get(id)
  if (!def) return ''
  return isMac ? def.defaultMac : def.defaultWin
}

export function getEffectiveShortcut(
  id: ShortcutActionId,
  overrides?: Partial<Record<ShortcutActionId, string>>
): string {
  const custom = overrides?.[id]?.trim()
  return custom || getDefaultShortcut(id)
}

function normalizeKeyName(key: string): string | null {
  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return null
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

export function eventToCombo(e: KeyboardEvent): string | null {
  const key = normalizeKeyName(e.key)
  if (!key) return null
  const parts: string[] = []
  const mod = isMac ? e.metaKey : e.ctrlKey
  if (mod) parts.push('Mod')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey && key !== 'Shift') parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

export function matchesCombo(e: KeyboardEvent, combo: string): boolean {
  if (!combo) return false
  const parts = combo.split('+').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return false

  const targetKey = parts[parts.length - 1]
  const needMod = parts.includes('Mod')
  const needAlt = parts.includes('Alt')
  const needShift = parts.includes('Shift')

  const hasMod = isMac ? e.metaKey : e.ctrlKey
  const hasOtherMod = isMac ? e.ctrlKey : e.metaKey
  if (hasOtherMod) return false
  if (hasMod !== needMod) return false
  if (e.altKey !== needAlt) return false
  if (e.shiftKey !== needShift) return false

  const pressed = normalizeKeyName(e.key)
  if (!pressed) return false
  return pressed.toLowerCase() === targetKey.toLowerCase()
}

export function formatComboForDisplay(combo: string): string {
  if (!combo) return 'Unassigned'
  const parts = combo.split('+')
  const mapped = parts.map((p) => {
    if (p === 'Mod') return isMac ? '⌘' : 'Ctrl'
    if (p === 'Alt') return isMac ? '⌥' : 'Alt'
    if (p === 'Shift') return isMac ? '⇧' : 'Shift'
    if (p === 'Delete') return isMac ? '⌦' : 'Del'
    if (p === 'Backspace') return isMac ? '⌫' : 'Backspace'
    if (p === 'ArrowDown') return '↓'
    if (p === 'ArrowUp') return '↑'
    if (p === 'ArrowLeft') return '←'
    if (p === 'ArrowRight') return '→'
    return p
  })
  return isMac ? mapped.join('') : mapped.join('+')
}
