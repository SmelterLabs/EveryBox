import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, ChevronDown, ChevronRight, Copy, Download, Key, Keyboard, Layout, Mail, Moon, Palette, Plus, RefreshCw, RotateCcw, Shield, Sparkles, Sun, Terminal, Trash2, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { isMac } from '../utils/platform'
import { detectPresetByEmail, MAIL_PROVIDER_PRESETS, type MailProviderPreset } from '../utils/mailPresets'
import {
  SHORTCUT_DEFINITIONS,
  eventToCombo,
  formatComboForDisplay,
  getDefaultShortcut,
  getEffectiveShortcut
} from '../utils/shortcuts'
import type {
  AccountRowStyle,
  AccountSwitchBehavior,
  AIProviderType,
  AppSettings,
  DecisionAISettings,
  DecisionProvider,
  DecisionProviderTestResult,
  DiscoveredModel,
  ListDensity,
  LocalAIStatus,
  OutlookStoreInfo,
  ReaderWidth,
  ShortcutActionId,
  ThemeId,
  UIThemeId
} from '../../../shared/types'

function formatModelLabel(m: DiscoveredModel): string {
  const parts = [m.id]
  if (m.parameterSize) parts.push(m.parameterSize)
  if (m.sizeBytes && m.sizeBytes > 0) {
    const gb = m.sizeBytes / (1024 * 1024 * 1024)
    parts.push(`${gb >= 10 ? gb.toFixed(1) : gb.toFixed(2)} GB`)
  }
  return parts.join(' · ')
}

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
    showToast,
    appVersion,
    updateStatus,
    checkingForUpdates,
    checkForUpdates
  } = useAppStore()

  const [tab, setTab] = useState(settingsInitialTab)
  const [appearanceExpanded, setAppearanceExpanded] = useState(true)
  const [draft, setDraft] = useState<AppSettings | null>(settings)

  // Gmail OAuth
  const [connectingGmail, setConnectingGmail] = useState(false)
  const [showOAuthFields, setShowOAuthFields] = useState(false)

  // Add IMAP form
  const [showImapForm, setShowImapForm] = useState(false)
  const [selectedPresetId, setSelectedPresetId] = useState<string>('custom')
  const [showImapAdvanced, setShowImapAdvanced] = useState(false)
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

  // Classic Outlook Desktop local sync
  const [scanningOutlookStores, setScanningOutlookStores] = useState(false)
  const [outlookStores, setOutlookStores] = useState<OutlookStoreInfo[] | null>(null)
  const [outlookStoreError, setOutlookStoreError] = useState<string | null>(null)
  const [connectingOutlookEmail, setConnectingOutlookEmail] = useState<string | null>(null)

  // Local AI detection
  const [localAI, setLocalAI] = useState<LocalAIStatus | null>(null)
  const [scanningAI, setScanningAI] = useState(false)
  const [showCustomUrls, setShowCustomUrls] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')

  // Fast Sorter (Decision AI)
  const [decisionApiKeyInput, setDecisionApiKeyInput] = useState('')
  const [savingDecisionKey, setSavingDecisionKey] = useState(false)
  const [testingDecision, setTestingDecision] = useState(false)
  const [decisionTestResult, setDecisionTestResult] = useState<DecisionProviderTestResult | null>(null)

  // Snippets
  const [snipTitle, setSnipTitle] = useState('')
  const [snipBody, setSnipBody] = useState('')

  // MCP config
  const [mcpConfigJson, setMcpConfigJson] = useState('')

  // Shortcut recording
  const [recordingShortcutId, setRecordingShortcutId] = useState<ShortcutActionId | null>(null)

  useEffect(() => {
    if (!recordingShortcutId || !draft) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecordingShortcutId(null)
        return
      }
      const combo = eventToCombo(e)
      if (!combo) return
      const next: AppSettings = {
        ...draft,
        shortcuts: { ...(draft.shortcuts || {}), [recordingShortcutId]: combo }
      }
      setRecordingShortcutId(null)
      setDraft(next)
      void saveSettings(next)
      showToast(`Shortcut updated to ${formatComboForDisplay(combo)}`)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recordingShortcutId, draft, saveSettings, showToast])

  const runLocalAIDetection = useCallback(
    async (overrides?: { localOpenAiUrl?: string; ollamaUrl?: string; lmStudioUrl?: string }) => {
      setScanningAI(true)
      try {
        const res = await window.glassmail.detectLocalAI(overrides)
        setLocalAI(res)
        // Auto-select first discovered model if saved model is empty or no longer present
        setDraft((prev) => {
          if (!prev) return prev
          let changed = false
          const nextAi = { ...prev.ai }
          if (res.localServerRunning && res.localServerModels.length > 0) {
            const ids = res.localServerModels.map((m) => m.id)
            if (!nextAi.localOpenAiModel || !ids.includes(nextAi.localOpenAiModel)) {
              nextAi.localOpenAiModel = ids[0]
              changed = true
            }
            if (!nextAi.localOpenAiUrl) {
              nextAi.localOpenAiUrl = res.localServerUrlUsed
              changed = true
            }
          }
          if (res.ollamaRunning && res.ollamaModels.length > 0) {
            const ids = res.ollamaModels.map((m) => m.id)
            if (!nextAi.ollamaModel || !ids.includes(nextAi.ollamaModel)) {
              nextAi.ollamaModel = ids[0]
              changed = true
            }
          }
          if (res.lmStudioRunning && res.lmStudioModels.length > 0) {
            const ids = res.lmStudioModels.map((m) => m.id)
            if (!nextAi.lmStudioModel || !ids.includes(nextAi.lmStudioModel)) {
              nextAi.lmStudioModel = ids[0]
              changed = true
            }
          }
          if (changed) {
            const next = { ...prev, ai: nextAi }
            void saveSettings(next)
            return next
          }
          return prev
        })
      } finally {
        setScanningAI(false)
      }
    },
    [saveSettings]
  )

  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (settingsOpen && !wasOpenRef.current) {
      setTab(settingsInitialTab)
      setDraft(settings ? JSON.parse(JSON.stringify(settings)) : null)
      void runLocalAIDetection(
        settings
          ? {
              localOpenAiUrl: settings.ai.localOpenAiUrl,
              ollamaUrl: settings.ai.ollamaUrl,
              lmStudioUrl: settings.ai.lmStudioUrl
            }
          : undefined
      )
      void window.glassmail.getMcpConfig().then((cfg) =>
        setMcpConfigJson(JSON.stringify({ mcpServers: { everybox: cfg } }, null, 2))
      )
    }
    wasOpenRef.current = settingsOpen
  }, [settingsOpen, settingsInitialTab, settings, runLocalAIDetection])

  useEffect(() => {
    if (settingsOpen && settings) {
      setDraft(JSON.parse(JSON.stringify(settings)))
    }
  }, [settingsOpen, settings])

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

  const applyImapPreset = (preset: MailProviderPreset) => {
    setSelectedPresetId(preset.id)
    setShowImapForm(true)
    setImapHost(preset.imapHost)
    setImapPort(preset.imapPort)
    setSmtpHost(preset.smtpHost)
    setSmtpPort(preset.smtpPort)
    if (preset.caldavUrl !== undefined) {
      setCaldavUrl(preset.caldavUrl)
    } else {
      setCaldavUrl('')
    }
    if (!imapName && preset.id !== 'custom') {
      setImapName(preset.label)
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
        setShowImapForm(false)
        setShowImapAdvanced(false)
        await refreshAll()
      } else {
        showToast(res.error || 'Could not connect IMAP account')
      }
    } finally {
      setAddingImap(false)
    }
  }

  const tabs: { id: typeof tab; label: string; icon: React.ReactNode; hasSubmenu?: boolean }[] = [
    { id: 'accounts', label: 'Accounts', icon: <Mail size={14} className="shrink-0" /> },
    { id: 'ai', label: 'AI Providers', icon: <Sparkles size={14} className="shrink-0" /> },
    { id: 'general', label: 'Appearance', icon: <Palette size={14} className="shrink-0" />, hasSubmenu: true },
    { id: 'shortcuts', label: 'Shortcut Keys', icon: <Keyboard size={14} className="shrink-0" /> },
    { id: 'privacy', label: 'Privacy', icon: <Shield size={14} className="shrink-0" /> },
    { id: 'snippets', label: 'Snippets', icon: <Plus size={14} className="shrink-0" /> },
    { id: 'mcp', label: 'MCP Agents', icon: <Terminal size={14} className="shrink-0" /> }
  ]
  const activeTabLabel =
    tab === 'themes' ? 'Appearance › Themes' : tabs.find((t) => t.id === tab)?.label || tab

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6" onClick={closeSettings}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[620px] w-full max-w-[820px] overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
      >
        {/* Settings Sidebar */}
        <div
          className="w-52 shrink-0 border-r p-3"
          style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="mb-3 px-2.5 text-[13px] font-semibold">Settings</div>
          <div className="space-y-0.5">
            {tabs.map((t) => (
              <div key={t.id}>
                <button
                  onClick={() => {
                    if (t.hasSubmenu) {
                      if (tab === 'general') {
                        setAppearanceExpanded((v) => !v)
                      } else {
                        setTab(t.id)
                        setAppearanceExpanded(true)
                      }
                    } else {
                      setTab(t.id)
                    }
                  }}
                  className="flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)]"
                  style={{
                    background: tab === t.id ? 'var(--bg-selected)' : undefined,
                    color: tab === t.id ? 'var(--accent-text)' : 'var(--text-secondary)'
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    {t.icon}
                    <span className="truncate">{t.label}</span>
                  </span>
                  {t.hasSubmenu && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        setAppearanceExpanded((v) => !v)
                      }}
                      className="rounded p-0.5 hover:bg-[var(--bg-hover)]"
                    >
                      {appearanceExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </span>
                  )}
                </button>
                {t.hasSubmenu && appearanceExpanded && (
                  <div className="mt-0.5 space-y-0.5 pl-4">
                    <button
                      onClick={() => setTab('themes')}
                      className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
                      style={{
                        background: tab === 'themes' ? 'var(--bg-selected)' : undefined,
                        color: tab === 'themes' ? 'var(--accent-text)' : 'var(--text-secondary)'
                      }}
                    >
                      <Layout size={13} className="shrink-0" />
                      <span className="truncate">Themes</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Settings Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div
            className="flex items-center justify-between border-b px-6 py-3.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <h3 className="text-[15px] font-semibold">{activeTabLabel}</h3>
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

                {/* Connect Microsoft 365 / Exchange via Classic Outlook Desktop */}
                <div
                  className="space-y-3 rounded-xl border p-4"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-[13.5px] font-semibold">Connect Microsoft 365 / Exchange (via Classic Outlook)</h4>
                      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        Sync corporate Exchange or Microsoft 365 accounts signed into Classic Outlook Desktop — full Mail, Calendar, and AI with zero IT approval.
                      </p>
                    </div>
                    {outlookStores && (
                      <button
                        type="button"
                        onClick={() => {
                          setOutlookStores(null)
                          setOutlookStoreError(null)
                        }}
                        className="shrink-0 text-[11.5px] hover:underline"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Hide
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={scanningOutlookStores}
                      onClick={async () => {
                        setScanningOutlookStores(true)
                        setOutlookStoreError(null)
                        try {
                          const res = await window.glassmail.listOutlookStores()
                          if (res.available) {
                            setOutlookStores(res.stores)
                            if (res.stores.length === 0) {
                              setOutlookStoreError('No mail accounts found in Classic Outlook Desktop.')
                            }
                          } else {
                            setOutlookStoreError(res.error || 'Could not detect Classic Outlook Desktop.')
                          }
                        } finally {
                          setScanningOutlookStores(false)
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[12.5px] font-semibold transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
                      style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-main)' }}
                    >
                      <Plus size={14} /> {scanningOutlookStores ? 'Scanning Classic Outlook…' : 'Scan Classic Outlook Accounts'}
                    </button>
                  </div>

                  {outlookStoreError && (
                    <div className="rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                      {outlookStoreError}
                    </div>
                  )}

                  {outlookStores && outlookStores.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {outlookStores.map((st) => {
                        const alreadyConnected = accounts.some(
                          (a) => !a.isDemo && a.email.toLowerCase() === st.email.toLowerCase()
                        )
                        const isConnecting = connectingOutlookEmail === st.email
                        return (
                          <div
                            key={st.storeId}
                            className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                            style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
                          >
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-semibold">
                                {st.email}{' '}
                                <span className="text-[11px] font-normal" style={{ color: 'var(--text-muted)' }}>
                                  ({st.storeType})
                                </span>
                              </div>
                              <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                                {st.inboxCount} in Inbox · {st.unreadCount} unread
                                {st.calendarPath ? ' · Calendar detected' : ''}
                              </div>
                            </div>
                            {alreadyConnected ? (
                              <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium" style={{ color: 'var(--success)' }}>
                                <Check size={13} /> Connected
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={Boolean(connectingOutlookEmail)}
                                onClick={async () => {
                                  setConnectingOutlookEmail(st.email)
                                  try {
                                    const domainLabel = st.email.split('@')[1]?.split('.')[0] || st.displayName
                                    const friendlyName = domainLabel.charAt(0).toUpperCase() + domainLabel.slice(1)
                                    const res = await window.glassmail.connectOutlookLocalAccount({
                                      name: friendlyName,
                                      email: st.email,
                                      storeName: st.displayName,
                                      calendarPath: st.calendarPath
                                    })
                                    if (res.ok) {
                                      await refreshAll()
                                      showToast(`Connected ${st.email} — syncing mail & calendar…`)
                                    } else {
                                      showToast(res.error || 'Could not connect Outlook account')
                                    }
                                  } finally {
                                    setConnectingOutlookEmail(null)
                                  }
                                }}
                                className="shrink-0 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                                style={{ background: 'var(--accent)' }}
                              >
                                {isConnecting ? 'Connecting…' : 'Connect'}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Connect IMAP / SMTP Account with 1-Click Provider Presets */}
                <div
                  className="space-y-3 rounded-xl border p-4"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-[13.5px] font-semibold">Connect iCloud, Yahoo, Fastmail, Zoho &amp; IMAP</h4>
                      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        Pick a provider below to pre-fill server settings, or enter any custom IMAP / SMTP server.
                      </p>
                    </div>
                    {showImapForm && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowImapForm(false)
                          setShowImapAdvanced(false)
                        }}
                        className="shrink-0 text-[11.5px] hover:underline"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {/* 1-Click Provider Preset Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {MAIL_PROVIDER_PRESETS.map((preset) => {
                      const active = showImapForm && selectedPresetId === preset.id
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyImapPreset(preset)}
                          className="rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]"
                          style={{
                            borderColor: active ? 'var(--accent)' : 'var(--border-strong)',
                            background: active ? 'var(--accent-soft)' : 'var(--bg-main)',
                            color: active ? 'var(--accent-text)' : 'var(--text-primary)'
                          }}
                        >
                          {preset.label}
                        </button>
                      )
                    })}
                  </div>

                  {showImapForm && (() => {
                    const activePreset = MAIL_PROVIDER_PRESETS.find((p) => p.id === selectedPresetId)
                    return (
                      <form onSubmit={(e) => void handleAddImap(e)} className="space-y-3 pt-1">
                        {activePreset?.hint && (
                          <div
                            className="rounded-lg border px-3 py-2 text-[11.5px]"
                            style={{
                              background: 'var(--bg-main)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-secondary)'
                            }}
                          >
                            {activePreset.hint}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2.5">
                          <input
                            placeholder="Display Name (e.g. iCloud Mail)"
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
                            onChange={(e) => {
                              const nextEmail = e.target.value
                              setImapEmail(nextEmail)
                              if (!imapHost || selectedPresetId === 'custom') {
                                const detected = detectPresetByEmail(nextEmail)
                                if (detected) {
                                  setSelectedPresetId(detected.id)
                                  setImapHost(detected.imapHost)
                                  setImapPort(detected.imapPort)
                                  setSmtpHost(detected.smtpHost)
                                  setSmtpPort(detected.smtpPort)
                                  if (detected.caldavUrl) setCaldavUrl(detected.caldavUrl)
                                  if (!imapName) setImapName(detected.label)
                                }
                              }
                            }}
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
                        </div>

                        <div>
                          <button
                            type="button"
                            onClick={() => setShowImapAdvanced((v) => !v)}
                            className="inline-flex items-center gap-1 text-[11.5px] font-medium hover:underline"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {showImapAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            <span>Optional: SMTP, CalDAV &amp; ICS calendar sync</span>
                          </button>

                          {showImapAdvanced && (
                            <div className="mt-2.5 space-y-2.5">
                              <div className="grid grid-cols-2 gap-2.5">
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
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 pt-0.5">
                          <button
                            type="submit"
                            disabled={addingImap}
                            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                            style={{ background: 'var(--accent)' }}
                          >
                            {addingImap ? 'Testing & Connecting…' : `Connect ${activePreset && activePreset.id !== 'custom' ? activePreset.label : 'IMAP Account'}`}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowImapForm(false)
                              setShowImapAdvanced(false)
                            }}
                            className="rounded-lg px-3 py-2 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)]"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* AI TAB */}
            {tab === 'ai' && (() => {
              const gpuLabel = localAI?.gpuName ? ` · ${localAI.gpuName}` : ''
              const localProviders: {
                id: AIProviderType
                name: string
                available: boolean
                statusBadge: string
                statusTone: 'ok' | 'warn' | 'off'
                subtitle: string
              }[] = [
                {
                  id: 'local-openai',
                  name: `${localAI?.localServerName || 'Local Server (llama.cpp)'}${gpuLabel}`,
                  available: Boolean(localAI?.localServerRunning),
                  statusBadge: !localAI
                    ? 'Scanning…'
                    : localAI.localServerRunning
                      ? `Running · ${localAI.localServerModels.length} model${localAI.localServerModels.length === 1 ? '' : 's'}`
                      : 'Not running',
                  statusTone: localAI?.localServerRunning ? 'ok' : 'off',
                  subtitle: !localAI
                    ? 'Scanning local OpenAI-compatible ports (llama.cpp / vLLM)…'
                    : localAI.localServerRunning
                      ? `Local ($0, 100% private) · Detected at ${localAI.localServerUrlUsed}`
                      : 'No local OpenAI-compatible server (llama.cpp / vLLM) detected on this PC.'
                },
                {
                  id: 'ollama',
                  name: `Ollama${gpuLabel}`,
                  available: Boolean(localAI?.ollamaRunning),
                  statusBadge: !localAI
                    ? 'Scanning…'
                    : localAI.ollamaRunning
                      ? `Running · ${localAI.ollamaModels.length} model${localAI.ollamaModels.length === 1 ? '' : 's'}`
                      : localAI.ollamaInstalled
                        ? 'Installed · Not running'
                        : 'Not installed',
                  statusTone: localAI?.ollamaRunning ? 'ok' : localAI?.ollamaInstalled ? 'warn' : 'off',
                  subtitle: !localAI
                    ? 'Checking local Ollama server…'
                    : localAI.ollamaRunning
                      ? `Local ($0, 100% private) · Detected at ${localAI.ollamaUrlUsed}`
                      : localAI.ollamaInstalled
                        ? `Ollama is installed, but not running at ${localAI.ollamaUrlUsed}. Start Ollama and click Refresh.`
                        : 'You can run local models privately ($0) with Ollama, but it is not installed on this PC.'
                },
                {
                  id: 'lmstudio',
                  name: `LM Studio${gpuLabel}`,
                  available: Boolean(localAI?.lmStudioRunning),
                  statusBadge: !localAI
                    ? 'Scanning…'
                    : localAI.lmStudioRunning
                      ? `Running · ${localAI.lmStudioModels.length} model${localAI.lmStudioModels.length === 1 ? '' : 's'}`
                      : localAI.lmStudioInstalled
                        ? 'Installed · Server off'
                        : 'Not installed',
                  statusTone: localAI?.lmStudioRunning ? 'ok' : localAI?.lmStudioInstalled ? 'warn' : 'off',
                  subtitle: !localAI
                    ? 'Checking local LM Studio server…'
                    : localAI.lmStudioRunning
                      ? `Local ($0, 100% private) · Detected at ${localAI.lmStudioUrlUsed}`
                      : localAI.lmStudioInstalled
                        ? `LM Studio is installed, but its Local Server is not running at ${localAI.lmStudioUrlUsed}.`
                        : 'You can run local models privately ($0) with LM Studio, but it is not installed on this PC.'
                },
                {
                  id: 'claude-cli',
                  name: 'Claude CLI',
                  available: Boolean(localAI?.claudeCliAvailable),
                  statusBadge: !localAI ? 'Scanning…' : localAI.claudeCliAvailable ? 'Available' : 'Not installed',
                  statusTone: localAI?.claudeCliAvailable ? 'ok' : 'off',
                  subtitle: localAI?.claudeCliAvailable
                    ? 'Detected on this PC · Uses your existing Claude subscription ($0 extra API)'
                    : 'Not installed on this PC. Uses your existing Claude subscription when installed.'
                },
                {
                  id: 'codex-cli',
                  name: 'Codex CLI',
                  available: Boolean(localAI?.codexCliAvailable),
                  statusBadge: !localAI ? 'Scanning…' : localAI.codexCliAvailable ? 'Available' : 'Not installed',
                  statusTone: localAI?.codexCliAvailable ? 'ok' : 'off',
                  subtitle: localAI?.codexCliAvailable
                    ? 'Detected on this PC · Uses your existing Codex subscription ($0 extra API)'
                    : 'Not installed on this PC. Uses your existing Codex subscription when installed.'
                },
                {
                  id: 'antigravity-cli',
                  name: 'Antigravity CLI (Gemini)',
                  available: Boolean(localAI?.antigravityCliAvailable),
                  statusBadge: !localAI
                    ? 'Scanning…'
                    : localAI.antigravityCliAvailable
                      ? `Available · ${localAI.antigravityCliModels.length} models`
                      : 'Not installed',
                  statusTone: localAI?.antigravityCliAvailable ? 'ok' : 'off',
                  subtitle: localAI?.antigravityCliAvailable
                    ? 'Detected on this PC · Uses your Antigravity / Gemini CLI ($0 extra API)'
                    : 'Not installed on this PC. Install the Antigravity CLI (agy) to use Gemini & Antigravity models.'
                }
              ]

              const cloudProviders: {
                id: 'anthropic' | 'gemini' | 'openai' | 'grok'
                name: string
                keySaved: boolean
              }[] = [
                { id: 'anthropic', name: 'Anthropic API', keySaved: Boolean(localAI?.apiKeysConfigured.anthropic) },
                { id: 'gemini', name: 'Google Gemini API', keySaved: Boolean(localAI?.apiKeysConfigured.gemini) },
                { id: 'openai', name: 'OpenAI API', keySaved: Boolean(localAI?.apiKeysConfigured.openai) },
                { id: 'grok', name: 'Grok (xAI API)', keySaved: Boolean(localAI?.apiKeysConfigured.grok) }
              ]

              const activeLocalEntry = localProviders.find((p) => p.id === draft.ai.provider)
              const activeProviderUnavailable = Boolean(localAI && activeLocalEntry && !activeLocalEntry.available)

              return (
                <div className="space-y-5">
                  {/* Discovery header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-semibold">AI Providers on This PC</div>
                      <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                        {localAI?.gpuName
                          ? `Detected GPU: ${localAI.gpuName} · Only available local engines can be selected.`
                          : 'Only engines detected on this PC can be selected.'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void runLocalAIDetection({
                          localOpenAiUrl: draft.ai.localOpenAiUrl,
                          ollamaUrl: draft.ai.ollamaUrl,
                          lmStudioUrl: draft.ai.lmStudioUrl
                        })
                      }
                      disabled={scanningAI}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
                      style={{ borderColor: 'var(--border-strong)' }}
                    >
                      <RefreshCw size={13} className={scanningAI ? 'animate-spin' : ''} />
                      {scanningAI ? 'Scanning…' : 'Refresh'}
                    </button>
                  </div>

                  {/* Warning if previously saved provider is currently unavailable */}
                  {activeProviderUnavailable && activeLocalEntry && (
                    <div
                      className="flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[12px]"
                      style={{
                        background: 'var(--bg-elevated)',
                        borderColor: 'var(--warning, #d97706)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      <AlertCircle size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--warning, #f59e0b)' }} />
                      <div>
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {activeLocalEntry.name} isn&apos;t currently available.
                        </span>{' '}
                        {activeLocalEntry.subtitle} Or pick an available provider below.
                      </div>
                    </div>
                  )}

                  {/* Local & Subscription Providers ($0) */}
                  <div className="space-y-2">
                    <div className="text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                      Local &amp; Subscription ($0 extra API cost)
                    </div>
                    <div className="space-y-1.5">
                      {localProviders.map((p) => {
                        const selected = draft.ai.provider === p.id
                        const disabled = !p.available
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              if (disabled) return
                              const nextAi = { ...draft.ai, provider: p.id }
                              if (p.id === 'local-openai' && localAI && localAI.localServerModels.length > 0) {
                                const ids = localAI.localServerModels.map((m) => m.id)
                                if (!nextAi.localOpenAiModel || !ids.includes(nextAi.localOpenAiModel)) {
                                  nextAi.localOpenAiModel = ids[0]
                                }
                                if (!nextAi.localOpenAiUrl) {
                                  nextAi.localOpenAiUrl = localAI.localServerUrlUsed
                                }
                              }
                              if (p.id === 'ollama' && localAI && localAI.ollamaModels.length > 0) {
                                const ids = localAI.ollamaModels.map((m) => m.id)
                                if (!nextAi.ollamaModel || !ids.includes(nextAi.ollamaModel)) {
                                  nextAi.ollamaModel = ids[0]
                                }
                              }
                              if (p.id === 'lmstudio' && localAI && localAI.lmStudioModels.length > 0) {
                                const ids = localAI.lmStudioModels.map((m) => m.id)
                                if (!nextAi.lmStudioModel || !ids.includes(nextAi.lmStudioModel)) {
                                  nextAi.lmStudioModel = ids[0]
                                }
                              }
                              void updateAndSave({ ...draft, ai: nextAi })
                            }}
                            className="flex w-full items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-55"
                            style={{
                              borderColor:
                                selected && !disabled
                                  ? 'var(--accent)'
                                  : selected && disabled
                                    ? 'var(--warning, #d97706)'
                                    : 'var(--border-subtle)',
                              background: selected && !disabled ? 'var(--accent-soft)' : 'var(--bg-elevated)'
                            }}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-[13px] font-semibold">
                                <span>{p.name}</span>
                                {selected && !disabled && <Check size={13} style={{ color: 'var(--accent-text)' }} />}
                              </div>
                              <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                                {p.subtitle}
                              </div>
                            </div>
                            <span
                              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={{
                                background:
                                  p.statusTone === 'ok'
                                    ? 'rgba(52, 199, 123, 0.14)'
                                    : p.statusTone === 'warn'
                                      ? 'rgba(245, 184, 65, 0.16)'
                                      : 'rgba(150, 150, 150, 0.14)',
                                color:
                                  p.statusTone === 'ok'
                                    ? 'var(--success)'
                                    : p.statusTone === 'warn'
                                      ? '#f5b841'
                                      : 'var(--text-muted)'
                              }}
                            >
                              {p.statusBadge}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Discovered Local Server (llama.cpp / OpenAI-compatible) Model Picker */}
                  {draft.ai.provider === 'local-openai' && localAI?.localServerRunning && (
                    <div
                      className="space-y-2.5 rounded-xl border p-4"
                      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[12.5px] font-semibold">
                          {localAI.localServerName || 'Local Server'} Model (Discovered)
                        </label>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {localAI.localServerModels.length} available at {localAI.localServerUrlUsed}
                        </span>
                      </div>
                      {localAI.localServerModels.length > 0 ? (
                        <select
                          value={
                            localAI.localServerModels.some((m) => m.id === draft.ai.localOpenAiModel)
                              ? draft.ai.localOpenAiModel
                              : localAI.localServerModels[0].id
                          }
                          onChange={(e) =>
                            void updateAndSave({
                              ...draft,
                              ai: {
                                ...draft.ai,
                                localOpenAiModel: e.target.value,
                                localOpenAiUrl: draft.ai.localOpenAiUrl || localAI.localServerUrlUsed
                              }
                            })
                          }
                          className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                          style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                        >
                          {localAI.localServerModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {formatModelLabel(m)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                          Server is running, but no models were reported. Click Refresh after loading a model.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Discovered Ollama Model Picker (zero hand-typing) */}
                  {draft.ai.provider === 'ollama' && localAI?.ollamaRunning && (
                    <div
                      className="space-y-2.5 rounded-xl border p-4"
                      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[12.5px] font-semibold">Ollama Model (Discovered)</label>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {localAI.ollamaModels.length} installed at {localAI.ollamaUrlUsed}
                        </span>
                      </div>
                      {localAI.ollamaModels.length > 0 ? (
                        <select
                          value={
                            localAI.ollamaModels.some((m) => m.id === draft.ai.ollamaModel)
                              ? draft.ai.ollamaModel
                              : localAI.ollamaModels[0].id
                          }
                          onChange={(e) =>
                            void updateAndSave({
                              ...draft,
                              ai: { ...draft.ai, ollamaModel: e.target.value }
                            })
                          }
                          className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                          style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                        >
                          {localAI.ollamaModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {formatModelLabel(m)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                          Ollama is running, but no models were found. Pull a model in Ollama, then click Refresh.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Discovered LM Studio Model Picker (zero hand-typing) */}
                  {draft.ai.provider === 'lmstudio' && localAI?.lmStudioRunning && (
                    <div
                      className="space-y-2.5 rounded-xl border p-4"
                      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[12.5px] font-semibold">LM Studio Model (Discovered)</label>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {localAI.lmStudioModels.length} loaded at {localAI.lmStudioUrlUsed}
                        </span>
                      </div>
                      {localAI.lmStudioModels.length > 0 ? (
                        <select
                          value={
                            localAI.lmStudioModels.some((m) => m.id === draft.ai.lmStudioModel)
                              ? draft.ai.lmStudioModel
                              : localAI.lmStudioModels[0].id
                          }
                          onChange={(e) =>
                            void updateAndSave({
                              ...draft,
                              ai: { ...draft.ai, lmStudioModel: e.target.value }
                            })
                          }
                          className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                          style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                        >
                          {localAI.lmStudioModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {formatModelLabel(m)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                          LM Studio server is running, but no model is loaded. Load a model in LM Studio, then click Refresh.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Claude CLI Model Picker */}
                  {draft.ai.provider === 'claude-cli' && localAI?.claudeCliAvailable && (
                    <div
                      className="space-y-2 rounded-xl border p-4"
                      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[12.5px] font-semibold">Claude CLI Model</label>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          Defaults to Sonnet for fast, high-quota email work
                        </span>
                      </div>
                      <select
                        value={draft.ai.claudeCliModel || 'sonnet'}
                        onChange={(e) =>
                          void updateAndSave({
                            ...draft,
                            ai: { ...draft.ai, claudeCliModel: e.target.value }
                          })
                        }
                        className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                        style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                      >
                        <option value="sonnet">
                          Sonnet{localAI.claudeCliTierVersions?.sonnet ? ` ${localAI.claudeCliTierVersions.sonnet}` : ''} — Recommended (auto-updates to latest Sonnet)
                        </option>
                        <option value="haiku">
                          Haiku{localAI.claudeCliTierVersions?.haiku ? ` ${localAI.claudeCliTierVersions.haiku}` : ''} — Fastest &amp; lightest (auto-updates to latest Haiku)
                        </option>
                        <option value="opus">
                          Opus{localAI.claudeCliTierVersions?.opus ? ` ${localAI.claudeCliTierVersions.opus}` : ''} — Deepest reasoning (auto-updates to latest Opus)
                        </option>
                        <option value="default">CLI Default (uses your local Claude CLI setting)</option>
                      </select>
                    </div>
                  )}

                  {/* Codex CLI Model Picker (live from Codex CLI's local model catalog) */}
                  {draft.ai.provider === 'codex-cli' && localAI?.codexCliAvailable && (
                    <div
                      className="space-y-2 rounded-xl border p-4"
                      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[12.5px] font-semibold">Codex CLI Model (Discovered)</label>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {localAI.codexCliModels.length > 0
                            ? `${localAI.codexCliModels.length} live models from Codex CLI`
                            : 'Auto-tracks Codex CLI default'}
                        </span>
                      </div>
                      <select
                        value={draft.ai.codexCliModel || 'default'}
                        onChange={(e) =>
                          void updateAndSave({
                            ...draft,
                            ai: { ...draft.ai, codexCliModel: e.target.value }
                          })
                        }
                        className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                        style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                      >
                        <option value="default">CLI Default (auto-updates with Codex CLI)</option>
                        {localAI.codexCliModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label && m.label !== m.id ? `${m.label} (${m.id})` : m.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Antigravity CLI Model Picker (live from `agy models`) */}
                  {draft.ai.provider === 'antigravity-cli' && localAI?.antigravityCliAvailable && (
                    <div
                      className="space-y-2 rounded-xl border p-4"
                      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[12.5px] font-semibold">Antigravity / Gemini Model (Discovered)</label>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {localAI.antigravityCliModels.length > 0
                            ? `${localAI.antigravityCliModels.length} live models from agy CLI`
                            : 'Auto-tracks Antigravity CLI default'}
                        </span>
                      </div>
                      <select
                        value={draft.ai.antigravityCliModel || 'default'}
                        onChange={(e) =>
                          void updateAndSave({
                            ...draft,
                            ai: { ...draft.ai, antigravityCliModel: e.target.value }
                          })
                        }
                        className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                        style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                      >
                        <option value="default">CLI Default (auto-updates with Antigravity CLI)</option>
                        {localAI.antigravityCliModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label && m.label !== m.id ? `${m.label} (${m.id})` : m.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Optional custom server URLs (collapsed by default — only needed for custom port / LAN server) */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowCustomUrls((v) => !v)}
                      className="text-[11.5px] font-medium hover:underline"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {showCustomUrls ? 'Hide custom local server URLs' : 'Using a custom port or remote Ollama / LM Studio server?'}
                    </button>
                    {showCustomUrls && (
                      <div
                        className="mt-2 grid grid-cols-2 gap-3 rounded-xl border p-3.5"
                        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                      >
                        <div>
                          <label className="mb-1 block text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                            Ollama URL (default: http://localhost:11434)
                          </label>
                          <input
                            value={draft.ai.ollamaUrl}
                            onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, ollamaUrl: e.target.value } })}
                            onBlur={() => {
                              void saveSettings(draft)
                              void runLocalAIDetection({
                                ollamaUrl: draft.ai.ollamaUrl,
                                lmStudioUrl: draft.ai.lmStudioUrl
                              })
                            }}
                            className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-[12.5px] outline-none"
                            style={{ borderColor: 'var(--border-strong)' }}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                            LM Studio URL (default: http://localhost:1234)
                          </label>
                          <input
                            value={draft.ai.lmStudioUrl}
                            onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, lmStudioUrl: e.target.value } })}
                            onBlur={() => {
                              void saveSettings(draft)
                              void runLocalAIDetection({
                                ollamaUrl: draft.ai.ollamaUrl,
                                lmStudioUrl: draft.ai.lmStudioUrl
                              })
                            }}
                            className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-[12.5px] outline-none"
                            style={{ borderColor: 'var(--border-strong)' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cloud API Providers (Optional) */}
                  <div className="space-y-2">
                    <div className="text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                      Cloud API Keys (Optional)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {cloudProviders.map((c) => {
                        const selected = draft.ai.provider === c.id
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              void updateAndSave({
                                ...draft,
                                ai: { ...draft.ai, provider: c.id }
                              })
                            }
                            className="flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition hover:bg-[var(--bg-hover)]"
                            style={{
                              borderColor: selected ? 'var(--accent)' : 'var(--border-subtle)',
                              background: selected ? 'var(--accent-soft)' : 'var(--bg-elevated)'
                            }}
                          >
                            <div className="flex w-full items-center justify-between text-[12.5px] font-semibold">
                              <span>{c.name}</span>
                              {selected && <Check size={13} style={{ color: 'var(--accent-text)' }} />}
                            </div>
                            <span
                              className="text-[11px]"
                              style={{ color: c.keySaved ? 'var(--success)' : 'var(--text-muted)' }}
                            >
                              {c.keySaved ? 'API key saved' : 'Requires API key'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {['anthropic', 'gemini', 'openai', 'grok'].includes(draft.ai.provider) && (() => {
                    const cloudKey = draft.ai.provider as 'anthropic' | 'gemini' | 'openai' | 'grok'
                    const discoveredCloud = localAI?.cloudModels?.[cloudKey] || []
                    const currentCloudModel =
                      cloudKey === 'anthropic'
                        ? draft.ai.anthropicModel
                        : cloudKey === 'gemini'
                          ? draft.ai.geminiModel
                          : cloudKey === 'grok'
                            ? draft.ai.grokModel || 'grok-3-mini'
                            : draft.ai.openaiModel
                    return (
                      <div className="space-y-3">
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
                                void runLocalAIDetection({
                                  localOpenAiUrl: draft.ai.localOpenAiUrl,
                                  ollamaUrl: draft.ai.ollamaUrl,
                                  lmStudioUrl: draft.ai.lmStudioUrl
                                })
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white"
                              style={{ background: 'var(--accent)' }}
                            >
                              <Key size={13} /> Save Key
                            </button>
                          </div>
                        </div>

                        {discoveredCloud.length > 0 && (
                          <div
                            className="space-y-2 rounded-xl border p-4"
                            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                          >
                            <div className="flex items-center justify-between">
                              <label className="text-[12.5px] font-semibold capitalize">
                                {cloudKey} Model (Live from API)
                              </label>
                              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                {discoveredCloud.length} models available
                              </span>
                            </div>
                            <select
                              value={
                                discoveredCloud.some((m) => m.id === currentCloudModel)
                                  ? currentCloudModel
                                  : discoveredCloud[0].id
                              }
                              onChange={(e) => {
                                const val = e.target.value
                                const patch =
                                  cloudKey === 'anthropic'
                                    ? { anthropicModel: val }
                                    : cloudKey === 'gemini'
                                      ? { geminiModel: val }
                                      : cloudKey === 'grok'
                                        ? { grokModel: val }
                                        : { openaiModel: val }
                                void updateAndSave({ ...draft, ai: { ...draft.ai, ...patch } })
                              }}
                              className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                              style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                            >
                              {discoveredCloud.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.label && m.label !== m.id ? `${m.label} (${m.id})` : m.id}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Fast Sorter (Decision AI) Card */}
                  {(() => {
                    const decision: DecisionAISettings = draft.ai.decision || {
                      enabled: false,
                      provider: 'auto',
                      autoDraftMinConfidence: 0.8
                    }
                    const updateDecision = (patch: Partial<DecisionAISettings>) => {
                      setDecisionTestResult(null)
                      void updateAndSave({
                        ...draft,
                        ai: {
                          ...draft.ai,
                          decision: {
                            ...decision,
                            ...patch
                          }
                        }
                      })
                    }

                    const decisionKeyMeta: {
                      keyProvider: 'jev' | 'openrouter' | 'gemini' | 'openai'
                      label: string
                      configured: boolean
                    } | null =
                      decision.provider === 'jev'
                        ? {
                            keyProvider: 'jev',
                            label: 'Jev (TypeSafe AI) API Key',
                            configured: Boolean(localAI?.apiKeysConfigured.jev)
                          }
                        : decision.provider === 'openrouter-jev'
                          ? {
                              keyProvider: 'openrouter',
                              label: 'OpenRouter API Key',
                              configured: Boolean(localAI?.apiKeysConfigured.openrouter)
                            }
                          : decision.provider === 'gemini-decisions'
                            ? {
                                keyProvider: 'gemini',
                                label: 'Google Gemini API Key',
                                configured: Boolean(localAI?.apiKeysConfigured.gemini)
                              }
                            : decision.provider === 'openai-decisions'
                              ? {
                                  keyProvider: 'openai',
                                  label: 'OpenAI API Key',
                                  configured: Boolean(localAI?.apiKeysConfigured.openai)
                                }
                              : null

                    const confidencePct = Math.round((decision.autoDraftMinConfidence ?? 0.8) * 100)

                    return (
                      <div
                        className="space-y-4 rounded-xl border p-4"
                        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Sparkles size={14} style={{ color: 'var(--accent-text)' }} />
                              <h4 className="text-[13.5px] font-semibold">Fast Sorter (Decision AI)</h4>
                            </div>
                            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                              Optional fast classifier that tags urgency, detects meeting invites, and gates auto-drafts as mail arrives.
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={decision.enabled}
                            aria-label="Enable Fast Sorter (Decision AI)"
                            onClick={() => updateDecision({ enabled: !decision.enabled })}
                            className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                            style={{
                              background: decision.enabled ? 'var(--accent)' : 'var(--border-strong)'
                            }}
                          >
                            <span
                              className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                              style={{
                                transform: decision.enabled ? 'translateX(18px)' : 'translateX(3px)'
                              }}
                            />
                          </button>
                        </div>

                        {decision.enabled && (
                          <div className="space-y-3.5 border-t pt-3.5" style={{ borderColor: 'var(--border-subtle)' }}>
                            {/* Provider Selector */}
                            <div className="space-y-1.5">
                              <label
                                htmlFor="decision-provider-select"
                                className="block text-[12px] font-medium"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                Decision Provider
                              </label>
                              <select
                                id="decision-provider-select"
                                value={decision.provider || 'auto'}
                                onChange={(e) => {
                                  setDecisionApiKeyInput('')
                                  updateDecision({ provider: e.target.value as DecisionProvider })
                                }}
                                className="w-full rounded-lg border px-3 py-2 text-[12.5px] outline-none"
                                style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                              >
                                <option value="auto">Auto (best available)</option>
                                <option value="jev">Jev (TypeSafe AI)</option>
                                <option value="gemini-decisions">Gemini Decisions</option>
                                <option value="openai-decisions">OpenAI Decisions</option>
                                <option value="openrouter-jev">OpenRouter (Jev)</option>
                                <option value="local-fast">Local Fast Model</option>
                                <option value="off">Off</option>
                              </select>
                            </div>

                            {/* Privacy note for Gemini Decisions */}
                            {decision.provider === 'gemini-decisions' && (
                              <div
                                className="flex items-start gap-2 rounded-lg border px-3 py-2 text-[11.5px]"
                                style={{
                                  background: 'var(--bg-main)',
                                  borderColor: 'rgba(245, 184, 65, 0.4)',
                                  color: 'var(--text-secondary)'
                                }}
                              >
                                <AlertCircle size={14} className="mt-0.5 shrink-0" style={{ color: '#e5a424' }} />
                                <span>
                                  Google AI Studio&apos;s free tier may log inputs to improve Google products. Use a paid Gemini API billing tier to disable training on your email content.
                                </span>
                              </div>
                            )}

                            {/* Contextual API Key Input */}
                            {decisionKeyMeta && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <label className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                                    {decisionKeyMeta.label}
                                  </label>
                                  {decisionKeyMeta.configured && (
                                    <span
                                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                                      style={{ background: 'rgba(45, 212, 191, 0.14)', color: 'var(--success)' }}
                                    >
                                      <Check size={11} /> Configured
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <input
                                    type="password"
                                    placeholder={
                                      decisionKeyMeta.configured
                                        ? 'Key saved — paste to replace…'
                                        : `Paste ${decisionKeyMeta.label}…`
                                    }
                                    value={decisionApiKeyInput}
                                    onChange={(e) => setDecisionApiKeyInput(e.target.value)}
                                    className="flex-1 rounded-lg border px-3 py-1.5 text-[12.5px] outline-none"
                                    style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                                  />
                                  <button
                                    type="button"
                                    disabled={savingDecisionKey || !decisionApiKeyInput.trim()}
                                    onClick={async () => {
                                      const trimmed = decisionApiKeyInput.trim()
                                      if (!trimmed) return
                                      setSavingDecisionKey(true)
                                      try {
                                        await window.glassmail.saveDecisionApiKey(decisionKeyMeta.keyProvider, trimmed)
                                        setDecisionApiKeyInput('')
                                        setDecisionTestResult(null)
                                        showToast(`Saved ${decisionKeyMeta.label} securely`)
                                        await runLocalAIDetection({
                                          localOpenAiUrl: draft.ai.localOpenAiUrl,
                                          ollamaUrl: draft.ai.ollamaUrl,
                                          lmStudioUrl: draft.ai.lmStudioUrl
                                        })
                                      } finally {
                                        setSavingDecisionKey(false)
                                      }
                                    }}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                                    style={{ background: 'var(--accent)' }}
                                  >
                                    <Key size={12.5} /> {savingDecisionKey ? 'Saving…' : 'Save Key'}
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Optional Model Override & Auto-Draft Confidence */}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label
                                  htmlFor="decision-model-override"
                                  className="block text-[11.5px] font-medium"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  Model override (optional)
                                </label>
                                <input
                                  id="decision-model-override"
                                  value={decision.model || ''}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      ai: {
                                        ...draft.ai,
                                        decision: { ...decision, model: e.target.value }
                                      }
                                    })
                                  }
                                  onBlur={() =>
                                    updateDecision({ model: (decision.model || '').trim() || undefined })
                                  }
                                  placeholder="Default for provider"
                                  className="w-full rounded-lg border px-2.5 py-1.5 text-[12px] outline-none"
                                  style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                                />
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11.5px]">
                                  <label
                                    htmlFor="decision-confidence-range"
                                    className="font-medium"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    Auto-draft confidence
                                  </label>
                                  <span className="font-semibold tabular-nums" style={{ color: 'var(--accent-text)' }}>
                                    {confidencePct}%
                                  </span>
                                </div>
                                <input
                                  id="decision-confidence-range"
                                  type="range"
                                  min={50}
                                  max={95}
                                  step={5}
                                  value={confidencePct}
                                  onChange={(e) =>
                                    updateDecision({ autoDraftMinConfidence: Number(e.target.value) / 100 })
                                  }
                                  className="mt-1.5 w-full accent-[var(--accent)]"
                                />
                              </div>
                            </div>

                            {/* Test Fast Sorter */}
                            <div className="flex flex-wrap items-center gap-3 pt-0.5">
                              <button
                                type="button"
                                disabled={testingDecision || decision.provider === 'off'}
                                onClick={async () => {
                                  setTestingDecision(true)
                                  setDecisionTestResult(null)
                                  try {
                                    const res = await window.glassmail.testDecisionProvider(decision)
                                    setDecisionTestResult(res)
                                  } catch (err) {
                                    setDecisionTestResult({
                                      ok: false,
                                      latencyMs: 0,
                                      detail: err instanceof Error ? err.message : 'Connection test failed',
                                      modelLabel: decision.provider
                                    })
                                  } finally {
                                    setTestingDecision(false)
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[12px] font-semibold transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
                                style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                              >
                                <RefreshCw size={12.5} className={testingDecision ? 'animate-spin' : ''} />
                                {testingDecision ? 'Testing Fast Sorter…' : 'Test Fast Sorter'}
                              </button>

                              {decisionTestResult && (
                                <span
                                  className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium"
                                  style={{ color: decisionTestResult.ok ? 'var(--success)' : 'var(--danger)' }}
                                >
                                  {decisionTestResult.ok ? (
                                    <>
                                      <Check size={13} className="shrink-0" />
                                      <span className="truncate">
                                        {decisionTestResult.latencyMs}ms — {decisionTestResult.detail}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <AlertCircle size={13} className="shrink-0" />
                                      <span className="truncate">{decisionTestResult.detail}</span>
                                    </>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })()}

            {/* APPEARANCE › THEMES SUBMENU */}
            {tab === 'themes' && (() => {
              const activeUiTheme: UIThemeId = draft.uiTheme || 'everybox'
              const isDarkPalette = ['dark', 'black', 'graphite'].includes(draft.theme)
              const themeCards: {
                id: UIThemeId
                name: string
                badge: string
                desc: string
                highlights: string[]
              }[] = [
                {
                  id: 'everybox',
                  name: 'EveryBox',
                  badge: 'Default',
                  desc: 'Calm 3-pane workspace with universal natural-language search, Today Brief, and multi-account focus pills.',
                  highlights: ['3-pane split view', 'Today Brief home', '5 color palettes']
                },
                {
                  id: 'outlook-classic',
                  name: 'Outlook Classic',
                  badge: 'Microsoft 365 Desktop',
                  desc: 'Authentic Classic Outlook Desktop email experience with Office blue title bar, Home Ribbon, left app rail, collapsible account folder trees, blue unread bars, right reading pane, and bottom status bar.',
                  highlights: ['Home / View Ribbon', 'Favorites & Folder Tree', 'Right Reading Pane']
                },
                {
                  id: 'gmail',
                  name: 'Gmail',
                  badge: 'Web Experience',
                  desc: 'Authentic Gmail experience with floating Compose pill, rounded-pill sidebar, Primary/People/Updates category tabs, dense single-row inbox with hover actions, and full-width conversation view.',
                  highlights: ['Full-width inbox & threads', 'Hover quick actions', 'Optional split pane']
                }
              ]

              return (
                <div className="space-y-6">
                  <div>
                    <div className="text-[13.5px] font-semibold">Email Experience Theme</div>
                    <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      Transform EveryBox&apos;s entire email layout, navigation, and visual style while keeping all your
                      accounts, unified calendar, and private AI features seamlessly integrated.
                    </p>
                  </div>

                  {/* Quick Light / Dark Mode Switch */}
                  <div
                    className="flex items-center justify-between rounded-xl border px-4 py-3"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                  >
                    <div>
                      <div className="text-[12.5px] font-semibold">Color Mode</div>
                      <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                        Applies to EveryBox, Outlook Classic (Office Colorful / Dark Gray), and Gmail (Light / Dark).
                      </div>
                    </div>
                    <div
                      className="flex items-center rounded-lg border p-0.5"
                      style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                    >
                      <button
                        type="button"
                        onClick={() => void updateAndSave({ ...draft, theme: 'light' })}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium transition"
                        style={{
                          background: !isDarkPalette ? 'var(--accent-soft)' : 'transparent',
                          color: !isDarkPalette ? 'var(--accent-text)' : 'var(--text-secondary)'
                        }}
                      >
                        <Sun size={13} /> Light
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateAndSave({ ...draft, theme: 'dark' })}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium transition"
                        style={{
                          background: isDarkPalette ? 'var(--accent-soft)' : 'transparent',
                          color: isDarkPalette ? 'var(--accent-text)' : 'var(--text-secondary)'
                        }}
                      >
                        <Moon size={13} /> Dark
                      </button>
                    </div>
                  </div>

                  {/* Experience Theme Cards */}
                  <div className="space-y-3">
                    {themeCards.map((card) => {
                      const selected = activeUiTheme === card.id
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => {
                            void updateAndSave({ ...draft, uiTheme: card.id })
                            showToast(`Switched theme to ${card.name}`)
                          }}
                          className="flex w-full items-stretch gap-4 rounded-xl border p-4 text-left transition hover:bg-[var(--bg-hover)]"
                          style={{
                            borderColor: selected ? 'var(--accent)' : 'var(--border-strong)',
                            background: selected ? 'var(--accent-soft)' : 'var(--bg-elevated)'
                          }}
                        >
                          {/* Mini Wireframe Preview */}
                          <div
                            className="flex h-[84px] w-[124px] shrink-0 flex-col overflow-hidden rounded-lg border shadow-sm"
                            style={{
                              borderColor: 'var(--border-strong)',
                              background:
                                card.id === 'outlook-classic'
                                  ? isDarkPalette
                                    ? '#1f1f1f'
                                    : '#ffffff'
                                  : card.id === 'gmail'
                                    ? isDarkPalette
                                      ? '#111111'
                                      : '#f6f8fc'
                                    : isDarkPalette
                                      ? '#1f1e1d'
                                      : '#ffffff'
                            }}
                          >
                            {card.id === 'outlook-classic' && (
                              <>
                                <div className="h-3 w-full" style={{ background: isDarkPalette ? '#252423' : '#0f6cbd' }} />
                                <div
                                  className="flex h-3.5 items-center gap-1 border-b px-1.5"
                                  style={{
                                    background: isDarkPalette ? '#292827' : '#f3f2f1',
                                    borderColor: isDarkPalette ? '#3b3a39' : '#edebe9'
                                  }}
                                >
                                  <span className="h-2 w-5 rounded-[2px]" style={{ background: '#0f6cbd' }} />
                                  <span className="h-1.5 w-3 rounded-[1px]" style={{ background: '#8a8886' }} />
                                  <span className="h-1.5 w-3 rounded-[1px]" style={{ background: '#8a8886' }} />
                                </div>
                                <div className="flex flex-1 overflow-hidden">
                                  <div className="w-2.5 border-r" style={{ background: isDarkPalette ? '#252423' : '#f3f2f1', borderColor: isDarkPalette ? '#3b3a39' : '#edebe9' }} />
                                  <div className="w-6 border-r p-1 space-y-1" style={{ background: isDarkPalette ? '#201f1e' : '#faf9f8', borderColor: isDarkPalette ? '#3b3a39' : '#edebe9' }}>
                                    <div className="h-1 w-full rounded bg-[#0f6cbd]/50" />
                                    <div className="h-1 w-4/5 rounded bg-current opacity-20" />
                                    <div className="h-1 w-3/4 rounded bg-current opacity-20" />
                                  </div>
                                  <div className="w-10 border-r p-1 space-y-1" style={{ borderColor: isDarkPalette ? '#3b3a39' : '#edebe9' }}>
                                    <div className="h-2.5 border-l-2 border-[#0f6cbd] bg-[#0f6cbd]/10 pl-0.5" />
                                    <div className="h-2 bg-current opacity-10" />
                                    <div className="h-2 bg-current opacity-10" />
                                  </div>
                                  <div className="flex-1 p-1.5 space-y-1">
                                    <div className="h-1.5 w-3/4 rounded bg-current opacity-25" />
                                    <div className="h-1 w-full rounded bg-current opacity-15" />
                                    <div className="h-1 w-2/3 rounded bg-current opacity-15" />
                                  </div>
                                </div>
                              </>
                            )}
                            {card.id === 'gmail' && (
                              <>
                                <div className="flex h-4 items-center gap-1.5 px-1.5">
                                  <span className="h-2 w-2.5 rounded-[2px]" style={{ background: '#ea4335' }} />
                                  <span className="h-2 flex-1 rounded-full" style={{ background: isDarkPalette ? '#282a2c' : '#eaf1fb' }} />
                                </div>
                                <div className="flex flex-1 gap-1 px-1 pb-1">
                                  <div className="w-7 space-y-1 pt-0.5">
                                    <div className="h-2.5 w-6 rounded-md" style={{ background: isDarkPalette ? '#e3e3e3' : '#c2e7ff' }} />
                                    <div className="h-1.5 w-full rounded-r-full" style={{ background: isDarkPalette ? '#394457' : '#d3e3fd' }} />
                                    <div className="h-1 w-4/5 rounded bg-current opacity-20" />
                                    <div className="h-1 w-3/4 rounded bg-current opacity-20" />
                                  </div>
                                  <div
                                    className="flex-1 rounded-md border p-1 space-y-1"
                                    style={{
                                      background: isDarkPalette ? '#1e1f20' : '#ffffff',
                                      borderColor: isDarkPalette ? '#333' : '#e0e3eb'
                                    }}
                                  >
                                    <div className="flex gap-1 border-b pb-0.5" style={{ borderColor: isDarkPalette ? '#333' : '#e0e3eb' }}>
                                      <span className="h-1 w-4 rounded bg-[#0b57d0]" />
                                      <span className="h-1 w-4 rounded bg-current opacity-20" />
                                    </div>
                                    <div className="h-1.5 w-full rounded bg-current opacity-20" />
                                    <div className="h-1.5 w-full rounded bg-current opacity-10" />
                                    <div className="h-1.5 w-full rounded bg-current opacity-10" />
                                    <div className="h-1.5 w-full rounded bg-current opacity-10" />
                                  </div>
                                </div>
                              </>
                            )}
                            {card.id === 'everybox' && (
                              <>
                                <div className="flex h-3.5 items-center justify-center border-b px-2" style={{ background: isDarkPalette ? '#171615' : '#f4f3f1', borderColor: 'var(--border-subtle)' }}>
                                  <span className="h-1.5 w-14 rounded-full bg-current opacity-20" />
                                </div>
                                <div className="flex flex-1 overflow-hidden">
                                  <div className="w-7 border-r p-1 space-y-1" style={{ background: isDarkPalette ? '#171615' : '#f4f3f1', borderColor: 'var(--border-subtle)' }}>
                                    <div className="h-1.5 w-full rounded bg-[#e87a48]" />
                                    <div className="h-1 w-4/5 rounded bg-current opacity-20" />
                                    <div className="h-1 w-3/4 rounded bg-current opacity-20" />
                                  </div>
                                  <div className="w-10 border-r p-1 space-y-1" style={{ background: isDarkPalette ? '#1b1a19' : '#fafafa', borderColor: 'var(--border-subtle)' }}>
                                    <div className="h-2.5 rounded bg-[#e87a48]/25" />
                                    <div className="h-2 rounded bg-current opacity-10" />
                                    <div className="h-2 rounded bg-current opacity-10" />
                                  </div>
                                  <div className="flex-1 p-1.5 space-y-1">
                                    <div className="h-1.5 w-3/4 rounded bg-current opacity-25" />
                                    <div className="h-1 w-full rounded bg-current opacity-15" />
                                    <div className="h-1 w-2/3 rounded bg-current opacity-15" />
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Theme Info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[13.5px] font-semibold">{card.name}</span>
                                <span
                                  className="rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                                  style={{ background: 'var(--bg-main)', color: 'var(--text-secondary)' }}
                                >
                                  {card.badge}
                                </span>
                              </div>
                              {selected && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                  style={{ background: 'var(--accent)', color: '#ffffff' }}
                                >
                                  <Check size={11} /> Active
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                              {card.desc}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {card.highlights.map((h) => (
                                <span
                                  key={h}
                                  className="rounded-md px-2 py-0.5 text-[10.5px]"
                                  style={{ background: 'var(--bg-main)', color: 'var(--text-muted)' }}
                                >
                                  {h}
                                </span>
                              ))}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* GENERAL / APPEARANCE TAB */}
            {tab === 'general' && (
              <div className="space-y-6">
                <div
                  className="flex items-center justify-between gap-3 rounded-xl border p-4"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div>
                    <div className="text-[13px] font-semibold">Experience Theme</div>
                    <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      Currently using{' '}
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {draft.uiTheme === 'outlook-classic'
                          ? 'Outlook Classic'
                          : draft.uiTheme === 'gmail'
                            ? 'Gmail'
                            : 'EveryBox (Default)'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAppearanceExpanded(true)
                      setTab('themes')
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: 'var(--border-strong)', color: 'var(--accent-text)' }}
                  >
                    <Layout size={13} /> Open Themes
                  </button>
                </div>

                <div>
                  <label className="mb-2 block text-[13px] font-semibold">Color Palette</label>
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
                  <label className="mb-1 block text-[13px] font-semibold">Message List Density</label>
                  <p className="mb-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    Choose how many lines each conversation shows in your inbox list. You can also switch this anytime from the list header.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        {
                          id: 'compact',
                          label: 'Compact',
                          desc: '1 line · Sender only'
                        },
                        {
                          id: 'comfortable',
                          label: 'Comfortable',
                          desc: '2 lines · Sender & subject'
                        },
                        {
                          id: 'expanded',
                          label: 'Expanded',
                          desc: '3 lines · With preview'
                        }
                      ] as { id: ListDensity; label: string; desc: string }[]
                    ).map((opt) => {
                      const active = (draft.listDensity || 'expanded') === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => void updateAndSave({ ...draft, listDensity: opt.id })}
                          className="flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition"
                          style={{
                            borderColor: active ? 'var(--accent)' : 'var(--border-strong)',
                            background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)'
                          }}
                        >
                          <div className="flex w-full items-center justify-between text-[12.5px] font-semibold">
                            <span>{opt.label}</span>
                            {active && <Check size={13} style={{ color: 'var(--accent-text)' }} />}
                          </div>
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {opt.desc}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <label
                  className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div>
                    <div className="text-[13px] font-semibold">Day &amp; Date Separators</div>
                    <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      Group messages with collapsible headers (Today, Yesterday, weekday, Last Week, Two Weeks Ago, Last
                      Month, Older) across all themes.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={draft.showDateGroups !== false}
                    onChange={(e) => void updateAndSave({ ...draft, showDateGroups: e.target.checked })}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                  />
                </label>

                <div>
                  <label className="mb-1 block text-[13px] font-semibold">Account Color Style (Unified Inbox)</label>
                  <p className="mb-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    Choose how each account&apos;s color stands out in your unified inbox list. Assign symbols by right-clicking any account in the sidebar.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'gradient', label: 'Gradient wash', desc: 'Left rail + soft color fade' },
                        { id: 'bar', label: 'Accent bar', desc: 'Crisp left edge rail only' },
                        { id: 'dot', label: 'Symbol / dot', desc: 'Minimal badge on avatar' }
                      ] as { id: AccountRowStyle; label: string; desc: string }[]
                    ).map((opt) => {
                      const active = (draft.accountRowStyle || 'gradient') === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => void updateAndSave({ ...draft, accountRowStyle: opt.id })}
                          className="flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition"
                          style={{
                            borderColor: active ? 'var(--accent)' : 'var(--border-strong)',
                            background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)'
                          }}
                        >
                          <div className="flex w-full items-center justify-between text-[12.5px] font-semibold">
                            <span>{opt.label}</span>
                            {active && <Check size={13} style={{ color: 'var(--accent)' }} />}
                          </div>
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {opt.desc}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[13px] font-semibold">Email Body Width</label>
                  <p className="mb-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    Control how much horizontal space emails use in the reading pane.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'narrow', label: 'Narrow', desc: 'Focused column (640px)' },
                        { id: 'comfortable', label: 'Comfortable', desc: 'Balanced & slightly larger' },
                        { id: 'wide', label: 'Wide', desc: 'Full width & larger centered view' }
                      ] as { id: ReaderWidth; label: string; desc: string }[]
                    ).map((opt) => {
                      const active = (draft.readerWidth || 'comfortable') === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => void updateAndSave({ ...draft, readerWidth: opt.id })}
                          className="flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition"
                          style={{
                            borderColor: active ? 'var(--accent)' : 'var(--border-strong)',
                            background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)'
                          }}
                        >
                          <div className="flex w-full items-center justify-between text-[12.5px] font-semibold">
                            <span>{opt.label}</span>
                            {active && <Check size={13} style={{ color: 'var(--accent-text)' }} />}
                          </div>
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {opt.desc}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[13px] font-semibold">When Switching Accounts</label>
                  <p className="mb-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    Choose what opens when you switch accounts while reading an email. If Inbox Home is already open, it stays on Inbox Home.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'home', label: 'Inbox Home', desc: 'Show Today Brief & triage summary' },
                        { id: 'last-email', label: 'Last Viewed Email', desc: 'Resume your last email in that account' },
                        { id: 'first-email', label: 'Newest Email', desc: 'Open the top email in that account' }
                      ] as { id: AccountSwitchBehavior; label: string; desc: string }[]
                    ).map((opt) => {
                      const active = (draft.accountSwitchBehavior || 'home') === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => void updateAndSave({ ...draft, accountSwitchBehavior: opt.id })}
                          className="flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition"
                          style={{
                            borderColor: active ? 'var(--accent)' : 'var(--border-strong)',
                            background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)'
                          }}
                        >
                          <div className="flex w-full items-center justify-between text-[12.5px] font-semibold">
                            <span>{opt.label}</span>
                            {active && <Check size={13} style={{ color: 'var(--accent-text)' }} />}
                          </div>
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {opt.desc}
                          </span>
                        </button>
                      )
                    })}
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

            {/* SHORTCUT KEYS TAB */}
            {tab === 'shortcuts' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold">
                      Keyboard Shortcuts ({isMac ? 'macOS' : 'Windows'} Defaults)
                    </div>
                    <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                      Click any shortcut to rebind it. Press Esc to cancel while recording.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRecordingShortcutId(null)
                      void updateAndSave({ ...draft, shortcuts: {} })
                      showToast('Reset all shortcuts to defaults')
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: 'var(--border-strong)' }}
                  >
                    <RotateCcw size={12} />
                    Reset Defaults
                  </button>
                </div>

                {(['Mail Actions', 'Navigation', 'App & Search'] as const).map((category) => (
                  <div key={category} className="space-y-1.5">
                    <div
                      className="text-[11.5px] font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {category}
                    </div>
                    <div
                      className="divide-y rounded-xl border"
                      style={{
                        background: 'var(--bg-elevated)',
                        borderColor: 'var(--border-subtle)'
                      }}
                    >
                      {SHORTCUT_DEFINITIONS.filter((d) => d.category === category).map((def) => {
                        const effective = getEffectiveShortcut(def.id, draft.shortcuts)
                        const isDefault = effective === getDefaultShortcut(def.id)
                        const isRecording = recordingShortcutId === def.id
                        return (
                          <div
                            key={def.id}
                            className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <span className="text-[12.5px] font-medium">{def.label}</span>
                            <div className="flex items-center gap-1.5">
                              {!isDefault && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextShortcuts = { ...(draft.shortcuts || {}) }
                                    delete nextShortcuts[def.id]
                                    void updateAndSave({ ...draft, shortcuts: nextShortcuts })
                                  }}
                                  className="rounded p-1 transition hover:bg-[var(--bg-hover)]"
                                  style={{ color: 'var(--text-muted)' }}
                                  title="Reset to default"
                                >
                                  <RotateCcw size={12} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setRecordingShortcutId(isRecording ? null : def.id)}
                                className="min-w-[96px] rounded-lg border px-2.5 py-1 text-center font-mono text-[12px] font-semibold transition"
                                style={{
                                  background: isRecording ? 'var(--accent-soft)' : 'var(--bg-main)',
                                  borderColor: isRecording ? 'var(--accent)' : 'var(--border-strong)',
                                  color: isRecording ? 'var(--accent-text)' : 'var(--text-primary)'
                                }}
                                title="Click to assign a new key or combo"
                              >
                                {isRecording ? 'Press keys…' : formatComboForDisplay(effective)}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
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
          <div
            className="flex shrink-0 items-center justify-between gap-3 border-t px-6 py-3"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2.5 text-[12px]">
              <span className="font-medium" style={{ color: 'var(--text-muted)' }}>
                EveryBox {appVersion ? `v${appVersion}` : ''}
              </span>
              <button
                type="button"
                disabled={checkingForUpdates}
                onClick={() => void checkForUpdates()}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition hover:bg-[var(--bg-hover)] disabled:opacity-60"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
              >
                <RefreshCw size={11} className={checkingForUpdates ? 'animate-spin' : ''} />
                <span>{checkingForUpdates ? 'Checking…' : 'Check for Updates'}</span>
              </button>
              {updateStatus?.updateAvailable && updateStatus.latestVersion && updateStatus.releaseUrl ? (
                <button
                  type="button"
                  onClick={() => void window.glassmail.openExternal(updateStatus.releaseUrl!)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition hover:opacity-90"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                >
                  <Download size={11} />
                  <span>Update available (v{updateStatus.latestVersion}) — Download</span>
                </button>
              ) : updateStatus && !updateStatus.error && !checkingForUpdates ? (
                <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                  Up to date
                </span>
              ) : updateStatus?.error && !checkingForUpdates ? (
                <span className="truncate text-[11.5px]" style={{ color: 'var(--danger)' }} title={updateStatus.error}>
                  {updateStatus.error}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={closeSettings}
              className="shrink-0 rounded-lg px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
