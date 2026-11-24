import React, { useCallback, useEffect, useRef, useState } from 'react'

const MIN_ZOOM = 0.75
const MAX_ZOOM = 1.6
const STEP = 0.05

function readSavedZoom(key: string): number {
  const raw = Number(localStorage.getItem(`everybox:zoom:${key}`))
  if (Number.isFinite(raw) && raw >= MIN_ZOOM && raw <= MAX_ZOOM) {
    return Math.round(raw * 100) / 100
  }
  return 1
}

export function usePaneZoom<T extends HTMLElement = HTMLDivElement>(paneKey: string) {
  const ref = useRef<T | null>(null)
  const [zoom, setZoom] = useState<number>(() => readSavedZoom(paneKey))
  const [showBadge, setShowBadge] = useState(false)
  const hideTimerRef = useRef<number | null>(null)

  const triggerBadge = useCallback(() => {
    setShowBadge(true)
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => setShowBadge(false), 1800)
  }, [])

  const resetZoom = useCallback(() => {
    setZoom(1)
    localStorage.setItem(`everybox:zoom:${paneKey}`, '1')
    triggerBadge()
  }, [paneKey, triggerBadge])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      e.stopPropagation()
      const delta = e.deltaY < 0 ? STEP : -STEP
      setZoom((prev) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((prev + delta) * 100) / 100))
        localStorage.setItem(`everybox:zoom:${paneKey}`, String(next))
        return next
      })
      triggerBadge()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    }
  }, [paneKey, triggerBadge])

  const zoomBadge = showBadge ? (
    <button
      type="button"
      onClick={resetZoom}
      className="absolute bottom-3 right-3 z-30 rounded-lg border px-2.5 py-1 text-[11px] font-medium shadow-lg transition hover:opacity-90"
      style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border-strong)',
        color: 'var(--text-primary)'
      }}
      title="Click to reset zoom to 100%"
    >
      {Math.round(zoom * 100)}%{zoom !== 1 ? ' · Reset' : ''}
    </button>
  ) : null

  return { ref, zoom, resetZoom, zoomBadge }
}
