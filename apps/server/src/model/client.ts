/**
 * The one module that owns every model call (ADR 0008).
 *
 * **One interface, three routes behind it** (amended 2026-09-11, STE-62):
 *
 * - **api** — production, where an API key is present. One Messages API request
 *   per call, carrying our prompt and nothing else. Paid from the prepaid
 *   balance, and estimated at about a penny a run.
 * - **agent-sdk** — local and evals, where by rule no key exists. The Claude
 *   Agent SDK, authenticating through the logged-in Claude Code session. It
 *   carries the whole harness — 117,000 to 270,000 input tokens a call on the
 *   first live runs — which is subscription capacity, never the balance. That
 *   measurement is why production does not take this route.
 * - **mock** — first-class, no call, no spend.
 *
 * **No local API key may be created to make the api route run on a laptop**
 * (CLAUDE.md, *Conventions*). It would make every local run draw on the balance.
 *
 * Two calls, and neither produces a number the manager is shown:
 *
 * - **propose** — Haiku picks transfers from a code-built shortlist of named
 *   fields. Never raw `bootstrap-static` (ADR 0009). Every proposal is checked by
 *   the plan before it is used.
 * - **reason** — Sonnet writes one card's line from that card's table values
 *   alone. The line is checked in `reasoning.ts` before it is used.
 *
 * Every call is recorded — the route, the pinned identifier, the model the
 * provider reports it actually ran, tokens including cache, and cost — because
 * the run record is the one place the pin can be checked after the fact.
 */

import { tmpdir } from 'node:os'
import Anthropic from '@anthropic-ai/sdk'
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk'
import { type Band, type EvaluationRow, formatRowValue } from '@fpl/engine'
import type { TransferProposal } from '../calls/plan.js'

/** Explicit identifiers, never an alias that resolves differently next month. */
export const PINNED = { propose: 'claude-haiku-4-5', reason: 'claude-sonnet-5' } as const

export type ModelStep = 'propose' | 'reason'
export type ModelRoute = 'api' | 'agent-sdk' | 'mock'

export type ModelCallRecord = {
  step: ModelStep
  /** Which route carried the call. */
  via: ModelRoute
  /** What this build asked for. */
  pinned: string
  /** What the provider reports it ran — the evidence. `mock` or `none` where nothing ran. */
  modelId: string
  /** Everything the model was sent, cache reads and writes included. */
  inputTokens: number
  outputTokens: number
  /** An estimate at list price, not a bill. Null where the model has no price on file. */
  costUsd: number | null
  ok: boolean
}

/** One player, as the proposal call sees him: named fields, nothing else. */
export type ShortPlayer = {
  id: number
  name: string
  position: string
  club: string
  priceTenths: number
  /** This gameweek and the two after, from the bought-in feed. */
  projections: number[]
  /** FPL's status letter and chance-of-playing, as published. */
  status: string
  chanceOfPlaying: number | null
}

export type ProposalInput = {
  bankTenths: number
  freeTransfers: number
  squad: ShortPlayer[]
  shortlist: { outPlayerId: number; candidates: ShortPlayer[] }[]
}

export type ReasoningInput = {
  outName: string
  inName: string
  rows: readonly EvaluationRow[]
  summary: { net: number; strength: number; band: Band }
}

export interface ModelPort {
  readonly backend: ModelRoute
  proposeTransfers(input: ProposalInput): Promise<{ proposals: TransferProposal[]; record: ModelCallRecord }>
  writeReasoning(input: ReasoningInput): Promise<{ text: string; record: ModelCallRecord }>
}

type Env = Record<string, string | undefined>

/** At most this many proposals are asked for; the plan decides how many survive. */
const MAX_PROPOSALS = 3

const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      maxItems: MAX_PROPOSALS,
      items: {
        type: 'object',
        properties: { outPlayerId: { type: 'integer' }, inPlayerId: { type: 'integer' } },
        required: ['outPlayerId', 'inPlayerId'],
        additionalProperties: false,
      },
    },
  },
  required: ['proposals'],
  additionalProperties: false,
} as const

const PROPOSE_SYSTEM = [
  'You scout transfers for one Fantasy Premier League manager.',
  `Propose at most ${MAX_PROPOSALS} transfers, strongest first, choosing only pairs from the shortlist given:`,
  'each out player with one of the candidates listed under him.',
  'Projections are points for this gameweek and the two after. A differential or a fixture swing is a legitimate pick.',
  'Propose none rather than a weak one. Answer with the JSON object only.',
].join(' ')

const REASON_SYSTEM = [
  'Write the reason a Fantasy Premier League manager should make this change, in at most two short sentences',
  `and under ${String(160)} characters. Use only the values in the table given — nothing else exists for you.`,
  'Take a position; do not hedge. The strength figure is the strength of the call, never a chance,',
  'probability or confidence, and must not be described as one. No preamble, no quotation marks.',
].join(' ')

/**
 * List prices, US dollars per million tokens, from the claude-api reference
 * (cached 2026-06-24). An estimate for the early-warning figure ADR 0009 relies
 * on, never a bill — the console balance is the bill (P7). A model not listed
 * records no cost rather than a guessed one.
 */
const PRICES: Readonly<Record<string, { input: number; output: number }>> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 2, output: 10 },
}
const CACHE_WRITE_MULTIPLIER = 1.25
const CACHE_READ_MULTIPLIER = 0.1

const pinnedFrom = (env: Env) => ({
  propose: env['ANTHROPIC_MODEL_FILTER']?.trim() || PINNED.propose,
  reason: env['ANTHROPIC_MODEL_REASON']?.trim() || PINNED.reason,
})

const unrecorded = (step: ModelStep, via: ModelRoute, pinned: string, modelId: string, ok: boolean): ModelCallRecord => ({
  step,
  via,
  pinned,
  modelId,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  ok,
})

/** Only what the card shows: its rows, as the manager reads them, and its summary strip. */
const reasoningPrompt = (input: ReasoningInput): string =>
  [
    `Change: ${input.outName} out, ${input.inName} in.`,
    `Net: +${input.summary.net.toFixed(2)} projected points. Strength ${String(input.summary.strength)} (${input.summary.band}).`,
    ...input.rows.map(
      (r) =>
        `${r.label}: ${input.outName} ${formatRowValue(r.key, r.out)} · ${input.inName} ${formatRowValue(r.key, r.in)} · ahead: ${
          r.winner === 'tie' ? 'level' : r.winner === 'in' ? input.inName : input.outName
        }`,
    ),
  ].join('\n')

/** Whatever came back, reduced to well-formed pairs. The plan checks the rest. */
const parseProposals = (raw: unknown): TransferProposal[] =>
  (Array.isArray(raw) ? raw : [])
    .filter(
      (p): p is TransferProposal =>
        typeof p === 'object' &&
        p !== null &&
        Number.isInteger((p as Record<string, unknown>)['outPlayerId']) &&
        Number.isInteger((p as Record<string, unknown>)['inPlayerId']),
    )
    .map((p) => ({ outPlayerId: p.outPlayerId, inPlayerId: p.inPlayerId }))

/**
 * Production: the Messages API, directly. One request per call, our system
 * prompt and one message — nothing else is sent, which is the whole point.
 */
export function apiModel(opts: { client?: Pick<Anthropic, 'messages'>; env?: Env }): ModelPort {
  const env = opts.env ?? process.env
  const pinned = pinnedFrom(env)
  const client = opts.client ?? new Anthropic({ apiKey: env['ANTHROPIC_API_KEY'] })

  async function call(
    step: ModelStep,
    system: string,
    prompt: string,
  ): Promise<{ text: string | null; record: ModelCallRecord }> {
    const model = pinned[step]
    try {
      const response = await client.messages.create({
        model,
        max_tokens: step === 'propose' ? 1024 : 300,
        system,
        messages: [{ role: 'user', content: prompt }],
        // Haiku does not think unless asked and takes no effort setting; Sonnet
        // is told not to think and to be brief. Neither needs to reason at length.
        ...(step === 'propose'
          ? { output_config: { format: { type: 'json_schema' as const, schema: PROPOSAL_SCHEMA } } }
          : { thinking: { type: 'disabled' as const }, output_config: { effort: 'low' as const } }),
      })

      const u = response.usage
      const cacheWrite = u.cache_creation_input_tokens ?? 0
      const cacheRead = u.cache_read_input_tokens ?? 0
      const price = PRICES[response.model]
      const ok = response.stop_reason !== 'refusal'
      const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('')

      return {
        text: ok ? text : null,
        record: {
          step,
          via: 'api',
          pinned: model,
          modelId: response.model,
          inputTokens: u.input_tokens + cacheWrite + cacheRead,
          outputTokens: u.output_tokens,
          costUsd: price
            ? (u.input_tokens * price.input +
                cacheWrite * price.input * CACHE_WRITE_MULTIPLIER +
                cacheRead * price.input * CACHE_READ_MULTIPLIER +
                u.output_tokens * price.output) /
              1_000_000
            : null,
          ok,
        },
      }
    } catch (cause) {
      // Recorded and yields nothing. The plan falls back to code and the card to
      // its template — the week is never withheld because the model was
      // unreachable or the balance ran out.
      console.error(`[model] ${step} via api failed`, cause instanceof Error ? cause.message : cause)
      return { text: null, record: unrecorded(step, 'api', model, 'none', false) }
    }
  }

  return {
    backend: 'api',

    async proposeTransfers(input) {
      const { text, record } = await call('propose', PROPOSE_SYSTEM, JSON.stringify(input))
      let parsed: unknown = null
      try {
        parsed = text ? (JSON.parse(text) as unknown) : null
      } catch {
        parsed = null
      }
      return { proposals: parseProposals((parsed as { proposals?: unknown } | null)?.proposals), record }
    },

    async writeReasoning(input) {
      const { text, record } = await call('reason', REASON_SYSTEM, reasoningPrompt(input))
      return { text: text ?? '', record }
    },
  }
}

type QueryFn = typeof sdkQuery

type ResultMessage = {
  type: 'result'
  subtype: string
  is_error?: boolean
  result?: string
  structured_output?: unknown
  total_cost_usd?: number
  modelUsage?: Record<
    string,
    {
      inputTokens: number
      outputTokens: number
      cacheReadInputTokens?: number
      cacheCreationInputTokens?: number
      costUSD: number
    }
  >
}

/** Local and evals: the Agent SDK, through the logged-in Claude Code session. */
export function liveModel(opts: { query?: QueryFn; env?: Env }): ModelPort {
  const query = opts.query ?? sdkQuery
  const pinned = pinnedFrom(opts.env ?? process.env)

  async function call(
    step: ModelStep,
    prompt: string,
    system: string,
    schema?: Record<string, unknown>,
  ): Promise<{ result: ResultMessage | null; record: ModelCallRecord }> {
    const model = pinned[step]
    try {
      const messages = query({
        prompt,
        options: {
          model,
          systemPrompt: system,
          // No built-in tools, no MCP, nothing on disk read or written. The model
          // is given the prompt and nothing else, which is the enforcement.
          tools: [],
          // Omitted, the SDK loads every settings file including this repo's
          // CLAUDE.md. Empty is isolation.
          settingSources: [],
          persistSession: false,
          cwd: tmpdir(),
          maxTurns: schema ? 3 : 1,
          // Neither call needs to reason at length: one picks from a shortlist,
          // the other writes two sentences. Thinking left on produced 11,840
          // output tokens for a three-item list on the first live run.
          thinking: { type: 'disabled' as const },
          ...(schema ? { outputFormat: { type: 'json_schema' as const, schema } } : {}),
          ...(step === 'reason' ? { effort: 'low' as const } : {}),
        },
      })

      let result: ResultMessage | null = null
      for await (const message of messages as AsyncIterable<{ type: string }>) {
        if (message.type === 'result') result = message as ResultMessage
      }

      // Cache reads and writes are input the model was sent. Counting only the
      // uncached remainder recorded 2 tokens for a call that cost $0.42 on the
      // first live run — the early-warning figure ADR 0009 relies on, hiding the
      // very growth it exists to show.
      const usage = Object.entries(result?.modelUsage ?? {}).map(
        ([id, u]) =>
          [id, { input: u.inputTokens + (u.cacheReadInputTokens ?? 0) + (u.cacheCreationInputTokens ?? 0), output: u.outputTokens }] as const,
      )
      const [modelId] = usage.reduce<[string, number]>(
        (top, [id, u]) => (u.input + u.output > top[1] ? [id, u.input + u.output] : top),
        ['none', -1],
      )
      const ok = result !== null && result.subtype === 'success' && result.is_error !== true

      return {
        result: ok ? result : null,
        record: {
          step,
          via: 'agent-sdk',
          pinned: model,
          modelId,
          inputTokens: usage.reduce((sum, [, u]) => sum + u.input, 0),
          outputTokens: usage.reduce((sum, [, u]) => sum + u.output, 0),
          costUsd: result?.total_cost_usd ?? 0,
          ok,
        },
      }
    } catch {
      return { result: null, record: unrecorded(step, 'agent-sdk', model, 'none', false) }
    }
  }

  return {
    backend: 'agent-sdk',

    async proposeTransfers(input) {
      const { result, record } = await call('propose', JSON.stringify(input), PROPOSE_SYSTEM, PROPOSAL_SCHEMA)
      const raw = (result?.structured_output as { proposals?: unknown } | undefined)?.proposals
      return { proposals: parseProposals(raw), record }
    },

    async writeReasoning(input) {
      const { result, record } = await call('reason', reasoningPrompt(input), REASON_SYSTEM)
      return { text: result?.result ?? '', record }
    },
  }
}

/** The first-class mock path (ADR 0008): no call, no spend, and the plan is code's. */
export function mockModel(): ModelPort {
  return {
    backend: 'mock',
    async proposeTransfers() {
      return { proposals: [], record: unrecorded('propose', 'mock', 'mock', 'mock', true) }
    },
    async writeReasoning() {
      return { text: '', record: unrecorded('reason', 'mock', 'mock', 'mock', true) }
    },
  }
}

/**
 * Which route runs, decided in one place. `MODEL_MODE=mock` forces the mock;
 * a key means production's direct route; no key means the Claude Code session.
 */
export function modelFromEnv(env: Env = process.env): ModelPort {
  if (env['MODEL_MODE']?.trim() === 'mock') return mockModel()
  if (env['ANTHROPIC_API_KEY']?.trim()) return apiModel({ env })
  return liveModel({ env })
}
