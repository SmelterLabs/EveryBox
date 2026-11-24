import React, { useEffect, useState } from 'react'
import { Check, Copy, Cpu, Key, Mail, Plus, Shield, Sparkles, Terminal, Trash2, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { AIProviderType, AppSettings, ThemeId } from '../../../shared/types'

export const SettingsModal: React.FC = () => {
  const {
    settingsOpen,
    settingsInitialTab,
    closeSettings,
    settings,
    accounts,
    snippets,
    saveSettings,
    refreshAll,
    showToast
  } = useAppStore()

  const [tab, setTab] = useState(settingsInitialTab)
  const [draft, setDraft] = useState<AppSettings | null>(settings)

  // Gmail OAuth
  const [connectingGmail, setConnectingGmail] = useState(false)
  const [showOAuthFields, setShowOAuthFields] = useState(false)

  // Add IMAP form
  const [imapName, setImapName] = useState('')
  const [imapEmail, setImapEmail] = useState('')
  const [imapPass, setImapPass] = useState('')
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState(993)
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(465)
  const [caldavUrl, setCaldavUrl] = useState('')
  const [icsFeedUrl, setIcsFeedUrl] = useState('')
  const [addingImap, setAddingImap] = useState(false)

  // Local AI detection
  const [localAI, setLocalAI] = useState<{
    ollamaRunning: boolean
    ollamaModels: string[]
    lmStudioRunning: boolean
    lmStudioModels: string[]
    claudeCliAvailable: boolean
    codexCliAvailable: boolean
  } | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')

  // Snippets
  const [snipTitle, setSnipTitle] = useState('')
  const [snipBody, setSnipBody] = useState('')

  // MCP config
  const [mcpConfigJson, setMcpConfigJson] = useState('')

  useEffect(() => {
    if (settingsOpen) {
      setTab(settingsInitialTab)
      setDraft(settings ? JSON.parse(JSON.stringify(settings)) : null)
      void window.glassmail.detectLocalAI().then(setLocalAI)
      void window.glassmail.getMcpConfig().then((cfg) =>
        setMcpConfigJson(JSON.stringify({ mcpServers: { everybox: cfg } }, null, 2))
      )
    }
  }, [settingsOpen, settingsInitialTab, settings])

  if (!settingsOpen || !draft) return null

  const updateAndSave = async (next: AppSettings) => {
    setDraft(next)
    await saveSettings(next)
  }

  const handleConnectGmail = async () => {
    await saveSettings(draft)
    setConnectingGmail(true)
    try {
      const res = await window.glassmail.connectGmail()
      if (res.ok) {
        showToast(`Connected ${res.email} (Gmail + Google Calendar)`)
        await refreshAll()
      } else {
        showToast(res.error || 'Gmail connection failed')
      }
    } finally {
      setConnectingGmail(false)
    }
  }

  const handleAddImap = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddingImap(true)
    try {
      const res = await window.glassmail.addImapAccount({
        name: imapName || imapEmail.split('@')[0],
        email: imapEmail,
        password: imapPass,
        imapHost,
        imapPort,
        imapSecure: imapPort === 993,
        smtpHost: smtpHost || imapHost.replace(/^imap\./, 'smtp.'),
        smtpPort,
        smtpSecure: smtpPort === 465,
        caldavUrl: caldavUrl.trim() || undefined,
        icsFeedUrl: icsFeedUrl.trim() || undefined
      })
      if (res.ok) {
        showToast(`Connected IMAP account ${imapEmail}`)
        setImapName('')
        setImapEmail('')
        setImapPass('')
        setImapHost('')
        setSmtpHost('')
        setCaldavUrl('')
        setIcsFeedUrl('')
        await refreshAll()
      } else {
        showToast(res.error || 'Could not connect IMAP account')
      }
    } finally {
      setAddingImap(false)
    }
  }

  const tabs: { id: typeof tab; label: string; icon: React.ReactNode }[] = [
    { id: 'accounts', label: 'Accounts', icon: <Mail size={14} /> },
    { id: 'ai', label: 'AI ($0 Local / CLI)', icon: <Sparkles size={14} /> },
    { id: 'general', label: 'Themes & General', icon: <Cpu size={14} /> },
    { id: 'privacy', label: 'Privacy', icon: <Shield size={14} /> },
    { id: 'snippets', label: 'Snippets', icon: <Plus size={14} /> },
    { id: 'mcp', label: 'MCP Agents', icon: <Terminal size={14} /> }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6" onClick={closeSettings}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[620px] w-full max-w-[820px] overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
      >
        {/* Settings Sidebar */}
        <div
          className="w-48 shrink-0 border-r p-3"
          style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="mb-3 px-2 text-[13px] font-semibold">Settings</div>
          <div className="space-y-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)]"
                style={{
                  background: tab === t.id ? 'var(--bg-selected)' : undefined,
                  color: tab === t.id ? 'var(--accent-text)' : 'var(--text-secondary)'
                }}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Settings Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div
            className="flex items-center justify-between border-b px-6 py-3.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <h3 className="text-[15px] font-semibold capitalize">{tab}</h3>
            <button onClick={closeSettings} className="rounded-lg p-1 hover:bg-[var(--bg-hover)]">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* ACCOUNTS TAB */}
            {tab === 'accounts' && (
              <div className="space-y-6">
                {/* Connected Accounts */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-[13px] font-semibold">Connected Accounts</h4>
                    {accounts.some((a) => a.isDemo) && (
                      <button
                        onClick={async () => {
                          await window.glassmail.clearDemoAccounts()
                          await refreshAll()
                          showToast('Cleared sample demo accounts')
                        }}
                        className="text-[11.5px] font-medium hover:underline"
                        style={{ color: 'var(--accent-text)' }}
                      >
                        Clear Demo Accounts
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {accounts.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between rounded-xl border px-3.5 py-2.5"
                        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="h-3 w-3 rounded-full" style={{ background: a.color }} />
                          <div>
                            <div className="text-[13px] font-semibold">
                              {a.name}{' '}
                              <span className="text-[11px] font-normal" style={{ color: 'var(--text-muted)' }}>
                                ({a.provider.toUpperCase()}
                                {a.isDemo ? ' · Demo' : ''})
                              </span>
                            </div>
                            <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                              {a.email}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            await window.glassmail.deleteAccount(a.id)
                            await refreshAll()
                            showToast(`Removed ${a.email}`)
                          }}
                          className="rounded p-1.5 hover:bg-[var(--bg-hover)]"
                          style={{ color: 'var(--danger)' }}
                          title="Remove account"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Connect Gmail (OAuth2 - Free) */}
                <div
                  className="space-y-3 rounded-xl border p-4"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-[13.5px] font-semibold">Connect Gmail + Google Calendar</h4>
                      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        One sign-in links both Gmail and two-way Google Calendar. Repeat for each Gmail account.
                      </p>
                    </div>
                    {draft.googleOAuthClientId && draft.googleOAuthClientSecret && (
                      <button
                        type="button"
                        onClick={() => setShowOAuthFields((v) => !v)}
                        className="shrink-0 text-[11.5px] hover:underline"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {showOAuthFields ? 'Hide OAuth client' : 'Change OAuth client'}
                      </button>
                    )}
                  </div>

                  {(!draft.googleOAuthClientId || !draft.googleOAuthClientSecret || showOAuthFields) && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <input
                        placeholder="Google OAuth Client ID"
                        value={draft.googleOAuthClientId || ''}
                        onChange={(e) => setDraft({ ...draft, googleOAuthClientId: e.target.value })}
                        onBlur={() => void saveSettings(draft)}
                        className="rounded-lg border bg-transparent px-3 py-2 text-[12.5px] outline-none"
                        style={{ borderColor: 'var(--border-strong)' }}
                      />
                      <input
                        type="password"
                        placeholder="Google OAuth Client Secret"
                        value={draft.googleOAuthClientSecret || ''}
                        onChange={(e) => setDraft({ ...draft, googleOAuthClientSecret: e.target.value })}
                        onBlur={() => void saveSettings(draft)}
                        className="rounded-lg border bg-transparent px-3 py-2 text-[12.5px] outline-none"
                        style={{ borderColor: 'var(--border-strong)' }}
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => void handleConnectGmail()}
                      disabled={connectingGmail}
                      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                      style={{ background: 'var(--accent)' }}
                    >
                      <Plus size={14} /> {connectingGmail ? 'Waiting for Google sign-in…' : 'Sign in with Google'}
                    </button>
                    {draft.googleOAuthClientId && draft.googleOAuthClientSecret && (
                      <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--success)' }}>
                        <Check size={13} /> OAuth ready
                      </span>
                    )}
                  </div>
                </div>

                {/* Add IMAP / SMTP + Optional CalDAV/ICS */}
                <form
                  onSubmit={(e) => void handleAddImap(e)}
                  className="space-y-3 rounded-xl border p-4"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <h4 className="text-[13.5px] font-semibold">Add IMAP / SMTP Account (+ Optional CalDAV / ICS Calendar)</h4>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      placeholder="Display Name (e.g. Work IMAP)"
                      value={imapName}
                      onChange={(e) => setImapName(e.target.value)}
                      className="rounded-lg border bg-transparent px-3 py-2 text-[12.5px] outline-none"
                      style={{ borderColor: 'var(--border-strong)' }}
                    />
                    <input
                      required
                      type="email"
                      placeholder="Email Address"
                      value={imapEmail}
                      onChange={(e) => setImapEmail(e.target.value)}
                      className="rounded-lg border bg-transparent px-3 py-2 text-[12.5px] outline-none"
                      style={{ borderColor: 'var(--border-strong)' }}
                    />
                    <input
                      required
                      type="password"
                      placeholder="Password / App Password"
                      value={imapPass}
                      onChange={(e) => setImapPass(e.target.value)}
                      className="rounded-lg border bg-transparent px-3 py-2 text-[12.5px] outline-none"
                      style={{ borderColor: 'var(--border-strong)' }}
                    />
                    <div className="flex gap-2">
                      <input
                        required
                        placeholder="IMAP Host (imap.example.com)"
                        value={imapHost}
                        onChange={(e) => setImapHost(e.target.value)}
                        className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-[12.5px] outline-none"
                        style={{ borderColor: 'var(--border-strong)' }}
                      />
                      <input
                        type="number"
                        value={imapPort}
                        onChange={(e) => setImapPort(Number(e.target.value))}
                        className="w-20 rounded-lg border bg-transparent px-2 py-2 text-[12.5px] outline-none"
                        style={{ borderColor: 'var(--border-strong)' }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        placeholder="SMTP Host (optional)"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-[12.5px] outline-none"
                        style={{ borderColor: 'var(--border-strong)' }}
                      />
                      <input
                        type="number"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(Number(e.target.value))}
                        className="w-20 rounded-lg border bg-transparent px-2 py-2 text-[12.5px] outline-none"
                        style={{ borderColor: 'var(--border-strong)' }}
                      />
                    </div>
                    <input
                      placeholder="CalDAV URL (optional two-way calendar)"
                      value={caldavUrl}
                      onChange={(e) => setCaldavUrl(e.target.value)}
                      className="rounded-lg border bg-transparent px-3 py-2 text-[12.5px] outline-none"
                      style={{ borderColor: 'var(--border-strong)' }}
                    />
                  </div>
                  <input
                    placeholder="Read-only ICS Calendar Feed URL (optional)"
                    value={icsFeedUrl}
                    onChange={(e) => setIcsFeedUrl(e.target.value)}
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-[12.5px] outline-none"
                    style={{ borderColor: 'var(--border-strong)' }}
                  />
                  <button
                    type="submit"
                    disabled={addingImap}
                    className="rounded-lg border px-4 py-1.5 text-[12.5px] font-semibold transition hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: 'var(--border-strong)' }}
                  >
                    {addingImap ? 'Testing & Connecting…' : 'Connect IMAP Account'}
                  </button>
                </form>
              </div>
            )}

            {/* AI TAB */}
            {tab === 'ai' && (
              <div className="space-y-5">
                <div
                  className="rounded-xl border p-4 text-[12.5px]"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="font-semibold">Detected Local &amp; Subscription Engines ($0 extra API cost)</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                    <div>Ollama (RTX 5090): {localAI?.ollamaRunning ? `Running (${localAI.ollamaModels.length} models)` : 'Not running'}</div>
                    <div>LM Studio: {localAI?.lmStudioRunning ? `Running (${localAI.lmStudioModels.length} models)` : 'Not running'}</div>
                    <div>Claude CLI (Subscription): {localAI?.claudeCliAvailable ? 'Available' : 'Not found'}</div>
                    <div>Codex CLI (Subscription): {localAI?.codexCliAvailable ? 'Available' : 'Not found'}</div>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[12.5px] font-medium">Active AI Provider</label>
                  <select
                    value={draft.ai.provider}
                    onChange={(e) =>
                      void updateAndSave({
                        ...draft,
                        ai: { ...draft.ai, provider: e.target.value as AIProviderType }
                      })
                    }
                    className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
                  >
                    <option value="ollama">Ollama — Local RTX 5090 ($0, 100% private)</option>
                    <option value="lmstudio">LM Studio — Local ($0, 100% private)</option>
                    <option value="claude-cli">Claude CLI — Existing Subscription ($0 extra API)</option>
                    <option value="codex-cli">Codex CLI — Existing Subscription ($0 extra API)</option>
                    <option value="anthropic">Anthropic API Key (Optional)</option>
                    <option value="gemini">Google Gemini API Key (Optional)</option>
                    <option value="openai">OpenAI API Key (Optional)</option>
                  </select>
                </div>

                {draft.ai.provider === 'ollama' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        Ollama URL
                      </label>
                      <input
                        value={draft.ai.ollamaUrl}
                        onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, ollamaUrl: e.target.value } })}
                        onBlur={() => void saveSettings(draft)}
                        className="w-full rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none"
                        style={{ borderColor: 'var(--border-strong)' }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        Model (e.g. qwen2.5:14b, gemma3:27b)
                      </label>
                      <input
                        value={draft.ai.ollamaModel}
                        onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, ollamaModel: e.target.value } })}
                        onBlur={() => void saveSettings(draft)}
                        className="w-full rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none"
                        style={{ borderColor: 'var(--border-strong)' }}
                      />
                    </div>
                  </div>
                )}

                {['anthropic', 'gemini', 'openai'].includes(draft.ai.provider) && (
                  <div className="space-y-2">
                    <label className="block text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      API Key (stored encrypted in Windows DPAPI)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder={`Paste ${draft.ai.provider} API key…`}
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none"
                        style={{ borderColor: 'var(--border-strong)' }}
                      />
                      <button
                        onClick={async () => {
                          if (!apiKeyInput.trim()) return
                          await window.glassmail.setSecret(`ai_key:${draft.ai.provider}`, apiKeyInput.trim())
                          setApiKeyInput('')
                          showToast(`Saved ${draft.ai.provider} key securely`)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white"
                        style={{ background: 'var(--accent)' }}
                      >
                        <Key size={13} /> Save Key
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* GENERAL / THEMES TAB */}
            {tab === 'general' && (
              <div className="space-y-6">
                <div>
                  <label className="mb-2 block text-[13px] font-semibold">Theme</label>
                  <div className="grid grid-cols-5 gap-2">
                    {(['dark', 'black', 'graphite', 'light', 'paper'] as ThemeId[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => void updateAndSave({ ...draft, theme: t })}
                        className="flex flex-col items-center gap-1.5 rounded-xl border p-3 text-[12px] font-medium capitalize transition"
                        style={{
                          borderColor: draft.theme === t ? 'var(--accent)' : 'var(--border-strong)',
                          background: draft.theme === t ? 'var(--accent-soft)' : 'var(--bg-elevated)'
                        }}
                      >
                        {draft.theme === t && <Check size={13} style={{ color: 'var(--accent-text)' }} />}
                        <span>{t}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[13px] font-semibold">Undo Send Window (seconds)</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={draft.undoSendSeconds}
                    onChange={(e) =>
                      void updateAndSave({ ...draft, undoSendSeconds: Math.max(0, Math.min(30, Number(e.target.value))) })
                    }
                    className="w-28 rounded-lg border bg-transparent px-3 py-1.5 text-[13px] outline-none"
                    style={{ borderColor: 'var(--border-strong)' }}
                  />
                </div>
              </div>
            )}

            {/* PRIVACY TAB */}
            {tab === 'privacy' && (
              <div className="space-y-4">
                <label className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div>
                    <div className="text-[13px] font-semibold">Strip tracking pixels</div>
                    <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      Removes invisible 1×1 open-tracking images before rendering emails.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={draft.privacy.stripTrackingPixels}
                    onChange={(e) =>
                      void updateAndSave({
                        ...draft,
                        privacy: { ...draft.privacy, stripTrackingPixels: e.target.checked }
                      })
                    }
                  />
                </label>

                <label className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div>
                    <div className="text-[13px] font-semibold">Block remote images by default</div>
                    <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      Only load external images when you click Load Images or trust the sender.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={draft.privacy.blockRemoteImages}
                    onChange={(e) =>
                      void updateAndSave({
                        ...draft,
                        privacy: { ...draft.privacy, blockRemoteImages: e.target.checked }
                      })
                    }
                  />
                </label>
              </div>
            )}

            {/* SNIPPETS TAB */}
            {tab === 'snippets' && (
              <div className="space-y-4">
                <div className="space-y-2 rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
                  <input
                    placeholder="Snippet title (e.g. Next week availability)"
                    value={snipTitle}
                    onChange={(e) => setSnipTitle(e.target.value)}
                    className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-[13px] outline-none"
                    style={{ borderColor: 'var(--border-strong)' }}
                  />
                  <textarea
                    rows={3}
                    placeholder="Snippet text…"
                    value={snipBody}
                    onChange={(e) => setSnipBody(e.target.value)}
                    className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-[13px] outline-none"
                    style={{ borderColor: 'var(--border-strong)' }}
                  />
                  <button
                    onClick={async () => {
                      if (!snipTitle.trim() || !snipBody.trim()) return
                      await window.glassmail.saveSnippet({
                        id: `snip-${Date.now()}`,
                        title: snipTitle.trim(),
                        shortcut: '/' + snipTitle.toLowerCase().replace(/\s+/g, ''),
                        body: snipBody.trim()
                      })
                      setSnipTitle('')
                      setSnipBody('')
                      await refreshAll()
                    }}
                    className="rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white"
                    style={{ background: 'var(--accent)' }}
                  >
                    Add snippet
                  </button>
                </div>

                <div className="space-y-2">
                  {snippets.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-start justify-between rounded-xl border p-3"
                      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div>
                        <div className="text-[13px] font-semibold">{s.title}</div>
                        <div className="mt-0.5 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                          {s.body}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          await window.glassmail.deleteSnippet(s.id)
                          await refreshAll()
                        }}
                        className="rounded p-1 hover:bg-[var(--bg-hover)]"
                        style={{ color: 'var(--danger)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MCP AGENTS TAB */}
            {tab === 'mcp' && (
              <div className="space-y-4">
                <label className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div>
                    <div className="text-[13.5px] font-semibold">Allow local AI agents (MCP) to read my mail</div>
                    <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      Strict read-only access for Claude Code, Antigravity, or Cursor. Zero send or delete tools.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={draft.mcp.enabled}
                    onChange={(e) =>
                      void updateAndSave({ ...draft, mcp: { ...draft.mcp, enabled: e.target.checked } })
                    }
                  />
                </label>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
                      MCP Server Configuration (paste into Claude Code / Cursor / Antigravity)
                    </span>
                    <button
                      onClick={() => {
                        void window.glassmail.copyText(mcpConfigJson, 'Copied MCP config JSON')
                        showToast('Copied MCP configuration')
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-medium"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                    >
                      <Copy size={12} /> Copy JSON
                    </button>
                  </div>
                  <pre
                    className="overflow-x-auto rounded-xl border p-3 font-mono text-[11.5px]"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                  >
                    {mcpConfigJson}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
