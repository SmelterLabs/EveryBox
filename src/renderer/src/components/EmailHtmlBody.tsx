import React, { useEffect, useRef } from 'react'

export interface EmailBodyContextMenuInfo {
  x: number
  y: number
  selectedText: string
  linkUrl: string | null
}

export const EmailHtmlBody: React.FC<{
  html: string
  scale?: number
  fontFamily?: string
  className?: string
  onBodyContextMenu?: (info: EmailBodyContextMenuInfo) => void
}> = ({
  html,
  scale = 1,
  fontFamily = '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
  className = 'mt-4',
  onBodyContextMenu
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const shadowRef = useRef<ShadowRoot | null>(null)
  const contextMenuCbRef = useRef(onBodyContextMenu)
  contextMenuCbRef.current = onBodyContextMenu

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const shadow = shadowRef.current || host.shadowRoot || host.attachShadow({ mode: 'open' })
    shadowRef.current = shadow

    shadow.innerHTML = `
      <style>
        :host {
          display: block;
          color: var(--text-primary);
          font-family: ${fontFamily};
          font-size: 14px;
          line-height: 1.6;
          word-break: break-word;
          user-select: text;
        }
        a {
          color: var(--accent-text);
          text-decoration: underline;
        }
        p {
          margin: 0 0 0.75em;
        }
        img {
          max-width: 100%;
          height: auto;
          border-radius: 6px;
        }
      </style>
      <div class="email-root">${html}</div>
    `

    const onClick = (e: Event) => {
      const target = e.target as HTMLElement | null
      const link = target?.closest?.('a[href]') as HTMLAnchorElement | null
      if (link && /^https?:\/\//i.test(link.href)) {
        e.preventDefault()
        void window.glassmail.openExternal(link.href)
      }
    }
    const onContextMenu = (e: Event) => {
      const cb = contextMenuCbRef.current
      if (!cb) return
      const me = e as MouseEvent
      me.preventDefault()
      me.stopPropagation()
      const target = me.target as HTMLElement | null
      const link = target?.closest?.('a[href]') as HTMLAnchorElement | null
      const linkUrl = link && /^(https?:|mailto:)/i.test(link.href) ? link.href : null
      const shadowSel = (shadow as unknown as { getSelection?: () => Selection | null }).getSelection?.()
      const selectedText = (shadowSel?.toString() || window.getSelection()?.toString() || '').trim()
      cb({
        x: me.clientX,
        y: me.clientY,
        selectedText,
        linkUrl
      })
    }
    shadow.addEventListener('click', onClick)
    shadow.addEventListener('contextmenu', onContextMenu)
    return () => {
      shadow.removeEventListener('click', onClick)
      shadow.removeEventListener('contextmenu', onContextMenu)
    }
  }, [html, fontFamily])

  return <div ref={hostRef} className={className} style={{ zoom: scale }} />
}
