import { execFile, spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import type { AISettings, DiscoveredModel, LocalAIStatus } from '../../shared/types'
import type { SecretStore } from '../security/secrets'

const execFileAsync = promisify(execFile)

function spawnWithStdin(cmd: string, args: string[], stdinText: string, timeoutMs = 90_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(`${cmd} timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        const detail = (stdout.trim() || stderr.trim()).replace(/\s+/g, ' ').slice(0, 300)
        reject(new Error(`${cmd} exited with code ${code}: ${detail}`))
      }
    })
    child.stdin.write(stdinText)
    child.stdin.end()
  })
}

function stripThinkingTags(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

export interface AICompletionRequest {
  system: string
  prompt: string
  jsonMode?: boolean
  maxTokens?: number
}

export interface AICompletionResult {
  text: string
  providerLabel: string
}

let cachedGpuName: string | null | undefined

async function detectGpuName(): Promise<string | null> {
  if (cachedGpuName !== undefined) return cachedGpuName
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name'
        ],
        { timeout: 3000, windowsHide: true }
      )
      const names = stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((n) => !/Microsoft Basic|Virtual|Indirect|Parsec|Remote|Meta|Citrix/i.test(n))

      const preferred =
        names.find((n) => /NVIDIA|GeForce|RTX|GTX|Radeon RX|Intel\(R\) Arc/i.test(n)) || names[0] || null
      cachedGpuName = preferred ? preferred.replace(/^NVIDIA\s+GeForce\s+/i, '').trim() : null
      return cachedGpuName
    }
  } catch {
    // ignore
  }
  cachedGpuName = null
  return null
}

async function hasExecutableOnPath(cmd: string): Promise<boolean> {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which'
    await execFileAsync(checker, [cmd], { timeout: 1500, windowsHide: true })
    return true
  } catch {
    return false
  }
}

async function isOllamaInstalledLocally(): Promise<boolean> {
  if (await hasExecutableOnPath('ollama')) return true
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || ''
    const candidates = [
      join(localAppData, 'Programs', 'Ollama', 'ollama.exe'),
      'C:\\Program Files\\Ollama\\ollama.exe'
    ]
    if (candidates.some((p) => p && existsSync(p))) return true
  }
  return false
}

async function isLmStudioInstalledLocally(): Promise<boolean> {
  if (await hasExecutableOnPath('lms')) return true
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || ''
    const candidates = [
      join(localAppData, 'Programs', 'LM Studio', 'LM Studio.exe'),
      join(localAppData, 'LM-Studio', 'LM Studio.exe'),
      'C:\\Program Files\\LM Studio\\LM Studio.exe'
    ]
    if (candidates.some((p) => p && existsSync(p))) return true
  }
  return false
}

function normalizeOllamaUrl(url?: string): string {
  const raw = (url || process.env.OLLAMA_HOST || 'http://localhost:11434').trim()
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  return withScheme.replace(/\/$/, '')
}

function normalizeLmStudioUrl(url?: string): string {
  const raw = (url || 'http://localhost:1234').trim()
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  return withScheme.replace(/\/$/, '')
}

function normalizeHttpUrl(url: string): string {
  const raw = url.trim()
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  return withScheme.replace(/\/$/, '')
}

function formatParamCount(n?: number): string | undefined {
  if (!n || !Number.isFinite(n) || n <= 0) return undefined
  if (n >= 1e9) return `${Math.round(n / 1e9)}B`
  if (n >= 1e6) return `${Math.round(n / 1e6)}M`
  return undefined
}

async function probeOpenAiCompatibleServer(
  configuredUrl?: string
): Promise<{ running: boolean; urlUsed: string; serverName: string | null; models: DiscoveredModel[] }> {
  const defaults = [
    'http://127.0.0.1:8080',
    'http://127.0.0.1:8001',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8081'
  ]
  const candidates: string[] = []
  if (configuredUrl?.trim()) {
    candidates.push(normalizeHttpUrl(configuredUrl))
  }
  for (const d of defaults) {
    if (!candidates.includes(d)) candidates.push(d)
  }

  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(1200) })
      if (!res.ok) continue
      const data = (await res.json()) as {
        data?: {
          id: string
          owned_by?: string
          meta?: { size?: number; n_params?: number }
        }[]
      }
      if (!Array.isArray(data.data)) continue
      const models: DiscoveredModel[] = data.data.map((m) => ({
        id: m.id,
        sizeBytes: m.meta?.size,
        parameterSize: formatParamCount(m.meta?.n_params)
      }))
      const ownedBy = data.data[0]?.owned_by?.toLowerCase() || ''
      const serverName = ownedBy.includes('llama')
        ? 'llama.cpp'
        : ownedBy.includes('vllm')
          ? 'vLLM'
          : 'Local OpenAI Server'
      return { running: true, urlUsed: base, serverName, models }
    } catch {
      // try next candidate
    }
  }

  return {
    running: false,
    urlUsed: configuredUrl?.trim() ? normalizeHttpUrl(configuredUrl) : 'http://127.0.0.1:8080',
    serverName: null,
    models: []
  }
}

function readCodexCliModels(): DiscoveredModel[] {
  try {
    const cachePath = join(homedir(), '.codex', 'models_cache.json')
    if (!existsSync(cachePath)) return []
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8')) as {
      models?: { slug?: string; display_name?: string; visibility?: string }[]
    }
    const seen = new Set<string>()
    const out: DiscoveredModel[] = []
    for (const m of parsed.models || []) {
      const id = m.slug?.trim()
      if (!id || seen.has(id) || m.visibility === 'hide') continue
      seen.add(id)
      out.push({ id, label: m.display_name?.trim() || id })
    }
    return out
  } catch {
    return []
  }
}

async function fetchAnthropicModels(apiKey: string | null): Promise<DiscoveredModel[]> {
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=40', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(2500)
    })
    if (!res.ok) return []
    const data = (await res.json()) as { data?: { id: string; display_name?: string }[] }
    return (data.data || []).map((m) => ({ id: m.id, label: m.display_name || m.id }))
  } catch {
    return []
  }
}

async function fetchOpenAiModels(apiKey: string | null): Promise<DiscoveredModel[]> {
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(2500)
    })
    if (!res.ok) return []
    const data = (await res.json()) as { data?: { id: string; created?: number }[] }
    return (data.data || [])
      .filter((m) => /^(gpt-|o[134]-|o[134]$|chatgpt-)/i.test(m.id) && !/audio|realtime|transcribe|tts|image|search|embed/i.test(m.id))
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .slice(0, 30)
      .map((m) => ({ id: m.id }))
  } catch {
    return []
  }
}

async function fetchGeminiModels(apiKey: string | null): Promise<DiscoveredModel[]> {
  if (!apiKey) return []
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=50`,
      { signal: AbortSignal.timeout(2500) }
    )
    if (!res.ok) return []
    const data = (await res.json()) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]
    }
    return (data.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => ({
        id: m.name.replace(/^models\//, ''),
        label: m.displayName || m.name.replace(/^models\//, '')
      }))
      .slice(0, 30)
  } catch {
    return []
  }
}

export async function detectLocalAI(
  settings: AISettings,
  secrets?: SecretStore,
  overrides?: { localOpenAiUrl?: string; ollamaUrl?: string; lmStudioUrl?: string }
): Promise<LocalAIStatus> {
  const ollamaUrlUsed = normalizeOllamaUrl(overrides?.ollamaUrl ?? settings.ollamaUrl)
  const lmStudioUrlUsed = normalizeLmStudioUrl(overrides?.lmStudioUrl ?? settings.lmStudioUrl)
  const localServerOverride = overrides?.localOpenAiUrl ?? settings.localOpenAiUrl

  const anthropicKey = secrets?.get('ai_key:anthropic') ?? null
  const geminiKey = secrets?.get('ai_key:gemini') ?? null
  const openaiKey = secrets?.get('ai_key:openai') ?? null

  const [
    gpuName,
    localServerCheck,
    ollamaCheck,
    lmStudioCheck,
    ollamaInstalledLocal,
    lmStudioInstalledLocal,
    claudeCliAvailable,
    codexCliAvailable,
    anthropicModels,
    geminiModels,
    openaiModels
  ] = await Promise.all([
    detectGpuName(),
    probeOpenAiCompatibleServer(localServerOverride),
    (async (): Promise<{ running: boolean; models: DiscoveredModel[] }> => {
      try {
        const res = await fetch(`${ollamaUrlUsed}/api/tags`, {
          signal: AbortSignal.timeout(1500)
        })
        if (!res.ok) return { running: false, models: [] }
        const data = (await res.json()) as {
          models?: { name: string; size?: number; details?: { parameter_size?: string } }[]
        }
        const models: DiscoveredModel[] = (data.models || []).map((m) => ({
          id: m.name,
          sizeBytes: m.size,
          parameterSize: m.details?.parameter_size
        }))
        return { running: true, models }
      } catch {
        return { running: false, models: [] }
      }
    })(),
    (async (): Promise<{ running: boolean; models: DiscoveredModel[] }> => {
      try {
        const res = await fetch(`${lmStudioUrlUsed}/v1/models`, {
          signal: AbortSignal.timeout(1500)
        })
        if (!res.ok) return { running: false, models: [] }
        const data = (await res.json()) as { data?: { id: string }[] }
        const models: DiscoveredModel[] = (data.data || []).map((m) => ({ id: m.id }))
        return { running: true, models }
      } catch {
        return { running: false, models: [] }
      }
    })(),
    isOllamaInstalledLocally(),
    isLmStudioInstalledLocally(),
    hasExecutableOnPath('claude'),
    hasExecutableOnPath('codex'),
    fetchAnthropicModels(anthropicKey),
    fetchGeminiModels(geminiKey),
    fetchOpenAiModels(openaiKey)
  ])

  const codexCliModels = codexCliAvailable ? readCodexCliModels() : []

  return {
    gpuName,
    localServerRunning: localServerCheck.running,
    localServerName: localServerCheck.serverName,
    localServerUrlUsed: localServerCheck.urlUsed,
    localServerModels: localServerCheck.models,
    ollamaInstalled: ollamaCheck.running || ollamaInstalledLocal,
    ollamaRunning: ollamaCheck.running,
    ollamaUrlUsed,
    ollamaModels: ollamaCheck.models,
    lmStudioInstalled: lmStudioCheck.running || lmStudioInstalledLocal,
    lmStudioRunning: lmStudioCheck.running,
    lmStudioUrlUsed,
    lmStudioModels: lmStudioCheck.models,
    claudeCliAvailable,
    codexCliAvailable,
    codexCliModels,
    apiKeysConfigured: {
      anthropic: Boolean(anthropicKey),
      gemini: Boolean(geminiKey),
      openai: Boolean(openaiKey)
    },
    cloudModels: {
      anthropic: anthropicModels,
      gemini: geminiModels,
      openai: openaiModels
    }
  }
}

export async function completeAI(
  req: AICompletionRequest,
  settings: AISettings,
  secrets: SecretStore
): Promise<AICompletionResult> {
  const langNote =
    settings.responseLanguage && settings.responseLanguage !== 'auto'
      ? `\nAlways respond in ${settings.responseLanguage}.`
      : ''
  const system = `${req.system}${langNote}`

  if (settings.provider === 'local-openai') {
    const probed = await probeOpenAiCompatibleServer(settings.localOpenAiUrl)
    if (!probed.running) {
      throw new Error('Local OpenAI-compatible server is not running. Start llama-server or check Settings › AI Providers.')
    }
    const model = settings.localOpenAiModel?.trim() || probed.models[0]?.id || ''
    if (!model) {
      throw new Error('No model reported by the local server. Open Settings › AI Providers and click Refresh.')
    }
    const res = await fetch(`${probed.urlUsed}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: req.maxTokens || 4096,
        response_format: req.jsonMode ? { type: 'json_object' } : undefined,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: req.prompt }
        ]
      }),
      signal: AbortSignal.timeout(90_000)
    })
    if (!res.ok) throw new Error(`Local server error (${res.status}): ${await res.text()}`)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const gpu = await detectGpuName()
    return {
      text: stripThinkingTags(data.choices?.[0]?.message?.content || ''),
      providerLabel: `${probed.serverName || 'Local Server'} (${model}) · Local${gpu ? ` (${gpu})` : ''}`
    }
  }

  if (settings.provider === 'ollama') {
    const base = normalizeOllamaUrl(settings.ollamaUrl)
    let model = settings.ollamaModel?.trim()
    if (!model) {
      const tagsRes = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) })
      if (tagsRes.ok) {
        const tags = (await tagsRes.json()) as { models?: { name: string }[] }
        model = tags.models?.[0]?.name || ''
      }
    }
    if (!model) {
      throw new Error('No Ollama model selected. Open Settings › AI and choose a discovered model.')
    }
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: req.jsonMode ? 'json' : undefined,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: req.prompt }
        ]
      }),
      signal: AbortSignal.timeout(90_000)
    })
    if (!res.ok) throw new Error(`Ollama error (${res.status}): ${await res.text()}`)
    const data = (await res.json()) as { message?: { content?: string } }
    const gpu = await detectGpuName()
    return {
      text: data.message?.content || '',
      providerLabel: `Ollama (${model}) · Local${gpu ? ` (${gpu})` : ''}`
    }
  }

  if (settings.provider === 'lmstudio') {
    const base = normalizeLmStudioUrl(settings.lmStudioUrl)
    let model = settings.lmStudioModel?.trim()
    if (!model) {
      const modelsRes = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(2000) })
      if (modelsRes.ok) {
        const modelsData = (await modelsRes.json()) as { data?: { id: string }[] }
        model = modelsData.data?.[0]?.id || ''
      }
    }
    if (!model) {
      throw new Error('No LM Studio model loaded. Load a model in LM Studio and select it in Settings › AI.')
    }
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: req.maxTokens || 1200,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: req.prompt }
        ]
      }),
      signal: AbortSignal.timeout(90_000)
    })
    if (!res.ok) throw new Error(`LM Studio error (${res.status}): ${await res.text()}`)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const gpu = await detectGpuName()
    return {
      text: data.choices?.[0]?.message?.content || '',
      providerLabel: `LM Studio (${model}) · Local${gpu ? ` (${gpu})` : ''}`
    }
  }

  if (settings.provider === 'claude-cli') {
    const fullPrompt = `${system}\n\n---\n\n${req.prompt}`
    const model = settings.claudeCliModel || 'sonnet'
    const args = model && model !== 'default' ? ['-p', '-', '--model', model] : ['-p', '-']
    const stdout = await spawnWithStdin('claude', args, fullPrompt, 90_000)
    return {
      text: stripThinkingTags(stdout),
      providerLabel: `Claude CLI (${model}) · Subscription`
    }
  }

  if (settings.provider === 'codex-cli') {
    const fullPrompt = `${system}\n\n---\n\n${req.prompt}`
    const model = settings.codexCliModel?.trim() || 'default'
    const args = model && model !== 'default' ? ['exec', '-', '--model', model] : ['exec', '-']
    const stdout = await spawnWithStdin('codex', args, fullPrompt, 90_000)
    return {
      text: stripThinkingTags(stdout),
      providerLabel: `Codex CLI${model !== 'default' ? ` (${model})` : ''} · Subscription`
    }
  }

  if (settings.provider === 'anthropic') {
    const key = secrets.get('ai_key:anthropic')
    if (!key) throw new Error('Anthropic API key not set in Settings > AI.')
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: settings.anthropicModel || 'claude-sonnet-4-5',
        max_tokens: req.maxTokens || 1200,
        system,
        messages: [{ role: 'user', content: req.prompt }]
      }),
      signal: AbortSignal.timeout(60_000)
    })
    if (!res.ok) throw new Error(`Anthropic API error (${res.status}): ${await res.text()}`)
    const data = (await res.json()) as { content?: { text?: string }[] }
    return {
      text: data.content?.[0]?.text || '',
      providerLabel: `Claude (${settings.anthropicModel})`
    }
  }

  if (settings.provider === 'gemini') {
    const key = secrets.get('ai_key:gemini')
    if (!key) throw new Error('Gemini API key not set in Settings > AI.')
    const model = settings.geminiModel || 'gemini-2.5-flash'
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
          generationConfig: req.jsonMode ? { responseMimeType: 'application/json' } : undefined
        }),
        signal: AbortSignal.timeout(60_000)
      }
    )
    if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${await res.text()}`)
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    return {
      text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      providerLabel: `Gemini (${model})`
    }
  }

  // OpenAI
  const key = secrets.get('ai_key:openai')
  if (!key) throw new Error('OpenAI API key not set in Settings > AI.')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model: settings.openaiModel || 'gpt-4.1-mini',
      response_format: req.jsonMode ? { type: 'json_object' } : undefined,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: req.prompt }
      ]
    }),
    signal: AbortSignal.timeout(60_000)
  })
  if (!res.ok) throw new Error(`OpenAI API error (${res.status}): ${await res.text()}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return {
    text: data.choices?.[0]?.message?.content || '',
    providerLabel: `OpenAI (${settings.openaiModel})`
  }
}

export function extractJsonBlock<T>(raw: string): T | null {
  const cleaned = stripThinkingTags(raw)
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/) || cleaned.match(/(\{[\s\S]*\})/)
    if (match?.[1]) {
      try {
        return JSON.parse(match[1]) as T
      } catch {
        return null
      }
    }
    return null
  }
}
