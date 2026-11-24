import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import type { AISettings, DiscoveredModel, LocalAIStatus } from '../../shared/types'
import type { SecretStore } from '../security/secrets'

const execFileAsync = promisify(execFile)

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

export async function detectLocalAI(
  settings: AISettings,
  secrets?: SecretStore,
  overrides?: { ollamaUrl?: string; lmStudioUrl?: string }
): Promise<LocalAIStatus> {
  const ollamaUrlUsed = normalizeOllamaUrl(overrides?.ollamaUrl ?? settings.ollamaUrl)
  const lmStudioUrlUsed = normalizeLmStudioUrl(overrides?.lmStudioUrl ?? settings.lmStudioUrl)

  const [
    gpuName,
    ollamaCheck,
    lmStudioCheck,
    ollamaInstalledLocal,
    lmStudioInstalledLocal,
    claudeCliAvailable,
    codexCliAvailable
  ] = await Promise.all([
    detectGpuName(),
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
    hasExecutableOnPath('codex')
  ])

  return {
    gpuName,
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
    apiKeysConfigured: {
      anthropic: secrets ? secrets.has('ai_key:anthropic') : false,
      gemini: secrets ? secrets.has('ai_key:gemini') : false,
      openai: secrets ? secrets.has('ai_key:openai') : false
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
    const { stdout } = await execFileAsync('claude', ['-p', fullPrompt], {
      timeout: 90_000,
      maxBuffer: 4 * 1024 * 1024,
      shell: true
    })
    return {
      text: stdout.trim(),
      providerLabel: 'Claude CLI · Subscription ($0 extra API)'
    }
  }

  if (settings.provider === 'codex-cli') {
    const fullPrompt = `${system}\n\n---\n\n${req.prompt}`
    const { stdout } = await execFileAsync('codex', ['exec', fullPrompt], {
      timeout: 90_000,
      maxBuffer: 4 * 1024 * 1024,
      shell: true
    })
    return {
      text: stdout.trim(),
      providerLabel: 'Codex CLI · Subscription ($0 extra API)'
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
  try {
    return JSON.parse(raw) as T
  } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/)
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
