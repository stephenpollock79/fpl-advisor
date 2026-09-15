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
export const PINNED = {
  propose: 'claude-haiku-4-5',
  reason: 'claude-sonnet-5',
  /**
   * The same model as `reason` and a step of its own, deliberately: the run
   * record is where the week's spend is read off (NFR Cost control), and an
   * editorial counted as reasoning would hide one call per run inside a number
   * everyone reads as per-card.
   */
  editorial: 'claude-sonnet-5',
  /**
   * **Reading a screenshot is extraction, and ADR 0009 routes extraction to
   * Haiku.** So this is the ADR's choice rather than a judgement made here. Its
   * own step, not a second `propose`, so an upload's cost is visible on the run
   * record instead of hiding inside the proposal count (F2, NFR Cost control).
   */
  parse: 'claude-haiku-4-5',
} as const

export type ModelStep = 'propose' | 'reason' | 'editorial' | 'parse'
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
  /**
   * What kind of move this is, in the card's own terms.
   *
   * **Not extra evidence — the card's own eyebrow says it.** Without it the model
   * was told *"Change: X out, Y in"* on a captaincy call and reasonably concluded
   * a player was being sold, writing about freeing up £7.7m on a call where no
   * money moves at all (found live 2026-09-14, F4-AC-09).
   */
  kind: 'transfer' | 'substitution' | 'captain' | 'vice'
}

/**
 * The editorial's input (F8-AC-01, F8-AC-08).
 *
 * **Only what the Overview itself shows.** The same construction rule as the
 * per-card reasoning, one level up: the editorial is a synthesis across the
 * week's cards, so it is given each call's own card-level figures and nothing
 * about the evidence, the news or the opinion context the proposal step drew on.
 * Widening this to improve the prose turns a citation of visible data into a
 * hallucination from hidden data.
 *
 * **What is deliberately *not* here: the decided count, the tally and the
 * flagged summary.** All three are nil at the moment a run writes — no decision
 * has been taken and the run has just consumed the news — and computing them
 * here as well as in the client would give `F8-AC-06`'s one list two
 * implementations. The exception and the squad source arrive as facts rather
 * than as sentences for the same reason: the client owns the wording, and the
 * model is told only that a lead exists so it does not write one of its own.
 */
export type EditorialInput = {
  calls: { title: string; net: number; band: string | null; forced: boolean }[]
  /** A lead sentence about this is shown above the paragraph (F8-AC-07). */
  exception: 'blank' | 'double' | null
  squadSource: 'deadline' | 'screenshot'
}

export interface ModelPort {
  readonly backend: ModelRoute
  proposeTransfers(input: ProposalInput): Promise<{ proposals: TransferProposal[]; record: ModelCallRecord }>
  writeReasoning(input: ReasoningInput): Promise<{ text: string; record: ModelCallRecord }>
  /**
   * The week in one read. Uses the `reason` step's pinned model and budget —
   * the same job, written over the week instead of over one card.
   */
  writeEditorial(input: EditorialInput): Promise<{ text: string; record: ModelCallRecord }>
  /**
   * The two screenshots, read (F2). **Returns what it saw and nothing more** —
   * every check on whether the read is usable is `parseSquad`'s, in code, so a
   * model that half-reads a picture cannot decide the result is good enough.
   */
  readSquadScreenshots(
    input: ScreenshotInput,
  ): Promise<{ raw: unknown; record: ModelCallRecord; because?: string }>
}

/** Two images, each a base64 data URL as the browser produced it. */
export type ScreenshotInput = {
  team: string
  transfers: string
  /**
   * **Every player FPL tracks, by name, for the model to choose from.**
   *
   * A Team screenshot shows a shirt name and never an id, so asking for an id
   * asks for something the picture cannot contain — which is exactly what the
   * first build did, and every upload came back "0 of 15 players legible"
   * (found live 2026-09-15). Naming a list and asking it to choose is how the
   * proposal step already works, and it makes the match exact rather than a
   * recollection.
   */
  players: { id: number; name: string; club: string; position: string; priceTenths?: number }[]
}

type Env = Record<string, string | undefined>

/**
 * A base64 data URL, as the browser produced it, split into what the API wants.
 * **The media type comes from the URL rather than being assumed**: a phone
 * screenshot may arrive as PNG, JPEG or WebP depending on how it was shared,
 * and declaring the wrong one fails the whole request.
 */
/** A body that is not JSON is a failed read, never a throw. `parseSquad` says so. */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** The four the API accepts. Anything else is a failed read, not a conversion job. */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

const isImageType = (v: string): v is ImageType => (IMAGE_TYPES as readonly string[]).includes(v)

function imageBlock(dataUrl: string): {
  type: 'image'
  source: { type: 'base64'; media_type: ImageType; data: string }
} {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  const mediaType = match?.[1]
  const data = match?.[2]
  if (!mediaType || !data) throw new Error('an uploaded image was not a base64 data URL')
  if (!isImageType(mediaType)) throw new Error(`an uploaded image was ${mediaType}, which cannot be read`)
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } }
}

/** At most this many proposals are asked for; the plan decides how many survive. */
const MAX_PROPOSALS = 3

/**
 * Only what structured outputs accept: no array-length, numeric or string-length
 * constraints. The SDK's helpers strip those before sending; a raw schema sent
 * through `messages.create` does not, and `maxItems` here made every production
 * proposal call fail on the first live run (2026-09-11) — the plan fell back to
 * code, correctly, and the model took no part. The cap of three is enforced in
 * `parseProposals` instead.
 */
export const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
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
  // The recommendation is settled before this call is made: code compares the
  // two sides and the winner *is* the recommendation. A line that argues against
  // it leaves the Select and Reject controls meaning nothing.
  'The decision has already been made and this move is the recommendation. Explain why it is the better option.',
  'Never suggest skipping it, holding off, or sticking with what is there — that is not what you are being asked.',
  'Take a position; do not hedge. The strength figure is the strength of the call, never a chance,',
  'probability or confidence, and must not be described as one. No preamble, no quotation marks.',
].join(' ')

/**
 * How the move is put to the model. Each says what actually happens, because a
 * model told the wrong thing reasons impeccably from it.
 */
const OPENING: Readonly<Record<ReasoningInput['kind'], (out: string, into: string) => string>> = {
  transfer: (out, into) => `Transfer: ${out} is sold and ${into} is bought.`,
  substitution: (out, into) =>
    `Substitution: ${out} drops to the bench and ${into} starts. No money moves and no transfer is used.`,
  captain: (out, into) =>
    `The captain's armband moves from ${out} to ${into}. Nobody is bought, sold or benched, and no money moves.`,
  vice: (out, into) =>
    `The vice-captain's armband moves from ${out} to ${into}. Nobody is bought, sold or benched, and no money moves.`,
}

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
  // Follows the reasoning override, because the two are the same job at two
  // scales and pinning them apart by accident is the likelier mistake.
  editorial: env['ANTHROPIC_MODEL_REASON']?.trim() || PINNED.editorial,
  parse: env['ANTHROPIC_MODEL_FILTER']?.trim() || PINNED.parse,
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
    OPENING[input.kind](input.outName, input.inName),
    `Net: +${input.summary.net.toFixed(2)} projected points. Strength ${String(input.summary.strength)} (${input.summary.band}).`,
    ...input.rows.map(
      (r) =>
        `${r.label}: ${input.outName} ${formatRowValue(r.key, r.out)} · ${input.inName} ${formatRowValue(r.key, r.in)} · ahead: ${
          r.winner === 'tie' ? 'level' : r.winner === 'in' ? input.inName : input.outName
        }`,
    ),
  ].join('\n')

/**
 * **Exempt from the two-sentence Voice rule, and bound by the rest of it**
 * (F8-AC-08). It is the week in one read, so it gets a paragraph; it still takes
 * a position and does not hedge.
 */
const EDITORIAL_SYSTEM = [
  "You are the assistant opening one Fantasy Premier League manager's week.",
  'Synthesise what the week asks of him across the calls listed. Take a position; do not hedge.',
  'Plain English, no jargon, no bullet points, no headings, at most five sentences.',
  'Use only the figures given. Never call the strength figure a chance, a likelihood or a confidence.',
  'A lead sentence and a line naming where the squad came from are shown above your paragraph.',
  'Do not write either of those yourself and do not repeat them.',
].join(' ')

/**
 * **It is asked to read, never to judge.** Every check on whether the read is
 * usable lives in `parseSquad`, in code — a model allowed to decide its own
 * output is good enough will say so, and an all-or-nothing rule decided by the
 * thing being checked is not a rule (F2-UP-01).
 */
const PARSE_SYSTEM = [
  'You read two screenshots from the Fantasy Premier League app and report exactly what is on them.',
  'The first is the Team screen. **It always shows exactly fifteen players: eleven in the starting',
  'eleven on the pitch and four substitutes below it. Report all fifteen, every time** — fourteen is',
  'always a miscount, not a smaller squad. Also report which eleven start, the bench order, the',
  'captain, the vice-captain, and which chips remain.',
  'The second is the Transfers screen: the bank and the number of free transfers.',
  '**It shows the same fifteen players over again**, laid out by position rather than by selection —',
  'two goalkeepers, then the defenders, the midfielders and the forwards. Report those fifteen names',
  'as well, reading them off that picture on their own. **Do not copy your answer from the Team',
  'screen and do not make the two lists agree** — reading the second picture separately is the whole',
  'reason it is here, and where the two differ that difference is the useful part.',
  '**Report the name exactly as it is printed on the shirt, character for character.** That name is',
  'what identifies the player, and it is checked against a list afterwards — so do not correct it,',
  'expand it, or substitute a similar name you recognise. If a shirt reads "Van Hecke", report',
  '"Van Hecke" and not another player from the same club.',
  '**The app cuts a long name short on the card — "Calvert-Le…". Report it cut short, exactly as it',
  'is printed.** Code expands it against the real list afterwards. Do not finish it yourself.',
  '**If a card is covered, cropped or otherwise unreadable, still report it** with an empty name',
  'rather than leaving it out: a slot with no name is something the other picture can fill, and a',
  'slot that is simply absent is not.',
  '**Every card also prints, under the name, the opponent\'s three letters and whether the match is',
  'at home or away — "BHA (A)". Report both, for every player, on both screens.** They are checked',
  'against the real fixture list, and they are how a name read wrongly is caught: report what the',
  'card says even where it disagrees with the player you think you are looking at. Where a card shows',
  'no fixture at all, report the opponent as an empty string.',
  '**On the Transfers screen each card also prints the price — "£5.6m". Report it in tenths: 56.**',
  'Again, the pound sign is not a digit. The Team screen shows no price; report 0 there.',
  'Give the matching id from the list below where you are sure of it; where you are not, report the',
  'name alone and leave the id as 0. A wrong id is worse than none.',
  'For each substitute report benchOrder as his place on the bench, reading left to right: 1 for the',
  'first, then 2, 3, 4. For anyone in the starting eleven report 0.',
  '**Many shirts carry a small round badge in the same corner. Report the single character inside',
  'it, and nothing more.** "C" where it holds a C, "V" where it holds a V, and for any other badge —',
  'a star for bonus points, a dot, a numeral — report that character. A shirt with no badge is an',
  'empty string. **Do not work out who the captain is; that is decided from the letter afterwards.**',
  'Report what is drawn in the badge, even where it is not a letter at all.',
  'Report each chip as a pair: its name and whether it remains.',
  '**The budget is printed with a pound sign in front of it — "£0.2m". The pound sign is not a',
  'digit.** Never read it as a 2, or as any other number. Read the digits only, and report the figure',
  'as a whole number of tenths of a million: £0.2m is 2, £2.8m is 28, £12.5m is 125.',
  'Report only what you can actually read. Never guess a player, a number or an armband,',
  'and never fill a gap to make the list complete. Answer with the JSON object only.',
].join(' ')

/** The candidate list, one line each. Named fields — never a feed response passed through. */
const playerList = (players: ScreenshotInput['players']): string =>
  players
    .map(
      (p) =>
        `${String(p.id)} ${p.name} (${p.club}, ${p.position}` +
        `${p.priceTenths === undefined ? '' : `, £${(p.priceTenths / 10).toFixed(1)}m`})`,
    )
    .join('\n')

/**
 * What is asked for. Every field is checked in code before any of it is used.
 *
 * **Two shapes structured outputs reject, both of which this had** (found live
 * 2026-09-15, after three uploads failed):
 *
 * - **`additionalProperties` holding a schema.** An open map — "any key, string
 *   values" — is not accepted; it must be the boolean `false`. The chips were
 *   declared that way, so **every** upload was refused with HTTP 400 before a
 *   picture was ever looked at. They are an array of pairs now.
 * - **A type union**, `['integer', 'null']`. `benchOrder` is a plain integer,
 *   and a starter's is ignored.
 *
 * `PROPOSAL_SCHEMA` above carries the same warning in prose and this did not
 * follow it, which is why `tests/model/model.test.ts` now asserts the rule on
 * both schemas rather than leaving it to a comment.
 */
export const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    team: {
      type: 'object',
      properties: {
        players: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              playerId: { type: 'integer' },
              /**
               * **The name as it appears on the shirt**, reported alongside the
               * id. Reading a name is what the model is good at; copying a
               * three-digit id fifteen times without a slip is not, and one slip
               * failed the whole upload under the all-or-nothing rule. Code
               * resolves the name when the id does not land.
               */
              name: { type: 'string' },
              /**
               * **The fixture printed under the shirt.** Checked against the
               * real fixture list, and the only thing on the card that a
               * misread name cannot agree with by accident.
               */
              opponent: { type: 'string' },
              isHome: { type: 'boolean' },
              /**
               * **The character in the badge, not a verdict about it.** Asked
               * outright who the vice-captain was, the read twice chose a shirt
               * carrying a star for bonus points (2026-09-15). Transcribing one
               * character is a reading job; deciding what it means is code's.
               */
              badge: { type: 'string' },
              isStarter: { type: 'boolean' },
              benchOrder: { type: 'integer' },
            },
            required: ['playerId', 'name', 'opponent', 'isHome', 'badge', 'isStarter', 'benchOrder'],
            additionalProperties: false,
          },
        },
        chips: {
          type: 'array',
          items: {
            type: 'object',
            properties: { chip: { type: 'string' }, state: { type: 'string' } },
            required: ['chip', 'state'],
            additionalProperties: false,
          },
        },
      },
      required: ['players', 'chips'],
      additionalProperties: false,
    },
    transfers: {
      type: 'object',
      properties: {
        bankTenths: { type: 'integer' },
        freeTransfers: { type: 'integer' },
        /**
         * **The same fifteen, read again off this picture.** Names only: this
         * screen is arranged by position, so it says nothing about who starts.
         * Code uses it to recover a name the Team read dropped — the two
         * readings miss different players, and neither is deterministic.
         */
        players: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              playerId: { type: 'integer' },
              name: { type: 'string' },
              opponent: { type: 'string' },
              isHome: { type: 'boolean' },
              /** In tenths. This screen prints a price; the Team screen does not. */
              priceTenths: { type: 'integer' },
            },
            required: ['playerId', 'name', 'opponent', 'isHome', 'priceTenths'],
            additionalProperties: false,
          },
        },
      },
      required: ['bankTenths', 'freeTransfers', 'players'],
      additionalProperties: false,
    },
  },
  required: ['team', 'transfers'],
  additionalProperties: false,
} as const

export function editorialPrompt(input: EditorialInput): string {
  const lines = [
    input.calls.length === 0
      ? 'The week produced no calls at all. Say why that is a decision rather than an empty screen.'
      : `${String(input.calls.length)} calls this week:`,
    ...input.calls.map(
      (c) =>
        `${c.title} \u00b7 net ${c.net >= 0 ? '+' : '-'}${Math.abs(c.net).toFixed(2)}` +
        `${c.forced ? ' \u00b7 forced' : c.band ? ` \u00b7 ${c.band}` : ''}`,
    ),
  ]
  if (input.exception) lines.push(`A ${input.exception} gameweek is already led with above.`)
  if (input.squadSource === 'screenshot') {
    lines.push('The squad was corrected from screenshots, not read at the deadline.')
  }
  return lines.join('\n')
}

/** Whatever came back, reduced to at most three well-formed pairs. The plan checks the rest. */
const parseProposals = (raw: unknown): TransferProposal[] =>
  (Array.isArray(raw) ? raw : [])
    .filter(
      (p): p is TransferProposal =>
        typeof p === 'object' &&
        p !== null &&
        Number.isInteger((p as Record<string, unknown>)['outPlayerId']) &&
        Number.isInteger((p as Record<string, unknown>)['inPlayerId']),
    )
    .slice(0, MAX_PROPOSALS)
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
    async writeEditorial(input) {
      const { text, record } = await call('editorial', EDITORIAL_SYSTEM, editorialPrompt(input))
      return { text: text ?? '', record }
    },
    async readSquadScreenshots(input) {
      const model = pinned.parse
      try {
        const response = await client.messages.create({
          model,
          max_tokens: 2048,
          system: PARSE_SYSTEM,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text' as const, text: `Players to choose from:\n${playerList(input.players)}` },
                { type: 'text' as const, text: 'The Team screen:' },
                imageBlock(input.team),
                { type: 'text' as const, text: 'The Transfers screen:' },
                imageBlock(input.transfers),
              ],
            },
          ],
          output_config: { format: { type: 'json_schema' as const, schema: PARSE_SCHEMA } },
        })
        const u = response.usage
        const price = PRICES[response.model]
        const cacheWrite = u.cache_creation_input_tokens ?? 0
        const cacheRead = u.cache_read_input_tokens ?? 0
        const ok = response.stop_reason !== 'refusal'
        const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
        return {
          // Structured output where the route gives it, the text body otherwise.
          // Either way `parseSquad` decides whether any of it is usable.
          raw: (response as unknown as { structured_output?: unknown }).structured_output ?? safeJson(text),
          record: {
            step: 'parse',
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
        console.error('[model] the screenshots could not be read', cause)
        /**
         * **The reason travels back with the failure.** Stephen reads a phone,
         * not a log: two uploads failed with nothing on screen to say why, and
         * the only route to the cause was a deploy log he would have had to go
         * and find. A short reason costs nothing and ends the guessing.
         *
         * The message and status only — never the stack, and never the request,
         * which carries the images.
         */
        const status = (cause as { status?: number }).status
        const message = cause instanceof Error ? cause.message : String(cause)
        return {
          raw: null,
          record: unrecorded('parse', 'api', model, 'none', false),
          because: `${status ? `HTTP ${String(status)}: ` : ''}${message}`.slice(0, 160),
        }
      }
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
    async writeEditorial(input) {
      const { result, record } = await call('editorial', editorialPrompt(input), EDITORIAL_SYSTEM)
      return { text: result?.result ?? '', record }
    },
    /**
     * **Not available on this route, and it says so rather than pretending.**
     * The Agent SDK carries a prompt, not image blocks, so a screenshot cannot
     * reach the model this way. Production has a key and uses `apiModel`, where
     * the parse works; locally an upload reports a failure naming this, which is
     * the honest answer — a silent empty read would look like an unreadable
     * screenshot and send the manager back to his camera roll.
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async readSquadScreenshots() {
      return {
        raw: null,
        record: unrecorded('parse', 'agent-sdk', pinned.parse, 'unsupported', false),
        because: 'this build reads screenshots through the direct API route, and no key is set here',
      }
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
    async writeEditorial() {
      return { text: '', record: unrecorded('editorial', 'mock', 'mock', 'mock', true) }
    },
    async readSquadScreenshots() {
      return { raw: null, record: unrecorded('parse', 'mock', 'mock', 'mock', true) }
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
