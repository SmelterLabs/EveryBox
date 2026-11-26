import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Search, X } from 'lucide-react'

export type ContextMenuItem =
  | { type: 'separator'; key?: string }
  | { type: 'header'; label: string; key?: string }
  | {
      type?: 'item'
      key?: string
      label: string
      icon?: React.ReactNode
      shortcut?: string
      danger?: boolean
      disabled?: boolean
      onClick?: () => void | Promise<void>
      children?: ContextMenuItem[]
    }

export interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

const MenuPanel: React.FC<{
  items: ContextMenuItem[]
  x: number
  y: number
  onClose: () => void
  parentRect?: DOMRect
}> = ({ items, x, y, onClose, parentRect }) => {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y })
  const [openSubIdx, setOpenSubIdx] = useState<number | null>(null)
  const [subAnchorRect, setSubAnchorRect] = useState<DOMRect | null>(null)
  const [filterText, setFilterText] = useState('')

  const actionItemCount = useMemo(
    () => items.filter((it) => it.type !== 'separator' && it.type !== 'header').length,
    [items]
  )
  const showFilter = Boolean(parentRect && actionItemCount > 10)

  const visibleItems = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (it) => it.type !== 'separator' && it.type !== 'header' && it.label.toLowerCase().includes(q)
    )
  }, [items, filterText])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    let left = x
    let top = y

    if (parentRect) {
      // Submenu: try right of parent, flip to left if it overflows viewport
      if (left + rect.width > window.innerWidth - pad) {
        left = Math.max(pad, parentRect.left - rect.width + 4)
      }
    } else if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad)
    }

    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad)
    }

    setPos({ left, top })
  }, [x, y, parentRect, visibleItems.length])

  const openSubItem =
    openSubIdx !== null && visibleItems[openSubIdx] && visibleItems[openSubIdx].type !== 'separator' && visibleItems[openSubIdx].type !== 'header'
      ? visibleItems[openSubIdx]
      : null

  return (
    <>
      <div
        ref={ref}
        role="menu"
        onContextMenu={(e) => e.preventDefault()}
        className="fixed z-[120] flex max-h-[calc(100vh-16px)] min-w-[205px] max-w-[290px] select-none flex-col overflow-hidden rounded-xl border shadow-2xl"
        style={{
          left: pos.left,
          top: pos.top,
          background: 'var(--bg-elevated)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text-primary)'
        }}
      >
        {showFilter && (
          <div className="shrink-0 border-b p-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
            <div
              className="flex items-center gap-1.5 rounded-lg border px-2 py-1"
              style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
            >
              <Search size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Filter folders…"
                className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
              />
              {filterText && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFilterText('')
                  }}
                  className="rounded p-0.5 hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {visibleItems.length === 0 ? (
            <div className="px-2.5 py-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              No matching folders
            </div>
          ) : (
            visibleItems.map((item, idx) => {
              if (item.type === 'separator') {
                return (
                  <div
                    key={item.key || `sep-${idx}`}
                    className="my-1 h-px"
                    style={{ background: 'var(--border-subtle)' }}
                  />
                )
              }
              if (item.type === 'header') {
                return (
                  <div
                    key={item.key || `hdr-${idx}`}
                    className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {item.label}
                  </div>
                )
              }

              const hasSub = Boolean(item.children && item.children.length > 0)
              const isSubOpen = openSubIdx === idx

              return (
                <div
                  key={item.key || `item-${idx}`}
                  onMouseEnter={(e) => {
                    if (hasSub && !item.disabled) {
                      setOpenSubIdx(idx)
                      setSubAnchorRect(e.currentTarget.getBoundingClientRect())
                    } else {
                      setOpenSubIdx(null)
                    }
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (item.disabled || hasSub) return
                      onClose()
                      void item.onClick?.()
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      color: item.danger ? 'var(--danger)' : 'var(--text-primary)',
                      background: isSubOpen ? 'var(--bg-hover)' : undefined
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {item.icon && (
                        <span
                          className="flex w-4 shrink-0 items-center justify-center"
                          style={{ color: item.danger ? 'var(--danger)' : 'var(--text-secondary)' }}
                        >
                          {item.icon}
                        </span>
                      )}
                      <span className="truncate">{item.label}</span>
                    </span>
                    {hasSub ? (
                      <ChevronRight size={13} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                    ) : item.shortcut ? (
                      <span className="shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {item.shortcut}
                      </span>
                    ) : null}
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      {openSubItem &&
        openSubItem.children &&
        subAnchorRect &&
        createPortal(
          <MenuPanel
            items={openSubItem.children}
            x={subAnchorRect.right - 2}
            y={subAnchorRect.top - 4}
            parentRect={subAnchorRect}
            onClose={onClose}
          />,
          document.body
        )}
    </>
  )
}

export const ContextMenu: React.FC<{
  menu: ContextMenuState | null
  onClose: () => void
}> = ({ menu, onClose }) => {
  useEffect(() => {
    if (!menu) return
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('[role="menu"]')) return
      onClose()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    const handleDismiss = () => onClose()

    window.addEventListener('mousedown', handleMouseDown, true)
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('blur', handleDismiss)
    window.addEventListener('resize', handleDismiss)
    return () => {
      window.removeEventListener('mousedown', handleMouseDown, true)
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('blur', handleDismiss)
      window.removeEventListener('resize', handleDismiss)
    }
  }, [menu, onClose])

  if (!menu || menu.items.length === 0) return null

  return createPortal(
    <MenuPanel items={menu.items} x={menu.x} y={menu.y} onClose={onClose} />,
    document.body
  )
}
