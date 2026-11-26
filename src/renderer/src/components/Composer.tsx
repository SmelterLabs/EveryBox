import React, { useCallback, useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import {
  AlertCircle,
  Bold,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Italic,
  Link2,
  List,
  Maximize2,
  Minimize2,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { EmailHtmlBody } from './EmailHtmlBody'
import { AccountBadge } from './AccountIcon'
import { formatQuotedReplyHtml, formatQuotedReplyText } from '../utils/replyHelper'
import { modKeyPrefix } from '../utils/platform'
import type { ComposerAttachment } from '../../../shared/types'

const COMPOSER_POS_KEY = 'everybox:composerPos'
const AUTOSAVE_PREFIX = 'everybox:composerDraft:'

interface ComposerPos {
  x: number
  y: number
}

interface SavedDraftSnapshot {
  accountId: string
  toChips: string[]
  ccChips: string[]
  bccChips: string[]
  subject: string
  bodyHtml: string
  bodyText: string
  attachments: ComposerAttachment[]
  savedAt: number
}

function loadSavedComposerPos(): ComposerPos | null {
  try {
    const raw = localStorage.getItem(COMPOSER_POS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ComposerPos>
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      Number.isFinite(parsed.x) &&
      Number.isFinite(parsed.y)
    ) {
      return { x: parsed.x, y: parsed.y }
    }
  } catch {
    // ignore malformed storage
  }
  return null
}

function clampComposerPos(pos: ComposerPos, width: number, height: number): ComposerPos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const minVisibleX = Math.min(220, width)
  const x = Math.min(Math.max(12 - (width - minVisibleX), pos.x), Math.max(12, vw - minVisibleX))
  const y = Math.min(Math.max(12, pos.y), Math.max(12, vh - Math.min(84, height)))
  return { x: Math.round(x), y: Math.round(y) }
}

function parseAddressList(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function mergeRecipients(chips: string[], pendingInput: string): string[] {
  const extra = parseAddressList(pendingInput)
  return Array.from(new Set([...chips, ...extra]))
}

function extractEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/)
  return (m ? m[1] : raw).trim().toLowerCase()
}

function isValidEmailAddress(raw: string): boolean {
  const email = extractEmail(raw)
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function plainTextToRichHtml(text: string): string {
  if (!text) return ''
  const looksLikeMarkdown = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|^[-*]\s)/m.test(text)
  if (looksLikeMarkdown) {
    return String(marked.parse(text)).trim()
  }
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? `<p>${escapeHtmlText(line)}</p>` : '<p><br></p>'))
    .join('')
}

function sanitizeRichHtml(rawHtml: string): string {
  if (!rawHtml) return ''
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html')
  const allowedTags = new Set(['P', 'BR', 'DIV', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'A', 'SPAN', 'BLOCKQUOTE'])

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtmlText(node.textContent || '')
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as HTMLElement
    const tag = el.tagName.toUpperCase()
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'META' || tag === 'LINK') return ''
    const children = Array.from(el.childNodes).map(walk).join('')
    if (!allowedTags.has(tag)) return children
    if (tag === 'BR') return '<br>'
    if (tag === 'A') {
      const href = el.getAttribute('href') || ''
      const safeHref = /^(https?:|mailto:)/i.test(href) ? escapeHtmlText(href) : '#'
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${children}</a>`
    }
    const lower = tag === 'SPAN' ? '' : tag.toLowerCase()
    if (!lower) return children
    return `<${lower}>${children}</${lower}>`
  }

  return Array.from(doc.body.childNodes).map(walk).join('')
}

function extractPlainTextFromHtml(html: string): string {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.innerText || div.textContent || '').replace(/\u00a0/g, ' ').trimEnd()
}

function loadAutosave(key: string): SavedDraftSnapshot | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedDraftSnapshot>
    if (typeof parsed.savedAt !== 'number') return null
    return {
      accountId: parsed.accountId || '',
      toChips: Array.isArray(parsed.toChips) ? parsed.toChips : [],
      ccChips: Array.isArray(parsed.ccChips) ? parsed.ccChips : [],
      bccChips: Array.isArray(parsed.bccChips) ? parsed.bccChips : [],
      subject: parsed.subject || '',
      bodyHtml: parsed.bodyHtml || '',
      bodyText: parsed.bodyText || '',
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      savedAt: parsed.savedAt
    }
  } catch {
    return null
  }
}

function persistAutosave(key: string, snap: SavedDraftSnapshot): void {
  try {
    localStorage.setItem(AUTOSAVE_PREFIX + key, JSON.stringify(snap))
  } catch {
    // ignore storage quota errors
  }
}

function clearAutosave(key: string): void {
  try {
    localStorage.removeItem(AUTOSAVE_PREFIX + key)
  } catch {
    // ignore
  }
}

interface RecipientChipInputProps {
  label: string
  chips: string[]
  input: string
  placeholder?: string
  onChipsChange: (next: string[]) => void
  onInputChange: (next: string) => void
  rightSlot?: React.ReactNode
}

const RecipientChipInput: React.FC<RecipientChipInputProps> = ({
  label,
  chips,
  input,
  placeholder,
  onChipsChange,
  onInputChange,
  rightSlot
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const commit = (raw: string) => {
    const parsed = parseAddressList(raw)
    if (parsed.length === 0) return
    onChipsChange(Array.from(new Set([...chips, ...parsed])))
    onInputChange('')
  }

  return (
    <div
      className="flex min-h-[38px] items-center gap-2.5 px-6 py-1.5"
      onClick={() => inputRef.current?.focus()}
    >
      <span className="w-9 shrink-0 text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {chips.map((addr) => {
          const valid = isValidEmailAddress(addr)
          return (
            <span
              key={addr}
              className="inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-medium"
              style={{
                background: valid ? 'var(--bg-main)' : 'rgba(209, 52, 56, 0.10)',
                borderColor: valid ? 'var(--border-subtle)' : 'var(--danger)',
                color: valid ? 'var(--text-primary)' : 'var(--danger)'
              }}
              title={valid ? addr : `Invalid email address: "${addr}" — click × to remove`}
            >
              {!valid && <AlertCircle size={11} className="shrink-0" />}
              <span className="truncate">{addr}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onChipsChange(chips.filter((c) => c !== addr))
                }}
                className="ml-0.5 rounded-full p-0.5 transition hover:bg-[var(--bg-hover)]"
                style={{ color: valid ? 'var(--text-muted)' : 'var(--danger)' }}
                aria-label={`Remove ${addr}`}
              >
                <X size={11} />
              </button>
            </span>
          )
        })}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            const v = e.target.value
            if (v.includes(',') || v.includes(';')) {
              commit(v)
            } else {
              onInputChange(v)
            }
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === 'Tab') && input.trim()) {
              e.preventDefault()
              commit(input)
            } else if (e.key === 'Backspace' && !input && chips.length > 0) {
              onChipsChange(chips.slice(0, -1))
            }
          }}
          onBlur={() => {
            if (input.trim()) commit(input)
          }}
          placeholder={chips.length === 0 ? placeholder : ''}
          aria-label={`${label} recipients`}
          className="min-w-[140px] flex-1 bg-transparent py-0.5 text-[13px] outline-none placeholder:text-[var(--text-muted)]"
        />
      </div>
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
  )
}

export const Composer: React.FC = () => {
  const {
    composer,
    accounts,
    snippets,
    settings,
    saveSettings,
    openComposer,
    closeComposer,
    showToast,
    refreshAll,
    queueSendWithUndo
  } = useAppStore()

  const [accountId, setAccountId] = useState(composer.accountId)
  const [toChips, setToChips] = useState<string[]>([])
  const [toInput, setToInput] = useState('')
  const [ccChips, setCcChips] = useState<string[]>([])
  const [ccInput, setCcInput] = useState('')
  const [bccChips, setBccChips] = useState<string[]>([])
  const [bccInput, setBccInput] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState(composer.subject)
  const [bodyHtml, setBodyHtml] = useState('')
  const [bodyText, setBodyText] = useState(composer.body)
  const [attachments, setAttachments] = useState<ComposerAttachment[]>(composer.attachments || [])
  const [expanded, setExpanded] = useState(false)

  // Live autosave status
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'restored'>('idle')
  const hydratedRef = useRef(false)
  const autosaveTimerRef = useRef<number | null>(null)

  // Rich-text editor + active formatting indicators + inline link popover
  const editorRef = useRef<HTMLDivElement | null>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [fmtActive, setFmtActive] = useState({ bold: false, italic: false, list: false })
  const [showLinkPopover, setShowLinkPopover] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const [linkLabel, setLinkLabel] = useState('')

  // Draggable window position (persisted in localStorage)
  const [position, setPosition] = useState<ComposerPos | null>(() => loadSavedComposerPos())
  const [isDragging, setIsDragging] = useState(false)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const didDragRef = useRef(false)

  // Dropdowns / popovers
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [showSnippets, setShowSnippets] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)

  // AI Writer bar
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiProviderLabel, setAiProviderLabel] = useState<string | null>(null)

  // Quoted original message preview (for replies)
  const [showQuotedPreview, setShowQuotedPreview] = useState(true)
  const [includeQuotedInSend, setIncludeQuotedInSend] = useState(true)

  const autosaveKey = composer.replyToThreadId
    ? `reply:${composer.replyToThreadId}`
    : composer.draftThreadId || composer.draftRemoteId
      ? `draft:${composer.draftThreadId || composer.draftRemoteId}`
      : 'new'

  const setEditorHtml = useCallback((html: string) => {
    const clean = sanitizeRichHtml(html)
    setBodyHtml(clean)
    setBodyText(extractPlainTextFromHtml(clean))
    if (editorRef.current && editorRef.current.innerHTML !== clean) {
      editorRef.current.innerHTML = clean
    }
  }, [])

  // Hydrate composer when opened (restoring unsaved autosave if present)
  useEffect(() => {
    if (!composer.open) {
      hydratedRef.current = false
      return
    }
    hydratedRef.current = false

    const hasIncomingPayload = Boolean(
      composer.body.trim() ||
        composer.bodyHtml?.trim() ||
        composer.draftThreadId ||
        composer.draftRemoteId ||
        (composer.attachments && composer.attachments.length > 0)
    )
    const saved = loadAutosave(autosaveKey)
    const shouldRestoreAutosave = Boolean(
      saved &&
        !hasIncomingPayload &&
        (saved.bodyText.trim() ||
          saved.subject.trim() ||
          saved.attachments.length > 0 ||
          (composer.mode === 'new' && saved.toChips.length > 0))
    )

    let initAccountId = composer.accountId || accounts[0]?.id || ''
    let initTo = parseAddressList(composer.to)
    let initCc = parseAddressList(composer.cc)
    let initBcc = parseAddressList(composer.bcc)
    let initSubject = composer.subject
    let initHtml = composer.bodyHtml ? sanitizeRichHtml(composer.bodyHtml) : plainTextToRichHtml(composer.body)
    let initAttachments = composer.attachments || []

    if (shouldRestoreAutosave && saved) {
      if (saved.accountId && accounts.some((a) => a.id === saved.accountId)) {
        initAccountId = saved.accountId
      }
      if (saved.toChips.length > 0 && initTo.length === 0) initTo = saved.toChips
      if (saved.ccChips.length > 0 && initCc.length === 0) initCc = saved.ccChips
      if (saved.bccChips.length > 0 && initBcc.length === 0) initBcc = saved.bccChips
      if (saved.subject && !initSubject) initSubject = saved.subject
      initHtml = saved.bodyHtml || plainTextToRichHtml(saved.bodyText)
      if (saved.attachments.length > 0) initAttachments = saved.attachments
      setSaveStatus('restored')
    } else {
      setSaveStatus('idle')
    }

    setAccountId(initAccountId)
    setToChips(initTo)
    setToInput('')
    setCcChips(initCc)
    setCcInput('')
    setBccChips(initBcc)
    setBccInput('')
    setShowCc(initCc.length > 0)
    setShowBcc(initBcc.length > 0)
    setSubject(initSubject)
    setBodyHtml(initHtml)
    setBodyText(extractPlainTextFromHtml(initHtml))
    setAttachments(initAttachments)
    setAiPrompt('')
    setAiProviderLabel(null)
    setShowAccountMenu(false)
    setShowSnippets(false)
    setShowSchedule(false)
    setShowLinkPopover(false)
    setShowQuotedPreview(true)
    setIncludeQuotedInSend(true)

    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = initHtml
      }
      hydratedRef.current = true
      if (composer.mode === 'reply' || composer.mode === 'replyAll') {
        editorRef.current?.focus()
      }
    })
  }, [
    composer.open,
    composer.mode,
    composer.to,
    composer.cc,
    composer.bcc,
    composer.subject,
    composer.body,
    composer.bodyHtml,
    composer.accountId,
    composer.quotedMessage,
    autosaveKey
  ])

  const hasQuoted = Boolean(composer.quotedMessage)
  const isDirty = Boolean(
    bodyText.trim() ||
      attachments.length > 0 ||
      (composer.mode === 'new' && (subject.trim() || toChips.length > 0 || toInput.trim()))
  )

  // Continuous debounced autosave (never loses typed text until explicitly deleted or sent)
  useEffect(() => {
    if (!composer.open || !hydratedRef.current) return
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    if (!isDirty) return

    setSaveStatus('saving')
    autosaveTimerRef.current = window.setTimeout(() => {
      persistAutosave(autosaveKey, {
        accountId,
        toChips: mergeRecipients(toChips, toInput),
        ccChips: mergeRecipients(ccChips, ccInput),
        bccChips: mergeRecipients(bccChips, bccInput),
        subject,
        bodyHtml,
        bodyText,
        attachments,
        savedAt: Date.now()
      })
      setSaveStatus('saved')
      autosaveTimerRef.current = null
    }, 650)

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [
    composer.open,
    isDirty,
    autosaveKey,
    accountId,
    toChips,
    toInput,
    ccChips,
    ccInput,
    bccChips,
    bccInput,
    subject,
    bodyHtml,
    bodyText,
    attachments
  ])

  // Track active rich-text formatting states under the caret
  const refreshFormatState = useCallback(() => {
    try {
      setFmtActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        list: document.queryCommandState('insertUnorderedList')
      })
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!composer.open) return
    const onSelChange = () => {
      const sel = window.getSelection()
      if (sel && editorRef.current && sel.anchorNode && editorRef.current.contains(sel.anchorNode)) {
        refreshFormatState()
      }
    }
    document.addEventListener('selectionchange', onSelChange)
    return () => document.removeEventListener('selectionchange', onSelChange)
  }, [composer.open, refreshFormatState])

  // Keep saved composer position clamped inside the viewport on open and window resize
  useEffect(() => {
    if (!composer.open || !position || expanded) return
    const clampCurrent = () => {
      const rect = dialogRef.current?.getBoundingClientRect()
      const w = rect?.width || (hasQuoted ? 780 : 720)
      const h = rect?.height || (hasQuoted ? 680 : 580)
      setPosition((prev) => {
        if (!prev) return prev
        const clamped = clampComposerPos(prev, w, h)
        return clamped.x === prev.x && clamped.y === prev.y ? prev : clamped
      })
    }
    requestAnimationFrame(clampCurrent)
    window.addEventListener('resize', clampCurrent)
    return () => window.removeEventListener('resize', clampCurrent)
  }, [composer.open, expanded, hasQuoted])

  const activeAccount = accounts.find((a) => a.id === accountId) || accounts[0]

  const buildHtml = () => {
    const contentHtml = sanitizeRichHtml(bodyHtml) || plainTextToRichHtml(bodyText)
    const sig = activeAccount?.signatureHtml ? `<br/>${activeAccount.signatureHtml}` : ''
    const quoted =
      includeQuotedInSend && composer.quotedMessage ? formatQuotedReplyHtml(composer.quotedMessage) : ''
    return `${contentHtml}${sig}${quoted}`
  }

  const buildPlainText = () => {
    const quoted =
      includeQuotedInSend && composer.quotedMessage ? formatQuotedReplyText(composer.quotedMessage) : ''
    return `${bodyText}${quoted}`
  }

  const makeDraftRestore = () => ({
    mode: composer.mode,
    accountId: activeAccount?.id || accountId,
    to: mergeRecipients(toChips, toInput).join(', '),
    cc: mergeRecipients(ccChips, ccInput).join(', '),
    bcc: mergeRecipients(bccChips, bccInput).join(', '),
    subject,
    body: bodyText,
    bodyHtml,
    replyToThreadId: composer.replyToThreadId,
    replyToMessageId: composer.replyToMessageId,
    draftThreadId: composer.draftThreadId,
    draftRemoteId: composer.draftRemoteId,
    attachments,
    quotedMessage: composer.quotedMessage
  })

  // Safe close (Backdrop / X / Esc): auto-saves dirty draft so text is NEVER lost
  const handleSafeClose = async () => {
    if (!isDirty) {
      closeComposer()
      return
    }
    const mergedTo = mergeRecipients(toChips, toInput)
    const mergedCc = mergeRecipients(ccChips, ccInput)
    const mergedBcc = mergeRecipients(bccChips, bccInput)
    const snapshot: SavedDraftSnapshot = {
      accountId: activeAccount?.id || accountId,
      toChips: mergedTo,
      ccChips: mergedCc,
      bccChips: mergedBcc,
      subject,
      bodyHtml,
      bodyText,
      attachments,
      savedAt: Date.now()
    }
    persistAutosave(autosaveKey, snapshot)
    const restoreState = makeDraftRestore()
    closeComposer()

    // Also save to Drafts folder in background
    void window.glassmail
      .saveDraft({
        accountId: activeAccount?.id || accountId,
        to: mergedTo,
        cc: mergedCc,
        bcc: mergedBcc,
        subject: subject || '(No subject)',
        bodyHtml: buildHtml(),
        bodyText: buildPlainText(),
        replyToMessageId: composer.replyToMessageId,
        threadId: composer.replyToThreadId,
        attachments
      })
      .then((res) => {
        if (res.ok) void refreshAll()
      })

    showToast(
      'Draft saved',
      async () => {
        openComposer(restoreState)
      },
      4500
    )
  }

  // Explicit Discard: clears local autosave and offers Undo restore
  const handleDiscardDraft = () => {
    const restoreState = makeDraftRestore()
    const hadContent = isDirty
    clearAutosave(autosaveKey)
    closeComposer()
    if (hadContent) {
      showToast(
        'Draft discarded',
        async () => {
          openComposer(restoreState)
        },
        6000
      )
    }
  }

  const validateRecipientsBeforeSend = (toList: string[], ccList: string[], bccList: string[]): boolean => {
    if (toList.length === 0) {
      showToast('Please enter at least one recipient.')
      return false
    }
    const invalid = [...toList, ...ccList, ...bccList].filter((addr) => !isValidEmailAddress(addr))
    if (invalid.length > 0) {
      showToast(`Invalid email address: ${invalid[0]}`, undefined, 4500)
      return false
    }
    return true
  }

  const executeScheduledSend = async (scheduleAt: number) => {
    const recipients = mergeRecipients(toChips, toInput)
    const ccList = mergeRecipients(ccChips, ccInput)
    const bccList = mergeRecipients(bccChips, bccInput)
    if (!validateRecipientsBeforeSend(recipients, ccList, bccList)) return

    const res = await window.glassmail.sendEmail({
      accountId: activeAccount?.id || accountId,
      to: recipients,
      cc: ccList,
      bcc: bccList,
      subject: subject || '(No subject)',
      bodyHtml: buildHtml(),
      bodyText: buildPlainText(),
      replyToMessageId: composer.replyToMessageId,
      threadId: composer.replyToThreadId,
      draftThreadId: composer.draftThreadId,
      draftRemoteId: composer.draftRemoteId,
      attachments,
      scheduleAt
    })
    if (res.ok) {
      clearAutosave(autosaveKey)
      closeComposer()
      await refreshAll()
      showToast(`Scheduled for ${new Date(scheduleAt).toLocaleString()}`)
    } else {
      showToast(res.error || 'Failed to schedule message')
    }
  }

  const initiateSend = (scheduleAt?: number) => {
    if (scheduleAt) {
      setShowSchedule(false)
      void executeScheduledSend(scheduleAt)
      return
    }
    const recipients = mergeRecipients(toChips, toInput)
    const ccList = mergeRecipients(ccChips, ccInput)
    const bccList = mergeRecipients(bccChips, bccInput)
    if (!validateRecipientsBeforeSend(recipients, ccList, bccList)) return

    const payload = {
      accountId: activeAccount?.id || accountId,
      to: recipients,
      cc: ccList,
      bcc: bccList,
      subject: subject || '(No subject)',
      bodyHtml: buildHtml(),
      bodyText: buildPlainText(),
      replyToMessageId: composer.replyToMessageId,
      threadId: composer.replyToThreadId,
      draftThreadId: composer.draftThreadId,
      draftRemoteId: composer.draftRemoteId,
      attachments
    }
    const draftRestore = makeDraftRestore()
    const secs = settings?.undoSendSeconds ?? 5
    clearAutosave(autosaveKey)
    closeComposer()
    queueSendWithUndo(payload, draftRestore, secs)
  }

  useEffect(() => {
    if (!composer.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        setShowSnippets((v) => !v)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        initiateSend()
      }
      if (e.key === 'Escape') {
        if (showAccountMenu || showSnippets || showSchedule || showLinkPopover) {
          setShowAccountMenu(false)
          setShowSnippets(false)
          setShowSchedule(false)
          setShowLinkPopover(false)
        } else {
          void handleSafeClose()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    composer.open,
    accountId,
    toChips,
    toInput,
    ccChips,
    ccInput,
    bccChips,
    bccInput,
    subject,
    bodyHtml,
    bodyText,
    attachments,
    includeQuotedInSend,
    showAccountMenu,
    showSnippets,
    showSchedule,
    showLinkPopover,
    isDirty
  ])

  if (!composer.open) return null

  const handleSaveDraft = async () => {
    const mergedTo = mergeRecipients(toChips, toInput)
    const mergedCc = mergeRecipients(ccChips, ccInput)
    const mergedBcc = mergeRecipients(bccChips, bccInput)
    persistAutosave(autosaveKey, {
      accountId: activeAccount?.id || accountId,
      toChips: mergedTo,
      ccChips: mergedCc,
      bccChips: mergedBcc,
      subject,
      bodyHtml,
      bodyText,
      attachments,
      savedAt: Date.now()
    })
    const res = await window.glassmail.saveDraft({
      accountId: activeAccount?.id || accountId,
      to: mergedTo,
      cc: mergedCc,
      bcc: mergedBcc,
      subject: subject || '(No subject)',
      bodyHtml: buildHtml(),
      bodyText: buildPlainText(),
      replyToMessageId: composer.replyToMessageId,
      threadId: composer.replyToThreadId,
      attachments
    })
    if (res.ok) {
      clearAutosave(autosaveKey)
      closeComposer()
      await refreshAll()
      showToast('Saved to Drafts', undefined, 3000)
    } else {
      showToast(res.error || 'Could not save draft')
    }
  }

  const runAIDraftInstruction = async (instruction: string) => {
    if (!instruction.trim() || aiLoading) return
    setAiLoading(true)
    try {
      const res = await window.glassmail.draftReply({
        accountId: activeAccount?.id || accountId,
        threadId: composer.replyToThreadId,
        instruction: instruction.trim()
      })
      if (res.error || !res.draft) {
        setAiProviderLabel(`${res.providerLabel}: ${res.error || 'No draft returned'}`)
        showToast(res.error || 'AI draft failed — check Settings › AI Providers', undefined, 7000)
      } else {
        setEditorHtml(plainTextToRichHtml(res.draft))
        setAiProviderLabel(res.providerLabel)
        setAiPrompt('')
      }
    } finally {
      setAiLoading(false)
    }
  }

  const handleAIDraftSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const base = aiPrompt.trim()
    if (!base) return
    const instruction = bodyText.trim() ? `${base}\n\nCurrent draft to revise:\n${bodyText.trim()}` : base
    void runAIDraftInstruction(instruction)
  }

  const syncFromEditorDom = () => {
    const el = editorRef.current
    if (!el) return
    setBodyHtml(el.innerHTML)
    setBodyText(extractPlainTextFromHtml(el.innerHTML))
    refreshFormatState()
  }

  const applyRichFormat = (cmd: 'bold' | 'italic' | 'list') => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    document.execCommand(cmd === 'list' ? 'insertUnorderedList' : cmd, false)
    syncFromEditorDom()
  }

  const openLinkEditor = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
      setLinkLabel(sel.toString())
    } else {
      savedRangeRef.current = null
      setLinkLabel('')
    }
    setLinkUrl('https://')
    setShowLinkPopover((v) => !v)
  }

  const insertLink = (e: React.FormEvent) => {
    e.preventDefault()
    const rawUrl = linkUrl.trim()
    if (!rawUrl || rawUrl === 'https://') return
    const href = /^(https?:|mailto:)/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    const el = editorRef.current
    if (!el) return
    el.focus()
    const sel = window.getSelection()
    if (savedRangeRef.current && sel) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    }
    if (sel && sel.toString().trim()) {
      document.execCommand('createLink', false, href)
    } else {
      const label = escapeHtmlText(linkLabel.trim() || href)
      document.execCommand(
        'insertHTML',
        false,
        `<a href="${escapeHtmlText(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      )
    }
    setShowLinkPopover(false)
    syncFromEditorDom()
  }

  const accColor = activeAccount?.color || 'var(--accent)'
  const modeLabel =
    composer.mode === 'new'
      ? 'New Message'
      : composer.mode === 'forward'
        ? 'Forward'
        : composer.mode === 'replyAll'
          ? 'Reply All'
          : 'Reply'

  const targetEmail = (composer.quotedMessage?.fromEmail || extractEmail(toChips[0] || toInput || '')).toLowerCase()
  const alwaysList = settings?.autopilot?.preDraftAlwaysSenders || []
  const isAlwaysAutoDraft = Boolean(targetEmail && alwaysList.some((s) => s.toLowerCase() === targetEmail))

  // Compact 1-row AI pills (3 high-value options)
  const quickChips = bodyText.trim()
    ? [
        { label: 'Shorter', prompt: 'Make this draft noticeably shorter and tighter while keeping the same voice and meaning.' },
        { label: 'Warmer', prompt: 'Rewrite this draft in a warmer, friendlier tone while staying natural and concise.' },
        { label: 'Polish', prompt: 'Polish grammar, clarity, and flow of this draft without changing my voice.' }
      ]
    : composer.replyToThreadId
      ? [
          { label: 'Draft reply', prompt: 'Draft a concise, natural, voice-matched reply to this email.' },
          { label: 'Sounds good', prompt: 'Reply concisely confirming that this sounds good and I am aligned.' },
          { label: 'Ask details', prompt: 'Reply briefly asking a clarifying follow-up question.' }
        ]
      : []

  const nextMondayMorning = () => {
    const d = new Date()
    const daysToMon = (1 - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + daysToMon)
    d.setHours(8, 0, 0, 0)
    return d.getTime()
  }

  const startHeaderDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || expanded) return
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, a, [data-no-drag="true"]')) return
    const rect = dialogRef.current?.getBoundingClientRect()
    if (!rect) return

    e.preventDefault()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    const width = rect.width
    const height = rect.height
    didDragRef.current = false
    setIsDragging(true)

    let latest: ComposerPos = { x: Math.round(rect.left), y: Math.round(rect.top) }

    const onMove = (ev: MouseEvent) => {
      didDragRef.current = true
      latest = clampComposerPos({ x: ev.clientX - offsetX, y: ev.clientY - offsetY }, width, height)
      setPosition(latest)
    }

    const onUp = () => {
      setIsDragging(false)
      if (didDragRef.current) {
        try {
          localStorage.setItem(COMPOSER_POS_KEY, JSON.stringify(latest))
        } catch {
          // ignore storage quota errors
        }
        setTimeout(() => {
          didDragRef.current = false
        }, 50)
      }
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const resetPosition = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, a, [data-no-drag="true"]')) return
    setPosition(null)
    try {
      localStorage.removeItem(COMPOSER_POS_KEY)
    } catch {
      // ignore
    }
  }

  const useCustomPos = Boolean(position && !expanded)

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/14 ${useCustomPos ? '' : 'flex items-center justify-center p-5'}`}
      onClick={() => {
        if (didDragRef.current) return
        void handleSafeClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={modeLabel}
        onClick={(e) => {
          e.stopPropagation()
          if (showAccountMenu) setShowAccountMenu(false)
          if (showSchedule) setShowSchedule(false)
        }}
        className={`flex flex-col overflow-hidden rounded-2xl border ${
          isDragging ? 'transition-none' : 'transition-shadow duration-150'
        } ${
          expanded
            ? 'relative h-[88vh] w-full max-w-[980px]'
            : hasQuoted
              ? `${useCustomPos ? 'fixed' : 'relative'} h-[78vh] max-h-[760px] w-[min(780px,calc(100vw-40px))]`
              : `${useCustomPos ? 'fixed' : 'relative'} h-[66vh] max-h-[640px] w-[min(720px,calc(100vw-40px))]`
        }`}
        style={{
          left: useCustomPos && position ? position.x : undefined,
          top: useCustomPos && position ? position.y : undefined,
          background: 'var(--bg-main)',
          borderColor: 'var(--border-strong)',
          boxShadow: isDragging
            ? '0 30px 80px -10px rgba(0, 0, 0, 0.34), 0 8px 24px rgba(0, 0, 0, 0.16)'
            : '0 24px 70px -12px rgba(0, 0, 0, 0.28), 0 4px 18px rgba(0, 0, 0, 0.12)'
        }}
      >
        {/* Top account-color hairline */}
        <div className="h-[3px] w-full shrink-0" style={{ background: accColor }} />

        {/* Header (drag to move · double-click to center) */}
        <div
          onMouseDown={startHeaderDrag}
          onDoubleClick={resetPosition}
          className={`flex shrink-0 select-none items-center justify-between gap-3 border-b px-5 py-3 ${
            expanded ? '' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{
            borderColor: 'var(--border-subtle)',
            background: `linear-gradient(90deg, color-mix(in srgb, ${accColor} 11%, var(--bg-elevated)) 0%, var(--bg-elevated) 55%)`
          }}
          title={expanded ? undefined : 'Drag to move · Double-click to center'}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase"
              style={{
                background: `color-mix(in srgb, ${accColor} 16%, transparent)`,
                color: 'var(--text-primary)'
              }}
            >
              {modeLabel}
            </span>

            {/* Custom Account Picker Pill */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowAccountMenu((v) => !v)
                }}
                className="inline-flex max-w-[360px] items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                style={{
                  background: 'var(--bg-main)',
                  borderColor: 'var(--border-subtle)'
                }}
                title="Switch sending account"
                aria-label="Switch sending account"
              >
                {activeAccount && (
                  <AccountBadge icon={activeAccount.icon} color={activeAccount.color} size="xs" />
                )}
                <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                  {activeAccount?.name || 'Select account'}
                </span>
                {activeAccount?.email && (
                  <span className="hidden truncate text-[11.5px] sm:inline" style={{ color: 'var(--text-muted)' }}>
                    {activeAccount.email}
                  </span>
                )}
                <ChevronDown size={13} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
              </button>

              {showAccountMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 top-10 z-30 w-72 rounded-xl border p-1.5 shadow-2xl"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
                >
                  <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Send from
                  </div>
                  {accounts.map((a) => {
                    const selected = a.id === activeAccount?.id
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setAccountId(a.id)
                          setShowAccountMenu(false)
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-[var(--bg-hover)]"
                        style={{
                          background: selected
                            ? `linear-gradient(90deg, color-mix(in srgb, ${a.color} 14%, transparent) 0%, transparent 100%)`
                            : undefined
                        }}
                      >
                        <AccountBadge icon={a.icon} color={a.color} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12.5px] font-medium" style={{ color: 'var(--text-primary)' }}>
                            {a.name}
                          </div>
                          <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {a.email}
                          </div>
                        </div>
                        {selected && <Check size={14} style={{ color: 'var(--accent)' }} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Autopilot VIP rule toggle moved cleanly out of the AI revise bar */}
            {settings && targetEmail && isValidEmailAddress(targetEmail) && (
              <button
                type="button"
                onClick={async () => {
                  const prevSettings = settings
                  const nextAlways = isAlwaysAutoDraft
                    ? alwaysList.filter((s) => s.toLowerCase() !== targetEmail)
                    : Array.from(new Set([...alwaysList, targetEmail]))
                  const nextExcluded = (settings.autopilot?.preDraftExcludedSenders || []).filter(
                    (s) => s.toLowerCase() !== targetEmail
                  )
                  await saveSettings({
                    ...settings,
                    autopilot: {
                      ...settings.autopilot,
                      autoPreDraftPeople: Boolean(settings.autopilot?.autoPreDraftPeople),
                      preDraftDisabledAccountIds: settings.autopilot?.preDraftDisabledAccountIds || [],
                      preDraftAlwaysSenders: nextAlways,
                      preDraftExcludedSenders: isAlwaysAutoDraft
                        ? settings.autopilot?.preDraftExcludedSenders || []
                        : nextExcluded,
                      waitingDismissedThreadIds: settings.autopilot?.waitingDismissedThreadIds || [],
                      autoClean2FAHours: settings.autopilot?.autoClean2FAHours ?? null
                    }
                  })
                  showToast(
                    isAlwaysAutoDraft
                      ? `Removed ${targetEmail} from Autopilot pre-drafts`
                      : `Autopilot will pre-draft replies for ${targetEmail}`,
                    async () => {
                      await saveSettings(prevSettings)
                    }
                  )
                }}
                className="mr-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition hover:bg-[var(--bg-hover)]"
                style={{
                  borderColor: isAlwaysAutoDraft ? 'var(--accent)' : 'var(--border-subtle)',
                  background: isAlwaysAutoDraft ? 'var(--accent-soft)' : 'var(--bg-main)',
                  color: isAlwaysAutoDraft ? 'var(--accent-text)' : 'var(--text-muted)'
                }}
                title={
                  isAlwaysAutoDraft
                    ? `Autopilot automatically pre-drafts replies for ${targetEmail} — click to turn off`
                    : `Tell Autopilot to automatically pre-draft future replies for ${targetEmail}`
                }
                aria-pressed={isAlwaysAutoDraft}
              >
                <Sparkles size={10} fill={isAlwaysAutoDraft ? 'currentColor' : 'none'} />
                <span>{isAlwaysAutoDraft ? 'Auto-draft on' : 'Auto-draft'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-secondary)' }}
              title={expanded ? 'Compact view' : 'Expand composer'}
              aria-label={expanded ? 'Compact composer view' : 'Expand composer'}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              type="button"
              onClick={() => void handleSafeClose()}
              className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-secondary)' }}
              title={isDirty ? 'Save draft & close (Esc)' : 'Close (Esc)'}
              aria-label="Close composer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Recipients + Subject */}
        <div className="shrink-0 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
          <RecipientChipInput
            label="To"
            chips={toChips}
            input={toInput}
            placeholder="Add recipients…"
            onChipsChange={setToChips}
            onInputChange={setToInput}
            rightSlot={
              (!showCc || !showBcc) && (
                <div className="flex items-center gap-1 text-[11.5px]">
                  {!showCc && (
                    <button
                      type="button"
                      onClick={() => setShowCc(true)}
                      className="rounded-md px-2 py-0.5 font-medium transition hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Cc
                    </button>
                  )}
                  {!showBcc && (
                    <button
                      type="button"
                      onClick={() => setShowBcc(true)}
                      className="rounded-md px-2 py-0.5 font-medium transition hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Bcc
                    </button>
                  )}
                </div>
              )
            }
          />
          {showCc && (
            <div className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <RecipientChipInput
                label="Cc"
                chips={ccChips}
                input={ccInput}
                placeholder="Add Cc…"
                onChipsChange={setCcChips}
                onInputChange={setCcInput}
              />
            </div>
          )}
          {showBcc && (
            <div className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <RecipientChipInput
                label="Bcc"
                chips={bccChips}
                input={bccInput}
                placeholder="Add Bcc…"
                onChipsChange={setBccChips}
                onInputChange={setBccInput}
              />
            </div>
          )}

          {/* Subject Line */}
          <div className="border-t px-6 py-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              aria-label="Subject"
              className="w-full bg-transparent text-[15.5px] font-semibold tracking-tight outline-none placeholder:font-normal placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>

        {/* Compact Single-Row AI Assist Bar (Option B) */}
        <div
          className="shrink-0 border-b px-5 py-2"
          style={{
            borderColor: 'var(--border-subtle)',
            background: 'color-mix(in srgb, var(--accent) 4%, var(--bg-main))'
          }}
        >
          <form onSubmit={handleAIDraftSubmit} className="flex flex-wrap items-center gap-1.5">
            <div
              className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border px-2.5 py-1 transition focus-within:border-[var(--accent)]"
              style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
            >
              <Sparkles size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />
              <input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={
                  bodyText.trim()
                    ? 'Ask AI to revise…'
                    : 'Draft in your voice…'
                }
                aria-label="AI drafting instruction"
                className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
              />
              <button
                type="submit"
                disabled={!aiPrompt.trim() || aiLoading}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-35"
                style={{ background: 'var(--accent)' }}
              >
                {aiLoading ? <RefreshCw size={10} className="animate-spin" /> : null}
                {aiLoading ? 'Working…' : bodyText.trim() ? 'Revise' : 'Draft'}
              </button>
            </div>

            {quickChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                disabled={aiLoading}
                onClick={() => {
                  const inst = bodyText.trim()
                    ? `${chip.prompt}\n\nCurrent draft:\n${bodyText.trim()}`
                    : chip.prompt
                  void runAIDraftInstruction(inst)
                }}
                className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent-text)] disabled:opacity-40"
                style={{
                  background: 'var(--bg-main)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)'
                }}
              >
                {chip.label}
              </button>
            ))}

            {aiProviderLabel && (
              <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                {aiProviderLabel}
              </span>
            )}
          </form>
        </div>

        {/* True Rich-Text Writing Canvas + Quoted Thread */}
        <div
          className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
          style={{ background: 'var(--bg-main)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) editorRef.current?.focus()
          }}
        >
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Message body"
            data-placeholder="Write your message…"
            onInput={syncFromEditorDom}
            onKeyUp={refreshFormatState}
            onMouseUp={refreshFormatState}
            onPaste={(e) => {
              const html = e.clipboardData.getData('text/html')
              if (html) {
                e.preventDefault()
                const cleaned = sanitizeRichHtml(html)
                document.execCommand('insertHTML', false, cleaned)
                syncFromEditorDom()
              }
            }}
            className={`composer-editor px-6 py-5 ${hasQuoted ? 'min-h-[140px] shrink-0' : 'min-h-[200px] flex-1'}`}
          />

          {composer.quotedMessage && (
            <div
              className="mx-6 mb-5 mt-1 flex flex-1 flex-col rounded-xl border"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'var(--bg-elevated)'
              }}
            >
              <div
                className="flex items-center justify-between gap-2 px-3.5 py-2 text-[12px]"
                style={{
                  borderBottom: showQuotedPreview ? '1px solid var(--border-subtle)' : 'none',
                  color: 'var(--text-secondary)'
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowQuotedPreview((v) => !v)}
                  className="flex min-w-0 items-center gap-1.5 font-medium transition hover:text-[var(--text-primary)]"
                >
                  {showQuotedPreview ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="truncate">
                    On{' '}
                    {new Date(composer.quotedMessage.date).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                    , <strong style={{ color: 'var(--text-primary)' }}>{composer.quotedMessage.fromName}</strong> wrote
                  </span>
                </button>
                <label
                  className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11.5px]"
                  style={{ color: 'var(--text-muted)' }}
                  title="Append the original email below your reply when sending"
                >
                  <input
                    type="checkbox"
                    checked={includeQuotedInSend}
                    onChange={(e) => setIncludeQuotedInSend(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[var(--accent)]"
                  />
                  Include original
                </label>
              </div>
              {showQuotedPreview && (
                <div
                  className="mx-3.5 my-3 select-text border-l-2 pl-3.5 text-[12.5px]"
                  style={{ borderColor: 'var(--border-strong)' }}
                >
                  <EmailHtmlBody html={composer.quotedMessage.bodyHtml} scale={0.94} />
                </div>
              )}
            </div>
          )}

          {/* Inline Insert Link Popover */}
          {showLinkPopover && (
            <form
              onSubmit={insertLink}
              onClick={(e) => e.stopPropagation()}
              className="sticky bottom-3 left-5 z-20 mx-5 mb-2 flex w-[360px] max-w-[calc(100%-40px)] flex-col gap-2 rounded-xl border p-3 shadow-2xl"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
            >
              <div className="flex items-center justify-between text-[11.5px] font-semibold">
                <span>Insert link</span>
                <button
                  type="button"
                  onClick={() => setShowLinkPopover(false)}
                  className="rounded p-0.5 hover:bg-[var(--bg-hover)]"
                  aria-label="Close insert link"
                >
                  <X size={12} />
                </button>
              </div>
              <input
                autoFocus
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                className="rounded-lg border px-2.5 py-1.5 text-[12.5px] outline-none"
                style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
              />
              {!savedRangeRef.current?.toString() && (
                <input
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  placeholder="Display text (optional)"
                  className="rounded-lg border px-2.5 py-1.5 text-[12.5px] outline-none"
                  style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
                />
              )}
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowLinkPopover(false)}
                  className="rounded-lg px-2.5 py-1 text-[11.5px] hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg px-3 py-1 text-[11.5px] font-semibold text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  Insert
                </button>
              </div>
            </form>
          )}

          {/* Snippets Popover */}
          {showSnippets && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="sticky bottom-3 left-5 z-20 mx-5 mb-2 w-80 rounded-xl border p-2 shadow-2xl"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
            >
              <div
                className="mb-1.5 flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                <span>Snippets</span>
                <button
                  type="button"
                  onClick={() => setShowSnippets(false)}
                  className="rounded p-0.5 hover:bg-[var(--bg-hover)]"
                  aria-label="Close snippets"
                >
                  <X size={12} />
                </button>
              </div>
              {snippets.length === 0 ? (
                <div className="px-2 py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  No snippets yet — add reusable replies in Settings.
                </div>
              ) : (
                <div className="max-h-56 space-y-0.5 overflow-y-auto">
                  {snippets.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        const extra = plainTextToRichHtml(s.body)
                        setEditorHtml(bodyHtml ? `${bodyHtml}<p><br></p>${extra}` : extra)
                        setShowSnippets(false)
                      }}
                      className="block w-full rounded-lg px-2.5 py-2 text-left transition hover:bg-[var(--bg-hover)]"
                    >
                      <div className="text-[12.5px] font-medium">{s.title}</div>
                      <div className="truncate text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                        {s.body}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Attachments Strip */}
        {attachments.length > 0 && (
          <div
            className="flex shrink-0 flex-wrap items-center gap-2 border-t px-6 py-2.5"
            style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-main)' }}
          >
            {attachments.map((att) => (
              <div
                key={att.id}
                className="inline-flex max-w-[290px] items-center gap-1 rounded-xl border transition hover:border-[var(--accent)]"
                style={{
                  background: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)'
                }}
              >
                <button
                  type="button"
                  onClick={async () => {
                    const res = await window.glassmail.openAttachment({
                      accountId: activeAccount?.id || accountId,
                      filename: att.filename,
                      localPath: att.localPath,
                      remoteMessageId: att.remoteMessageId,
                      remoteAttachmentId: att.remoteAttachmentId
                    })
                    if (!res.ok) {
                      showToast(res.error || `Could not open ${att.filename}`, undefined, 4000)
                    }
                  }}
                  className="inline-flex min-w-0 items-center gap-1.5 py-1 pl-2.5 pr-1 text-left text-[12px] hover:underline"
                  title={`Click to open ${att.filename}`}
                >
                  <Paperclip size={12} className="shrink-0" style={{ color: 'var(--accent)' }} />
                  <span className="truncate font-medium">{att.filename}</span>
                  <span className="shrink-0 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                    {att.size >= 1024 * 1024
                      ? `${(att.size / (1024 * 1024)).toFixed(1)} MB`
                      : `${Math.max(1, Math.round(att.size / 1024))} KB`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== att.id))}
                  className="mr-1 rounded-full p-0.5 transition hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]"
                  style={{ color: 'var(--text-muted)' }}
                  title="Remove attachment"
                  aria-label={`Remove ${att.filename}`}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Modern Footer Bar */}
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
        >
          {/* Left: True Rich-Text Formatting + Attach + Snippets */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyRichFormat('bold')}
              className="rounded-lg p-2 transition hover:bg-[var(--bg-hover)]"
              style={{
                background: fmtActive.bold ? 'var(--accent-soft)' : undefined,
                color: fmtActive.bold ? 'var(--accent-text)' : 'var(--text-secondary)'
              }}
              title={`Bold (${modKeyPrefix}B)`}
              aria-label="Bold"
              aria-pressed={fmtActive.bold}
            >
              <Bold size={14} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyRichFormat('italic')}
              className="rounded-lg p-2 transition hover:bg-[var(--bg-hover)]"
              style={{
                background: fmtActive.italic ? 'var(--accent-soft)' : undefined,
                color: fmtActive.italic ? 'var(--accent-text)' : 'var(--text-secondary)'
              }}
              title={`Italic (${modKeyPrefix}I)`}
              aria-label="Italic"
              aria-pressed={fmtActive.italic}
            >
              <Italic size={14} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyRichFormat('list')}
              className="rounded-lg p-2 transition hover:bg-[var(--bg-hover)]"
              style={{
                background: fmtActive.list ? 'var(--accent-soft)' : undefined,
                color: fmtActive.list ? 'var(--accent-text)' : 'var(--text-secondary)'
              }}
              title="Bullet list"
              aria-label="Bullet list"
              aria-pressed={fmtActive.list}
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openLinkEditor}
              className="rounded-lg p-2 transition hover:bg-[var(--bg-hover)]"
              style={{
                background: showLinkPopover ? 'var(--accent-soft)' : undefined,
                color: showLinkPopover ? 'var(--accent-text)' : 'var(--text-secondary)'
              }}
              title="Insert link"
              aria-label="Insert link"
            >
              <Link2 size={14} />
            </button>

            <div className="mx-1.5 h-4 w-px" style={{ background: 'var(--border-subtle)' }} />

            <button
              type="button"
              onClick={async () => {
                const picked = await window.glassmail.pickAttachmentFiles()
                if (picked.length > 0) {
                  setAttachments((prev) => [...prev, ...picked])
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-secondary)' }}
              title="Attach files"
            >
              <Paperclip size={13} />
              <span>Attach</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSnippets((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
              style={{
                background: showSnippets ? 'var(--bg-hover)' : 'transparent',
                color: 'var(--text-secondary)'
              }}
              title="Insert Snippet (Alt+Ctrl+S)"
            >
              <BookOpen size={13} />
              <span>Snippets</span>
            </button>
          </div>

          {/* Right: Live Autosave Status · Discard · Save Draft · Split Send */}
          <div className="relative flex items-center gap-2">
            {saveStatus !== 'idle' && (
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                {saveStatus === 'saving'
                  ? 'Saving…'
                  : saveStatus === 'restored'
                    ? 'Draft restored'
                    : 'Draft saved'}
              </span>
            )}

            <button
              type="button"
              onClick={handleDiscardDraft}
              className="rounded-xl p-2 transition hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]"
              style={{ color: 'var(--text-muted)' }}
              title="Discard draft"
              aria-label="Discard draft"
            >
              <Trash2 size={15} />
            </button>

            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-secondary)' }}
              title="Save to Drafts folder"
            >
              <FileText size={14} />
              <span>Save draft</span>
            </button>

            {/* Split Primary Send + Schedule */}
            <div className="inline-flex items-stretch overflow-hidden rounded-xl shadow-sm" style={{ background: 'var(--accent)' }}>
              <button
                type="button"
                onClick={() => initiateSend()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110"
                title={`Send (${modKeyPrefix}Enter)`}
              >
                <Send size={13} />
                <span>Send</span>
              </button>
              <div className="my-1.5 w-px bg-white/25" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowSchedule((v) => !v)
                }}
                className="flex items-center justify-center px-2.5 text-white transition hover:brightness-110"
                title="Schedule send"
                aria-label="Schedule send"
              >
                <ChevronDown size={14} />
              </button>
            </div>

            {showSchedule && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-12 right-0 z-30 w-52 rounded-xl border p-1.5 shadow-2xl"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
              >
                <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  <Clock size={11} /> Schedule send
                </div>
                <button
                  type="button"
                  onClick={() => initiateSend(Date.now() + 3 * 3600_000)}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                >
                  In 3 hours
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date()
                    d.setDate(d.getDate() + 1)
                    d.setHours(8, 0, 0, 0)
                    initiateSend(d.getTime())
                  }}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                >
                  Tomorrow · 8:00 AM
                </button>
                <button
                  type="button"
                  onClick={() => initiateSend(nextMondayMorning())}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                >
                  Monday · 8:00 AM
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
