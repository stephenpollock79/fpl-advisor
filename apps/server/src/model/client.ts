/**
 * The one module that owns every model call (ADR 0008).
 *
 * Via the Claude Agent SDK, authenticating two ways behind one interface: in
 * production the SDK reads `ANTHROPIC_API_KEY` from the environment and draws on
 * the prepaid balance; locally there is **no key, and none may be created** — the
 * logged-in Claude Code session authenticates instead (CLAUDE.md, *Conventions*).
 *
 * Two calls, and neither produces a number the manager is shown:
 *
 * - **propose** — Haiku picks transfers from a code-built shortlist of named
 *   fields. Never raw `bootstrap-static` (ADR 0009). Every proposal is checked by
 *   the plan before it is used.
 * - **reason** — Sonnet writes one card's line from that card's table values
 *   alone. The line is checked in `reasoning.ts` before it is used.
 *
 * Every call is recorded — the pinned identifier, the model the SDK reports it
 * actually ran, tokens and cost — because the run record is the one place the
 * pin can be checked after the fact. The config is only a claim.
 */

import { tmpdir } from 'node:os'
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk'
import type { Band, EvaluationRow } from '@fpl/engine'
import type { TransferProposal } from '../calls/plan.js'

/** Explicit identifiers, never an alias that resolves differently next month. */
export const PINNED = { propose: 'claude-haiku-4-5', reason: 'claude-sonnet-5' } as const

export type ModelStep = 'propose' | 'reason'

export type ModelCallRecord = {
  step: ModelStep
  /** What this build asked for. */
  pinned: string
  /** What the SDK reports it ran — the evidence. `mock` or `none` where nothing ran. */
  modelId: string
  inputTokens: number
  outputTokens: number
  costUsd: number
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
  proposeTransfers(input: ProposalInput): Promise<{ proposals: TransferProposal[]; record: ModelCallRecord }>
  writeReasoning(input: ReasoningInput): Promise<{ text: string; record: ModelCallRecord }>
}

type QueryFn = typeof sdkQuery
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
  'Propose none rather than a weak one.',
].join(' ')

const REASON_SYSTEM = [
  'Write the reason a Fantasy Premier League manager should make this change, in at most two short sentences',
  `and under ${String(160)} characters. Use only the values in the table given — nothing else exists for you.`,
  'Take a position; do not hedge. The strength figure is the strength of the call, never a chance,',
  'probability or confidence, and must not be described as one. No preamble, no quotation marks.',
].join(' ')

const unrecorded = (step: ModelStep, pinned: string, modelId: string, ok: boolean): ModelCallRecord => ({
  step,
  pinned,
  modelId,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  ok,
})

type ResultMessage = {
  type: 'result'
  subtype: string
  is_error?: boolean
  result?: string
  structured_output?: unknown
  total_cost_usd?: number
  modelUsage?: Record<string, { inputTokens: number; outputTokens: number; costUSD: number }>
}

export function liveModel(opts: { query?: QueryFn; env?: Env }): ModelPort {
  const query = opts.query ?? sdkQuery
  const env = opts.env ?? process.env
  const pinned = {
    propose: env['ANTHROPIC_MODEL_FILTER']?.trim() || PINNED.propose,
    reason: env['ANTHROPIC_MODEL_REASON']?.trim() || PINNED.reason,
  }

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
          ...(schema ? { outputFormat: { type: 'json_schema' as const, schema } } : {}),
          ...(step === 'reason' ? { effort: 'low' as const } : {}),
        },
      })

      let result: ResultMessage | null = null
      for await (const message of messages as AsyncIterable<{ type: string }>) {
        if (message.type === 'result') result = message as ResultMessage
      }

      const usage = Object.entries(result?.modelUsage ?? {})
      const [modelId] = usage.reduce<[string, number]>(
        (top, [id, u]) => (u.inputTokens + u.outputTokens > top[1] ? [id, u.inputTokens + u.outputTokens] : top),
        ['none', -1],
      )
      const ok = result !== null && result.subtype === 'success' && result.is_error !== true

      return {
        result: ok ? result : null,
        record: {
          step,
          pinned: model,
          modelId,
          inputTokens: usage.reduce((sum, [, u]) => sum + u.inputTokens, 0),
          outputTokens: usage.reduce((sum, [, u]) => sum + u.outputTokens, 0),
          costUsd: result?.total_cost_usd ?? 0,
          ok,
        },
      }
    } catch {
      // A failed call is recorded and yields nothing. The plan then falls back to
      // code and the card to its template — the week is never withheld because
      // the model was unreachable or the balance ran out.
      return { result: null, record: unrecorded(step, model, 'none', false) }
    }
  }

  return {
    async proposeTransfers(input) {
      const { result, record } = await call('propose', JSON.stringify(input), PROPOSE_SYSTEM, PROPOSAL_SCHEMA)
      const raw = (result?.structured_output as { proposals?: unknown } | undefined)?.proposals
      const proposals = (Array.isArray(raw) ? raw : [])
        .filter(
          (p): p is TransferProposal =>
            typeof p === 'object' &&
            p !== null &&
            Number.isInteger((p as Record<string, unknown>)['outPlayerId']) &&
            Number.isInteger((p as Record<string, unknown>)['inPlayerId']),
        )
        .map((p) => ({ outPlayerId: p.outPlayerId, inPlayerId: p.inPlayerId }))
      return { proposals, record }
    },

    async writeReasoning(input) {
      // Only what the card shows: its rows and its summary strip.
      const table = input.rows
        .map((r) => `${r.label}: ${input.outName} ${String(r.out ?? '—')} · ${input.inName} ${String(r.in ?? '—')} · ahead: ${r.winner === 'tie' ? 'level' : r.winner === 'in' ? input.inName : input.outName}`)
        .join('\n')
      const prompt = [
        `Change: ${input.outName} out, ${input.inName} in.`,
        `Net: +${input.summary.net.toFixed(2)} projected points. Strength ${String(input.summary.strength)} (${input.summary.band}).`,
        table,
      ].join('\n')

      const { result, record } = await call('reason', prompt, REASON_SYSTEM)
      return { text: result?.result ?? '', record }
    },
  }
}

/** The first-class mock path (ADR 0008): no call, no spend, and the plan is code's. */
export function mockModel(): ModelPort {
  return {
    async proposeTransfers() {
      return { proposals: [], record: unrecorded('propose', 'mock', 'mock', true) }
    },
    async writeReasoning() {
      return { text: '', record: unrecorded('reason', 'mock', 'mock', true) }
    },
  }
}

/** `MODEL_MODE=mock` forces the mock path; anything else is live. */
export function modelFromEnv(env: Env = process.env): ModelPort {
  return env['MODEL_MODE']?.trim() === 'mock' ? mockModel() : liveModel({ env })
}
