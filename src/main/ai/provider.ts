import { execFile } from 'child_process'
import { promisify } from 'util'
import type { AISettings } from '../../shared/types'
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

export interface LocalAIStatus {
  ollamaRunning: boolean
  ollamaModels: string[]
  lmStudioRunning: boolean
  lmStudioModels: string[]
  claudeCliAvailable: boolean
  codexCliAvailable: boolean
}

export async function detectLocalAI(settings: AISettings): Promise<LocalAIStatus> {
  const status: LocalAIStatus = {
    ollamaRunning: false,
    ollamaModels: [],
    lmStudioRunning: false,
    lmStudioModels: [],
    claudeCliAvailable: false,
    codexCliAvailable: false
  }

  // Check Ollama
  try {
    const res = await fetch(`${settings.ollamaUrl.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(1500)
    })
    if (res.ok) {
      const data = (await res.json()) as { models?: { name: string }[] }
      status.ollamaRunning = true
      status.ollamaModels = (data.models || []).map((m) => m.name)
    }
  } catch {
    // not running
  }

  // Check LM Studio
  try {
    const res = await fetch(`${settings.lmStudioUrl.replace(/\/$/, '')}/v1/models`, {
      signal: AbortSignal.timeout(1500)
    })
    if (res.ok) {
      const data = (await res.json()) as { data?: { id: string }[] }
      status.lmStudioRunning = true
      status.lmStudioModels = (data.data || []).map((m) => m.id)
    }
  } catch {
    // not running
  }

  // Check Claude CLI
  try {
    await execFileAsync('where', ['claude'], { timeout: 1500 })
    status.claudeCliAvailable = true
  } catch {
    // not installed
  }

  // Check Codex CLI
  try {
    await execFileAsync('where', ['codex'], { timeout: 1500 })
    status.codexCliAvailable = true
  } catch {
    // not installed
  }

  return status
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
    const base = settings.ollamaUrl.replace(/\/$/, '')
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.ollamaModel || 'qwen2.5:14b',
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
    return {
      text: data.message?.content || '',
      providerLabel: `Ollama (${settings.ollamaModel}) · Local RTX 5090`
    }
  }

  if (settings.provider === 'lmstudio') {
    const base = settings.lmStudioUrl.replace(/\/$/, '')
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.lmStudioModel || 'local-model',
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
    return {
      text: data.choices?.[0]?.message?.content || '',
      providerLabel: `LM Studio (${settings.lmStudioModel}) · Local`
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
