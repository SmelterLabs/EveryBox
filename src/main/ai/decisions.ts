import type {
  AISettings,
  DecisionAISettings,
  DecisionProvider,
  DecisionProviderTestResult,
  ThreadAIBundle
} from '../../shared/types'
import {
  completeFastAI,
  extractJsonBlock,
  stripThinkingTags,
  type AIPriority,
  type SecretReader
} from './provider'

export interface DecisionApiKeys {
  jev?: string | null
  openrouter?: string | null
  gemini?: string | null
  openai?: string | null
}

export interface DecisionRulePrompt {
  id: string
  prompt: string
}

export interface EmailDecisionInput {
  threadId?: string
  subject: string
  fromName: string
  fromEmail: string
  toEmails?: string[]
  dateMs: number
  snippet: string
  bodyText?: string
  isSent?: boolean
  hasCalendarInvite?: boolean
  hasUnsubscribe?: boolean
  signInCode?: string
  accountEmail?: string
  rules?: DecisionRulePrompt[]
  priority?: AIPriority
}

export type ResolvedDecisionProvider = Exclude<DecisionProvider, 'auto' | 'off'>

export interface EmailDecisionResult {
  bundle: ThreadAIBundle
  urgency: 0 | 1 | 2 | 3
  needsReply: boolean
  replyConfidence: number
  autoDraftWorthy: boolean
  aiReason: string
  hasImplicitEvent: boolean
  phishingRisk: 0 | 1 | 2
  expectsReply?: boolean
  matchedRuleIds: string[]
  modelLabel: string
  providerUsed: ResolvedDecisionProvider
  latencyMs: number
}

export const DECISION_SECRET_KEYS = {
  jev: 'ai_key:jev',
  openrouter: 'ai_key:openrouter',
  gemini: 'ai_key:gemini',
  openai: 'ai_key:openai'
} as const

export const DEFAULT_DECISION_ENDPOINTS = {
  jev: 'https://api.typesafe.ai/v1/systemone',
  'openrouter-jev': 'https://openrouter.ai/api/alpha/decisions',
  'gemini-decisions': 'https://generativelanguage.googleapis.com/v1beta/decisions',
  'openai-decisions': 'https://api.openai.com/v1/decisions'
} as const

export const DEFAULT_DECISION_MODELS = {
  jev: 'jev-latest',
  'openrouter-jev': 'typesafe/jev-latest',
  'gemini-decisions': 'gemini-decision-1',
  'openai-decisions': 'gpt-6-luna'
} as const

const VALID_BUNDLES: readonly ThreadAIBundle[] = [
  'action',
  'waiting',
  'fyi',
  'finance',
  'shipping',
  'newsletter',
  'promo',
  'cold_outreach',
  'security'
]

const BUNDLE_CRITERIA: Record<ThreadAIBundle, string> = {
  action: 'Requires a reply, decision, approval, or concrete action from the recipient.',
  waiting: 'Sent by the user or awaiting a reply/deliverable from someone else.',
  fyi: 'Informational human or team update that needs no direct action or reply.',
  finance: 'Invoices, bills, receipts, bank statements, tax docs, or payment confirmations.',
  shipping: 'Order confirmations, package tracking, delivery updates, or returns.',
  newsletter: 'Subscribed editorial newsletters, digests, blogs, or recurring content.',
  promo: 'Marketing offers, sales, discounts, coupons, or automated promotional blasts.',
  cold_outreach: 'Unsolicited sales pitches, recruiting spam, or cold business outreach.',
  security: '2FA sign-in codes, password resets, security alerts, or account access notices.'
}

const URGENCY_CRITERIA = [
  '0: Low priority — no time pressure, newsletters, promos, or passive FYI.',
  '1: Normal — routine email that can wait a day or two.',
  '2: Important — time-sensitive within 24-48 hours or from a key human contact.',
  '3: Urgent — immediate attention needed today, hard deadline, outage, or critical issue.'
]

const PHISHING_CRITERIA = [
  '0: Legitimate email with no phishing or scam indicators.',
  '1: Suspicious — unusual sender/domain, unexpected urgency, or unverified link/request.',
  '2: High phishing, credential-harvesting, wire-fraud, or scam risk.'
]

export function readDecisionApiKeys(secrets: SecretReader): DecisionApiKeys {
  return {
    jev: secrets.get(DECISION_SECRET_KEYS.jev),
    openrouter: secrets.get(DECISION_SECRET_KEYS.openrouter),
    gemini: secrets.get(DECISION_SECRET_KEYS.gemini),
    openai: secrets.get(DECISION_SECRET_KEYS.openai)
  }
}

function clamp01(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(1, n))
}

function clampInt<T extends number>(value: unknown, min: number, max: number, fallback: T): T {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n))) as T
}

function normalizeBundle(value: unknown, fallback: ThreadAIBundle = 'fyi'): ThreadAIBundle {
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase() as ThreadAIBundle
    if ((VALID_BUNDLES as readonly string[]).includes(clean)) return clean
  }
  return fallback
}

function formatEmailState(input: EmailDecisionInput): string {
  const dateStr = new Date(input.dateMs).toISOString()
  const body = (input.bodyText || input.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 2200)
  const flags: string[] = []
  if (input.isSent) flags.push('direction=sent_by_user')
  if (input.hasCalendarInvite) flags.push('has_ics_invite=true')
  if (input.hasUnsubscribe) flags.push('has_unsubscribe_header=true')
  if (input.signInCode) flags.push('contains_2fa_code=true')

  const lines = [
    `Date: ${dateStr}`,
    `From: ${input.fromName ? `${input.fromName} <${input.fromEmail}>` : input.fromEmail}`,
    input.toEmails?.length ? `To: ${input.toEmails.slice(0, 5).join(', ')}` : '',
    input.accountEmail ? `Recipient Account: ${input.accountEmail}` : '',
    `Subject: ${input.subject || '(no subject)'}`,
    flags.length ? `Signals: ${flags.join(', ')}` : '',
    '',
    body || '(empty body)'
  ].filter(Boolean)

  return lines.join('\n')
}

function deriveReason(result: {
  bundle: ThreadAIBundle
  urgency: 0 | 1 | 2 | 3
  needsReply: boolean
  phishingRisk: 0 | 1 | 2
  hasImplicitEvent: boolean
  expectsReply?: boolean
}): string {
  if (result.phishingRisk >= 2) return 'High phishing or scam risk detected.'
  if (result.expectsReply) return 'Sent message awaiting a reply.'
  if (result.needsReply && result.urgency >= 3) return 'Urgent message requesting your reply.'
  if (result.needsReply && result.urgency >= 2) return 'Time-sensitive message needing a response.'
  if (result.needsReply) return 'Direct message expecting a reply.'
  if (result.hasImplicitEvent) return 'Mentions a scheduled event or meeting.'
  switch (result.bundle) {
    case 'action':
      return 'Action item or decision requested.'
    case 'waiting':
      return 'Waiting on a response or follow-up.'
    case 'finance':
      return 'Billing, invoice, or financial notice.'
    case 'shipping':
      return 'Order or delivery update.'
    case 'security':
      return 'Security alert or verification code.'
    case 'newsletter':
      return 'Subscribed newsletter or digest.'
    case 'promo':
      return 'Promotional or marketing email.'
    case 'cold_outreach':
      return 'Unsolicited outreach or sales pitch.'
    default:
      return 'Informational update — no reply needed.'
  }
}

export function resolveDecisionProvider(
  decision: DecisionAISettings | undefined,
  apiKeys: DecisionApiKeys
): ResolvedDecisionProvider {
  const configured = decision?.provider ?? 'auto'
  if (configured !== 'auto' && configured !== 'off') {
    return configured
  }
  if (apiKeys.jev?.trim()) return 'jev'
  if (apiKeys.openrouter?.trim()) return 'openrouter-jev'
  if (apiKeys.gemini?.trim()) return 'gemini-decisions'
  if (apiKeys.openai?.trim()) return 'openai-decisions'
  return 'local-fast'
}

// ---------------------------------------------------------------------------
// Native Decision Question Builders & Parsers
// ---------------------------------------------------------------------------

interface SystemOneQuestion {
  type: 'choice' | 'score' | 'noul'
  instructions: string
  criteria?: Record<string, string> | string[]
}

interface SystemOneAnswer {
  choice?: string
  probabilities?: Record<string, number>
  score?: number
  noul?: number
  confidence?: number
}

interface SystemOneResponse {
  answers?: Record<string, SystemOneAnswer>
  error?: { message?: string } | string
}

function buildSystemOneQuestions(input: EmailDecisionInput): {
  questions: Record<string, SystemOneQuestion>
  ruleKeyMap: Map<string, string>
} {
  const questions: Record<string, SystemOneQuestion> = {
    bundle: {
      type: 'choice',
      instructions: 'Classify this email into the single best inbox bundle.',
      criteria: BUNDLE_CRITERIA
    },
    urgency: {
      type: 'score',
      instructions: 'Rate how urgent this email is for the recipient.',
      criteria: URGENCY_CRITERIA
    },
    needs_reply: {
      type: 'noul',
      instructions:
        'Does a real person expect a reply from the recipient? Answer no for automated notifications, receipts, newsletters, promos, or pure FYIs.'
    },
    auto_draft_worthy: {
      type: 'noul',
      instructions:
        'Would a short, helpful pre-drafted reply save the recipient time? Answer yes only if a human reply is clearly expected and enough context exists to draft one.'
    },
    has_implicit_event: {
      type: 'noul',
      instructions:
        'Does this email mention a specific upcoming meeting, appointment, call, flight, or reservation with a date/time (without already being a standard calendar invite)?'
    },
    phishing_risk: {
      type: 'score',
      instructions: 'Rate the likelihood that this email is phishing, impersonation, or a scam.',
      criteria: PHISHING_CRITERIA
    }
  }

  if (input.isSent) {
    questions.expects_reply = {
      type: 'noul',
      instructions:
        'Does this sent email ask a question or request something such that the sender is waiting on a reply?'
    }
  }

  const ruleKeyMap = new Map<string, string>()
  if (input.rules?.length) {
    input.rules.forEach((rule, idx) => {
      if (!rule.prompt?.trim()) return
      const key = `rule_${idx}`
      ruleKeyMap.set(key, rule.id)
      questions[key] = {
        type: 'noul',
        instructions: `Does this email match the following user rule? Rule: ${rule.prompt.trim()}`
      }
    })
  }

  return { questions, ruleKeyMap }
}

function parseSystemOneAnswers(
  answers: Record<string, SystemOneAnswer>,
  input: EmailDecisionInput,
  ruleKeyMap: Map<string, string>,
  minAutoDraftConfidence: number,
  modelLabel: string,
  providerUsed: ResolvedDecisionProvider,
  latencyMs: number
): EmailDecisionResult {
  const bundle = normalizeBundle(answers.bundle?.choice, input.isSent ? 'waiting' : 'fyi')
  const urgency = clampInt<0 | 1 | 2 | 3>(answers.urgency?.score, 0, 3, 1)
  const replyProb = clamp01(answers.needs_reply?.noul, 0)
  const needsReply = !input.isSent && replyProb >= 0.5
  const autoDraftProb = clamp01(answers.auto_draft_worthy?.noul, 0)
  const autoDraftWorthy = needsReply && autoDraftProb >= minAutoDraftConfidence
  const hasImplicitEvent = !input.hasCalendarInvite && clamp01(answers.has_implicit_event?.noul, 0) >= 0.6
  const phishingRisk = clampInt<0 | 1 | 2>(answers.phishing_risk?.score, 0, 2, 0)
  const expectsReply = input.isSent ? clamp01(answers.expects_reply?.noul, 0) >= 0.55 : undefined

  const matchedRuleIds: string[] = []
  for (const [key, ruleId] of ruleKeyMap.entries()) {
    if (clamp01(answers[key]?.noul, 0) >= 0.65) {
      matchedRuleIds.push(ruleId)
    }
  }

  return {
    bundle,
    urgency,
    needsReply,
    replyConfidence: Math.round(replyProb * 100) / 100,
    autoDraftWorthy,
    aiReason: deriveReason({ bundle, urgency, needsReply, phishingRisk, hasImplicitEvent, expectsReply }),
    hasImplicitEvent,
    phishingRisk,
    expectsReply,
    matchedRuleIds,
    modelLabel,
    providerUsed,
    latencyMs
  }
}

async function callJevLikeDecisionAPI(
  provider: 'jev' | 'openrouter-jev',
  input: EmailDecisionInput,
  decision: DecisionAISettings | undefined,
  apiKey: string
): Promise<EmailDecisionResult> {
  const started = Date.now()
  const endpoint = decision?.endpoint?.trim() || DEFAULT_DECISION_ENDPOINTS[provider]
  const model = decision?.model?.trim() || DEFAULT_DECISION_MODELS[provider]
  const { questions, ruleKeyMap } = buildSystemOneQuestions(input)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }
  if (provider === 'openrouter-jev') {
    headers['HTTP-Referer'] = 'https://everybox.app'
    headers['X-Title'] = 'EveryBox'
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      state: formatEmailState(input),
      questions
    }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!res.ok) {
    throw new Error(`${provider === 'jev' ? 'TypeSafe Jev' : 'OpenRouter Jev'} error (${res.status}): ${(await res.text()).slice(0, 240)}`)
  }
  const data = (await res.json()) as SystemOneResponse
  if (!data.answers || typeof data.answers !== 'object') {
    throw new Error(`${provider} returned no answers object.`)
  }
  const minConf = clamp01(decision?.autoDraftMinConfidence, 0.72)
  const modelLabel = `${provider === 'jev' ? 'Jev' : 'OpenRouter Jev'} (${model})`
  return parseSystemOneAnswers(data.answers, input, ruleKeyMap, minConf, modelLabel, provider, Date.now() - started)
}

async function callGeminiDecisionAPI(
  input: EmailDecisionInput,
  decision: DecisionAISettings | undefined,
  apiKey: string
): Promise<EmailDecisionResult> {
  const started = Date.now()
  const endpoint = decision?.endpoint?.trim() || DEFAULT_DECISION_ENDPOINTS['gemini-decisions']
  const model = decision?.model?.trim() || DEFAULT_DECISION_MODELS['gemini-decisions']
  const { questions, ruleKeyMap } = buildSystemOneQuestions(input)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      model,
      input: formatEmailState(input),
      questions
    }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!res.ok) {
    throw new Error(`Gemini Decisions error (${res.status}): ${(await res.text()).slice(0, 240)}`)
  }
  const data = (await res.json()) as SystemOneResponse
  if (!data.answers || typeof data.answers !== 'object') {
    throw new Error('Gemini Decisions returned no answers object.')
  }
  const minConf = clamp01(decision?.autoDraftMinConfidence, 0.72)
  return parseSystemOneAnswers(
    data.answers,
    input,
    ruleKeyMap,
    minConf,
    `Gemini Decisions (${model})`,
    'gemini-decisions',
    Date.now() - started
  )
}

interface OpenAIDecisionQuestion {
  name: string
  type: 'predicate' | 'choice' | 'score'
  instructions: string
  choices?: string[]
  rubric?: { min: number; max: number; description: string }
}

interface OpenAIDecisionAnswer {
  name: string
  type: 'predicate' | 'choice' | 'score'
  value: boolean | string | number
  probability?: number
}

interface OpenAIDecisionResponse {
  answers?: OpenAIDecisionAnswer[]
}

function predicateYesProbability(ans?: OpenAIDecisionAnswer): number {
  if (!ans) return 0
  const prob = clamp01(ans.probability, ans.value ? 0.9 : 0.1)
  return ans.value === true ? prob : 1 - prob
}

async function callOpenAIDecisionAPI(
  input: EmailDecisionInput,
  decision: DecisionAISettings | undefined,
  apiKey: string
): Promise<EmailDecisionResult> {
  const started = Date.now()
  const endpoint = decision?.endpoint?.trim() || DEFAULT_DECISION_ENDPOINTS['openai-decisions']
  const model = decision?.model?.trim() || DEFAULT_DECISION_MODELS['openai-decisions']

  const questions: OpenAIDecisionQuestion[] = [
    {
      name: 'bundle',
      type: 'choice',
      choices: [...VALID_BUNDLES],
      instructions: `Classify this email into the best bundle: ${Object.entries(BUNDLE_CRITERIA)
        .map(([k, v]) => `${k} (${v})`)
        .join('; ')}`
    },
    {
      name: 'urgency',
      type: 'score',
      rubric: {
        min: 0,
        max: 3,
        description: URGENCY_CRITERIA.join(' ')
      },
      instructions: 'Rate how urgent this email is for the recipient from 0 to 3.'
    },
    {
      name: 'needs_reply',
      type: 'predicate',
      instructions:
        'Does a real person expect a reply from the recipient? False for automated notifications, receipts, newsletters, promos, or pure FYIs.'
    },
    {
      name: 'auto_draft_worthy',
      type: 'predicate',
      instructions:
        'Would a short, helpful pre-drafted reply save the recipient time? True only if a human reply is clearly expected and enough context exists to draft one.'
    },
    {
      name: 'has_implicit_event',
      type: 'predicate',
      instructions:
        'Does this email mention a specific upcoming meeting, appointment, call, flight, or reservation with a date/time?'
    },
    {
      name: 'phishing_risk',
      type: 'score',
      rubric: {
        min: 0,
        max: 2,
        description: PHISHING_CRITERIA.join(' ')
      },
      instructions: 'Rate phishing/scam risk from 0 (legitimate) to 2 (high risk).'
    }
  ]

  if (input.isSent) {
    questions.push({
      name: 'expects_reply',
      type: 'predicate',
      instructions: 'Does this sent email ask a question or request something expecting a reply?'
    })
  }

  const ruleKeyMap = new Map<string, string>()
  if (input.rules?.length) {
    input.rules.forEach((rule, idx) => {
      if (!rule.prompt?.trim()) return
      const name = `rule_${idx}`
      ruleKeyMap.set(name, rule.id)
      questions.push({
        name,
        type: 'predicate',
        instructions: `Does this email match the following user rule? Rule: ${rule.prompt.trim()}`
      })
    })
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: formatEmailState(input),
      questions
    }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!res.ok) {
    throw new Error(`OpenAI Decisions error (${res.status}): ${(await res.text()).slice(0, 240)}`)
  }
  const data = (await res.json()) as OpenAIDecisionResponse
  if (!Array.isArray(data.answers)) {
    throw new Error('OpenAI Decisions returned no answers array.')
  }

  const byName = new Map<string, OpenAIDecisionAnswer>()
  for (const ans of data.answers) {
    if (ans?.name) byName.set(ans.name, ans)
  }

  const minConf = clamp01(decision?.autoDraftMinConfidence, 0.72)
  const bundle = normalizeBundle(byName.get('bundle')?.value, input.isSent ? 'waiting' : 'fyi')
  const urgency = clampInt<0 | 1 | 2 | 3>(byName.get('urgency')?.value, 0, 3, 1)
  const replyProb = predicateYesProbability(byName.get('needs_reply'))
  const needsReply = !input.isSent && replyProb >= 0.5
  const autoDraftProb = predicateYesProbability(byName.get('auto_draft_worthy'))
  const autoDraftWorthy = needsReply && autoDraftProb >= minConf
  const hasImplicitEvent =
    !input.hasCalendarInvite && predicateYesProbability(byName.get('has_implicit_event')) >= 0.6
  const phishingRisk = clampInt<0 | 1 | 2>(byName.get('phishing_risk')?.value, 0, 2, 0)
  const expectsReply = input.isSent ? predicateYesProbability(byName.get('expects_reply')) >= 0.55 : undefined

  const matchedRuleIds: string[] = []
  for (const [name, ruleId] of ruleKeyMap.entries()) {
    if (predicateYesProbability(byName.get(name)) >= 0.65) {
      matchedRuleIds.push(ruleId)
    }
  }

  return {
    bundle,
    urgency,
    needsReply,
    replyConfidence: Math.round(replyProb * 100) / 100,
    autoDraftWorthy,
    aiReason: deriveReason({ bundle, urgency, needsReply, phishingRisk, hasImplicitEvent, expectsReply }),
    hasImplicitEvent,
    phishingRisk,
    expectsReply,
    matchedRuleIds,
    modelLabel: `OpenAI Decisions (${model})`,
    providerUsed: 'openai-decisions',
    latencyMs: Date.now() - started
  }
}

// ---------------------------------------------------------------------------
// Local-Fast Structured JSON Fallback
// ---------------------------------------------------------------------------

interface RawLocalFastDecision {
  bundle?: string
  urgency?: number
  needsReply?: boolean
  replyConfidence?: number
  autoDraftWorthy?: boolean
  aiReason?: string
  hasImplicitEvent?: boolean
  phishingRisk?: number
  expectsReply?: boolean
  matchedRuleIds?: string[]
}

function makeSecretReader(apiKeys: DecisionApiKeys, secrets?: SecretReader): SecretReader {
  if (secrets) return secrets
  return {
    get: (key: string) => {
      if (key === 'ai_key:gemini') return apiKeys.gemini ?? null
      if (key === 'ai_key:openai') return apiKeys.openai ?? null
      if (key === 'ai_key:jev') return apiKeys.jev ?? null
      if (key === 'ai_key:openrouter') return apiKeys.openrouter ?? null
      return null
    }
  }
}

async function callLocalFastFallback(
  input: EmailDecisionInput,
  settings: AISettings,
  apiKeys: DecisionApiKeys,
  secrets?: SecretReader
): Promise<EmailDecisionResult> {
  const started = Date.now()
  const rulesBlock = input.rules?.length
    ? `\nAlso evaluate these user rules and include any matching rule IDs in "matchedRuleIds":\n${input.rules
        .map((r) => `- "${r.id}": ${r.prompt}`)
        .join('\n')}`
    : ''

  const sentField = input.isSent
    ? '\n  "expectsReply": boolean (true if this sent message asks a question or expects a response),'
    : ''

  const res = await completeFastAI(
    {
      jsonMode: true,
      maxTokens: 384,
      priority: input.priority ?? 'background',
      system: `You are EveryBox's fast email triage classifier. Evaluate the email and return STRICT JSON ONLY (no markdown, no <think> tags):
{
  "bundle": one of "action" | "waiting" | "fyi" | "finance" | "shipping" | "newsletter" | "promo" | "cold_outreach" | "security",
  "urgency": integer 0 (low) to 3 (urgent today),
  "needsReply": boolean (true ONLY if a human expects a reply from the recipient),
  "replyConfidence": number 0.0 to 1.0,
  "autoDraftWorthy": boolean (true ONLY if needsReply is true and a short helpful reply can be drafted),
  "aiReason": "very short <= 10 word reason",
  "hasImplicitEvent": boolean (true if mentions a concrete upcoming meeting/appointment/flight with a date/time),
  "phishingRisk": integer 0 (legit) | 1 (suspicious) | 2 (high scam/phishing risk),${sentField}
  "matchedRuleIds": ["matching rule ids from list below, or empty array"]
}${rulesBlock}`,
      prompt: formatEmailState(input)
    },
    settings,
    makeSecretReader(apiKeys, secrets)
  )

  const parsed = extractJsonBlock<RawLocalFastDecision>(stripThinkingTags(res.text))
  if (!parsed) {
    throw new Error('Fast AI classifier returned invalid JSON.')
  }

  const minConf = clamp01(settings.decision?.autoDraftMinConfidence, 0.72)
  const bundle = normalizeBundle(parsed.bundle, input.isSent ? 'waiting' : 'fyi')
  const urgency = clampInt<0 | 1 | 2 | 3>(parsed.urgency, 0, 3, 1)
  const replyConfidence = clamp01(
    parsed.replyConfidence,
    parsed.needsReply ? 0.8 : 0.15
  )
  const needsReply = !input.isSent && Boolean(parsed.needsReply) && replyConfidence >= 0.45
  const autoDraftWorthy =
    needsReply && Boolean(parsed.autoDraftWorthy) && replyConfidence >= minConf
  const hasImplicitEvent = !input.hasCalendarInvite && Boolean(parsed.hasImplicitEvent)
  const phishingRisk = clampInt<0 | 1 | 2>(parsed.phishingRisk, 0, 2, 0)
  const expectsReply = input.isSent ? Boolean(parsed.expectsReply) : undefined
  const validRuleIds = new Set((input.rules || []).map((r) => r.id))
  const matchedRuleIds = Array.isArray(parsed.matchedRuleIds)
    ? parsed.matchedRuleIds.filter((id): id is string => typeof id === 'string' && validRuleIds.has(id))
    : []
  const aiReason =
    typeof parsed.aiReason === 'string' && parsed.aiReason.trim()
      ? parsed.aiReason.trim().slice(0, 120)
      : deriveReason({ bundle, urgency, needsReply, phishingRisk, hasImplicitEvent, expectsReply })

  return {
    bundle,
    urgency,
    needsReply,
    replyConfidence: Math.round(replyConfidence * 100) / 100,
    autoDraftWorthy,
    aiReason,
    hasImplicitEvent,
    phishingRisk,
    expectsReply,
    matchedRuleIds,
    modelLabel: `Fast AI · ${res.providerLabel}`,
    providerUsed: 'local-fast',
    latencyMs: Date.now() - started
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate an email (plus optional user Autopilot `aiPrompt` rules) in a single pass
 * using the configured Decision AI provider, falling back to `local-fast` when in `'auto'` mode.
 */
export async function evaluateEmailDecisions(
  input: EmailDecisionInput,
  settings: AISettings,
  apiKeys: DecisionApiKeys,
  secrets?: SecretReader
): Promise<EmailDecisionResult> {
  const decision = settings.decision
  const requestedProvider = decision?.provider ?? 'auto'
  if (decision?.enabled === false || requestedProvider === 'off') {
    throw new Error('Decision AI is disabled in Settings.')
  }

  const resolved = resolveDecisionProvider(decision, apiKeys)

  const runProvider = async (provider: ResolvedDecisionProvider): Promise<EmailDecisionResult> => {
    switch (provider) {
      case 'jev': {
        const key = apiKeys.jev?.trim()
        if (!key) throw new Error('TypeSafe AI (Jev) API key is not configured.')
        return callJevLikeDecisionAPI('jev', input, decision, key)
      }
      case 'openrouter-jev': {
        const key = apiKeys.openrouter?.trim()
        if (!key) throw new Error('OpenRouter API key is not configured.')
        return callJevLikeDecisionAPI('openrouter-jev', input, decision, key)
      }
      case 'gemini-decisions': {
        const key = apiKeys.gemini?.trim()
        if (!key) throw new Error('Gemini API key is not configured.')
        return callGeminiDecisionAPI(input, decision, key)
      }
      case 'openai-decisions': {
        const key = apiKeys.openai?.trim()
        if (!key) throw new Error('OpenAI API key is not configured.')
        return callOpenAIDecisionAPI(input, decision, key)
      }
      case 'local-fast':
        return callLocalFastFallback(input, settings, apiKeys, secrets)
    }
  }

  try {
    return await runProvider(resolved)
  } catch (err) {
    // In 'auto' mode, gracefully degrade from a failed native decision API to local-fast
    if (requestedProvider === 'auto' && resolved !== 'local-fast') {
      return await callLocalFastFallback(input, settings, apiKeys, secrets)
    }
    throw err
  }
}

/**
 * Test connectivity and response validity for the configured Decision AI provider.
 */
export async function testDecisionProvider(
  settings: AISettings,
  apiKeys: DecisionApiKeys,
  secrets?: SecretReader
): Promise<DecisionProviderTestResult> {
  const started = Date.now()
  const decision = settings.decision
  const requested = decision?.provider ?? 'auto'

  if (requested === 'off') {
    return {
      ok: false,
      latencyMs: 0,
      detail: 'Decision AI provider is set to Off.',
      modelLabel: 'Off'
    }
  }

  const resolved = resolveDecisionProvider(decision, apiKeys)
  const sampleInput: EmailDecisionInput = {
    subject: 'Quick check-in on Thursday at 2pm?',
    fromName: 'Alex Rivera',
    fromEmail: 'alex@example.com',
    dateMs: Date.now(),
    snippet: 'Hi! Are you free Thursday at 2pm to review the Q3 proposal? Let me know.',
    bodyText: 'Hi! Are you free Thursday at 2pm to review the Q3 proposal? Let me know.',
    priority: 'interactive'
  }

  // Test the exact resolved provider directly (without silent fallback) so failures surface clearly
  const testSettings: AISettings = {
    ...settings,
    decision: {
      enabled: true,
      ...decision,
      provider: resolved
    }
  }

  try {
    const result = await evaluateEmailDecisions(sampleInput, testSettings, apiKeys, secrets)
    return {
      ok: true,
      latencyMs: result.latencyMs,
      detail: `Classified as "${result.bundle}" (urgency ${result.urgency}, needsReply=${result.needsReply}, conf=${Math.round(result.replyConfidence * 100)}%)`,
      modelLabel: result.modelLabel
    }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      detail: err instanceof Error ? err.message : String(err),
      modelLabel: resolved
    }
  }
}
