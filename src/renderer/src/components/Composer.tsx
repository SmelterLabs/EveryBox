import React, { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import { BookOpen, Clock, Send, Sparkles, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export const Composer: React.FC = () => {
  const { composer, accounts, snippets, settings, closeComposer, showToast, refreshAll, queueSendWithUndo } = useAppStore()

  const [accountId, setAccountId] = useState(composer.accountId)
  const [to, setTo] = useState(composer.to)
  const [cc, setCc] = useState(composer.cc)
  const [bcc, setBcc] = useState(composer.bcc)
  const [showCcBcc, setShowCcBcc] = useState(Boolean(composer.cc || composer.bcc))
  const [subject, setSubject] = useState(composer.subject)
  const [body, setBody] = useState(composer.body)
  const [markdownMode, setMarkdownMode] = useState(false)

  // AI Writer bar
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiProviderLabel, setAiProviderLabel] = useState<string | null>(null)

  // Snippets & Send Later
  const [showSnippets, setShowSnippets] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)

  // Undo send countdown
  const [undoCountdown, setUndoCountdown] = useState<number | null>(null)
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingSendRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (composer.open) {
      setAccountId(composer.accountId || accounts[0]?.id || '')
      setTo(composer.to)
      setCc(composer.cc)
      setBcc(composer.bcc)
      setShowCcBcc(Boolean(composer.cc || composer.bcc))
      setSubject(composer.subject)
      setBody(composer.body)
      setAiPrompt('')
      setAiProviderLabel(null)
      setShowSnippets(false)
      setShowSchedule(false)
    }
  }, [composer.open, composer.to, composer.subject, composer.body, composer.accountId])

  useEffect(() => {
    if (!composer.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        setShowSnippets((v) => !v)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        void initiateSend()
      }
      if (e.key === 'Escape' && undoCountdown === null) {
        closeComposer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [composer.open, accountId, to, cc, bcc, subject, body, markdownMode, undoCountdown])

  if (!composer.open) return null

  const activeAccount = accounts.find((a) => a.id === accountId) || accounts[0]

  const buildHtml = () => {
    const contentHtml = markdownMode
      ? String(marked.parse(body))
      : body
          .split('\n')
          .map((line) => (line.trim() ? `<p>${line}</p>` : '<br/>'))
          .join('')
    const sig = activeAccount?.signatureHtml ? `<br/>${activeAccount.signatureHtml}` : ''
    return `${contentHtml}${sig}`
  }

  const executeSend = async (scheduleAt?: number) => {
    const recipients = to
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (recipients.length === 0) {
      showToast('Please enter at least one recipient.')
      return
    }
    const res = await window.glassmail.sendEmail({
      accountId: activeAccount?.id || accountId,
      to: recipients,
      cc: cc
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      bcc: bcc
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      subject: subject || '(No subject)',
      bodyHtml: buildHtml(),
      bodyText: body,
      replyToMessageId: composer.replyToMessageId,
      threadId: composer.replyToThreadId,
      scheduleAt
    })
    if (res.ok) {
      closeComposer()
      await refreshAll()
      showToast(scheduleAt ? `Scheduled for ${new Date(scheduleAt).toLocaleString()}` : 'Message sent')
    } else {
      showToast(res.error || 'Failed to send message')
    }
  }

  const initiateSend = (scheduleAt?: number) => {
    if (scheduleAt) {
      setShowSchedule(false)
      void executeSend(scheduleAt)
      return
    }
    const recipients = to
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (recipients.length === 0) {
      showToast('Please enter at least one recipient.')
      return
    }
    const payload = {
      accountId: activeAccount?.id || accountId,
      to: recipients,
      cc: cc
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      bcc: bcc
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      subject: subject || '(No subject)',
      bodyHtml: buildHtml(),
      bodyText: body,
      replyToMessageId: composer.replyToMessageId,
      threadId: composer.replyToThreadId
    }
    const draftRestore = {
      mode: composer.mode,
      accountId: activeAccount?.id || accountId,
      to,
      cc,
      bcc,
      subject,
      body,
      replyToThreadId: composer.replyToThreadId,
      replyToMessageId: composer.replyToMessageId
    }
    const secs = settings?.undoSendSeconds ?? 5
    closeComposer()
    queueSendWithUndo(payload, draftRestore, secs)
  }

  const cancelUndoSend = () => {
    if (undoTimerRef.current) clearInterval(undoTimerRef.current)
    pendingSendRef.current = null
    setUndoCountdown(null)
    showToast('Send cancelled — draft restored')
  }

  const handleAIDraft = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!aiPrompt.trim() || aiLoading) return
    setAiLoading(true)
    try {
      const res = await window.glassmail.draftReply({
        accountId: activeAccount?.id || accountId,
        threadId: composer.replyToThreadId,
        instruction: aiPrompt.trim()
      })
      setBody(res.draft)
      setAiProviderLabel(res.providerLabel)
      setAiPrompt('')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 p-6" onClick={closeComposer}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[560px] w-full max-w-[660px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-2.5"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold">
              {composer.mode === 'new' ? 'New Message' : composer.mode === 'forward' ? 'Forward' : 'Reply'}
            </span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded-md border px-2 py-0.5 text-[12px] outline-none"
              style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  From: {a.name} ({a.email})
                </option>
              ))}
            </select>
          </div>
          <button onClick={closeComposer} className="rounded-lg p-1 hover:bg-[var(--bg-hover)]">
            <X size={15} />
          </button>
        </div>

        {/* Address Fields */}
        <div className="divide-y border-b text-[13px]" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center px-4 py-2">
            <span className="w-12 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              To
            </span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="flex-1 bg-transparent outline-none"
            />
            {!showCcBcc && (
              <button
                onClick={() => setShowCcBcc(true)}
                className="text-[11.5px] hover:underline"
                style={{ color: 'var(--text-muted)' }}
              >
                Cc / Bcc
              </button>
            )}
          </div>
          {showCcBcc && (
            <>
              <div className="flex items-center px-4 py-2" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="w-12 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  Cc
                </span>
                <input value={cc} onChange={(e) => setCc(e.target.value)} className="flex-1 bg-transparent outline-none" />
              </div>
              <div className="flex items-center px-4 py-2" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="w-12 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  Bcc
                </span>
                <input value={bcc} onChange={(e) => setBcc(e.target.value)} className="flex-1 bg-transparent outline-none" />
              </div>
            </>
          )}
          <div className="flex items-center px-4 py-2" style={{ borderColor: 'var(--border-subtle)' }}>
            <span className="w-12 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Subject
            </span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 bg-transparent font-medium outline-none"
            />
          </div>
        </div>

        {/* Voice-Matched AI Writer Bar */}
        <form
          onSubmit={(e) => void handleAIDraft(e)}
          className="flex items-center gap-2 border-b px-4 py-2"
          style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
        >
          <Sparkles size={14} style={{ color: 'var(--accent)' }} />
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder='Draft in your voice… e.g. "yes, but next Tuesday afternoon"'
            className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[var(--text-muted)]"
          />
          <button
            type="submit"
            disabled={!aiPrompt.trim() || aiLoading}
            className="rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-white transition disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {aiLoading ? 'Drafting…' : 'Draft'}
          </button>
        </form>

        {/* Editor Area (with optional Markdown preview) */}
        <div className="relative flex flex-1 overflow-hidden">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={markdownMode ? 'Write in Markdown (**bold**, - lists, # headings)…' : 'Write your message…'}
            className="h-full flex-1 resize-none bg-transparent p-4 text-[13.5px] leading-relaxed outline-none"
          />
          {markdownMode && (
            <div
              className="email-prose h-full w-1/2 overflow-y-auto border-l p-4"
              style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-main)' }}
              dangerouslySetInnerHTML={{ __html: String(marked.parse(body || '*Markdown preview…*')) }}
            />
          )}

          {/* Snippets Popup */}
          {showSnippets && (
            <div
              className="absolute bottom-3 left-3 z-20 w-72 rounded-xl border p-2 shadow-2xl"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
            >
              <div className="mb-1 flex items-center justify-between px-2 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                <span>Snippets (Alt+Ctrl+S)</span>
                <button onClick={() => setShowSnippets(false)}>
                  <X size={12} />
                </button>
              </div>
              {snippets.length === 0 ? (
                <div className="px-2 py-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  No snippets yet. Add them in Settings.
                </div>
              ) : (
                snippets.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setBody((prev) => (prev ? `${prev}\n${s.body}` : s.body))
                      setShowSnippets(false)
                    }}
                    className="block w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--bg-hover)]"
                  >
                    <div className="text-[12.5px] font-medium">{s.title}</div>
                    <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {s.body}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between border-t px-4 py-2.5"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMarkdownMode((v) => !v)}
              className="rounded-lg border px-2 py-1 text-[11.5px] font-semibold transition"
              style={{
                background: markdownMode ? 'var(--accent-soft)' : 'transparent',
                borderColor: markdownMode ? 'var(--accent)' : 'var(--border-strong)',
                color: markdownMode ? 'var(--accent-text)' : 'var(--text-secondary)'
              }}
              title="Toggle Markdown mode (M↓)"
            >
              M↓
            </button>
            <button
              onClick={() => setShowSnippets((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11.5px] transition hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
              title="Insert Snippet (Alt+Ctrl+S)"
            >
              <BookOpen size={12} /> Snippets
            </button>
            {aiProviderLabel && (
              <span className="ml-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {aiProviderLabel}
              </span>
            )}
          </div>

          <div className="relative flex items-center gap-2">
            {undoCountdown !== null ? (
              <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12.5px]" style={{ background: 'var(--accent-soft)' }}>
                <span style={{ color: 'var(--accent-text)' }}>Sending in {undoCountdown}s…</span>
                <button
                  onClick={cancelUndoSend}
                  className="rounded bg-white/15 px-2 py-0.5 font-semibold hover:bg-white/25"
                >
                  Undo
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowSchedule((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] hover:bg-[var(--bg-hover)]"
                  style={{ borderColor: 'var(--border-strong)' }}
                  title="Send later"
                >
                  <Clock size={13} />
                </button>
                {showSchedule && (
                  <div
                    className="absolute bottom-11 right-0 z-20 w-48 rounded-xl border p-1 shadow-xl"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
                  >
                    <button
                      onClick={() => initiateSend(Date.now() + 3 * 3600_000)}
                      className="block w-full rounded-lg px-3 py-1.5 text-left text-[12px] hover:bg-[var(--bg-hover)]"
                    >
                      In 3 hours
                    </button>
                    <button
                      onClick={() => {
                        const d = new Date()
                        d.setDate(d.getDate() + 1)
                        d.setHours(8, 0, 0, 0)
                        initiateSend(d.getTime())
                      }}
                      className="block w-full rounded-lg px-3 py-1.5 text-left text-[12px] hover:bg-[var(--bg-hover)]"
                    >
                      Tomorrow 8:00 AM
                    </button>
                  </div>
                )}

                <button
                  onClick={() => initiateSend()}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90"
                  style={{ background: 'var(--accent)' }}
                >
                  <Send size={13} /> Send
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
