/**
 * The production route: one Messages API request per call, carrying our prompt
 * and nothing else (ADR 0008, amended 2026-09-11 on STE-62).
 *
 * The Agent SDK route carried 117,000 to 270,000 input tokens per call on the
 * first live runs, almost all of it the Claude Code harness rather than our
 * prompt. This route exists so a production run costs about a penny. Nothing
 * here reaches the network: the client is a stand-in.
 */

import { describe, expect, it } from 'vitest'
import { type CardPlayer, evaluationRows } from '../../packages/engine/src/index.js'
import { PROPOSAL_SCHEMA, apiModel, modelFromEnv } from '../../apps/server/src/model/client.js'

const player = (projection: number): CardPlayer => ({
  availability: { eligible: true },
  chanceOfPlayingNextRound: null,
  form: 3,
  projection,
  fixtures: [{ opponent: 'BUR', isHome: true, difficulty: 2 }],
  priceTenths: 60,
  selectedByPercent: 10,
  seasonPoints: 20,
  transfersIn: 1000,
  transfersOut: 1000,
})
const rows = evaluationRows(player(2.4), player(7.0))
const reasoning = { outName: 'Tzolis', inName: 'Rogers', rows, summary: { net: 4.6, strength: 90, band: 'certain' as const } }
const proposing = { bankTenths: 10, freeTransfers: 1, squad: [], shortlist: [] }

type Params = Record<string, unknown>

const usage = (input = 600, output = 50) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
})

const answer = (model: string, text: string, stop = 'end_turn', u = usage()) => ({
  model,
  content: [{ type: 'text', text }],
  stop_reason: stop,
  usage: u,
})

/** A stand-in for the SDK client: answers once, and keeps what it was sent. */
const fakeClient = (response: unknown, captured: Params[] = []) =>
  ({
    messages: {
      create: async (params: Params) => {
        captured.push(params)
        if (response instanceof Error) throw response
        return response
      },
    },
  }) as unknown as NonNullable<Parameters<typeof apiModel>[0]['client']>

describe('ADR 0008, amended · production sends our prompt and nothing else', () => {
  it('one request, our system prompt, one message, no tools', async () => {
    const captured: Params[] = []
    await apiModel({ client: fakeClient(answer('claude-sonnet-5', 'Rogers projects 7.0 against 2.4.'), captured), env: {} }).writeReasoning(reasoning)

    const [sent] = captured
    expect(sent?.['model']).toBe('claude-sonnet-5')
    expect(typeof sent?.['system']).toBe('string')
    expect((sent?.['messages'] as unknown[]).length).toBe(1)
    expect(sent).not.toHaveProperty('tools')
    // Our prompt is a few hundred tokens — nowhere near the harness's hundred thousand.
    expect(JSON.stringify(sent).length).toBeLessThan(4000)
  })

  it('records the model the API reports, input including cache, and a list-price estimate', async () => {
    const { text, record } = await apiModel({
      client: fakeClient(answer('claude-sonnet-5', 'Rogers projects 7.0 against 2.4.')),
      env: {},
    }).writeReasoning(reasoning)

    expect(text).toBe('Rogers projects 7.0 against 2.4.')
    expect(record).toMatchObject({ step: 'reason', via: 'api', pinned: 'claude-sonnet-5', modelId: 'claude-sonnet-5', inputTokens: 600, outputTokens: 50, ok: true })
    // 600 in at $2 and 50 out at $10, per million.
    expect(record.costUsd).toBeCloseTo(0.0017, 6)
  })

  it('proposals come from the structured answer, and malformed entries are dropped', async () => {
    const captured: Params[] = []
    const json = JSON.stringify({ proposals: [{ outPlayerId: 557, inPlayerId: 124 }, { outPlayerId: 'x', inPlayerId: 1 }] })
    const { proposals, record } = await apiModel({ client: fakeClient(answer('claude-haiku-4-5', json), captured), env: {} }).proposeTransfers(proposing)

    expect(proposals).toEqual([{ outPlayerId: 557, inPlayerId: 124 }])
    expect(record.modelId).toBe('claude-haiku-4-5')
    expect((captured[0]?.['output_config'] as { format?: { type?: string } })?.format?.type).toBe('json_schema')
  })

  it('the proposal schema uses only what structured outputs accept', () => {
    // `maxItems` in this schema made every production proposal call fail on the
    // first live run, 2026-09-11. The API refuses array-length, numeric and
    // string-length constraints; the SDK's helpers strip them, a raw schema does not.
    const unsupported = /"(maxItems|minItems|minimum|maximum|exclusiveMinimum|exclusiveMaximum|multipleOf|minLength|maxLength|pattern)"/
    expect(JSON.stringify(PROPOSAL_SCHEMA)).not.toMatch(unsupported)
    // Every object closes itself, which the API requires.
    expect(JSON.stringify(PROPOSAL_SCHEMA).match(/"type":"object"/g)?.length).toBe(
      JSON.stringify(PROPOSAL_SCHEMA).match(/"additionalProperties":false/g)?.length,
    )
  })

  it('at most three proposals are taken, whatever comes back', async () => {
    const four = JSON.stringify({ proposals: [1, 2, 3, 4].map((n) => ({ outPlayerId: n, inPlayerId: n + 100 })) })
    const { proposals } = await apiModel({ client: fakeClient(answer('claude-haiku-4-5', four)), env: {} }).proposeTransfers(proposing)
    expect(proposals).toHaveLength(3)
  })

  it('a refusal yields nothing and is recorded as failed, so code and the template stand in', async () => {
    const { proposals, record } = await apiModel({ client: fakeClient(answer('claude-haiku-4-5', '', 'refusal')), env: {} }).proposeTransfers(proposing)
    expect(proposals).toEqual([])
    expect(record.ok).toBe(false)
  })

  it('an error yields nothing, is recorded as failed, and costs nothing', async () => {
    const { text, record } = await apiModel({ client: fakeClient(new Error('balance exhausted')), env: {} }).writeReasoning(reasoning)
    expect(text).toBe('')
    expect(record).toMatchObject({ ok: false, costUsd: 0, modelId: 'none' })
  })

  it('an unpriced model records its tokens and no cost, rather than a guessed one', async () => {
    const { record } = await apiModel({
      client: fakeClient(answer('claude-something-new', 'Rogers projects 7.0.')),
      env: { ANTHROPIC_MODEL_REASON: 'claude-something-new' },
    }).writeReasoning(reasoning)
    expect(record.inputTokens).toBe(600)
    expect(record.costUsd).toBeNull()
  })
})

describe('ADR 0008, amended · which route runs', () => {
  it('mock when asked; the direct API when a key is present; the Claude Code session otherwise', () => {
    expect(modelFromEnv({ MODEL_MODE: 'mock', ANTHROPIC_API_KEY: 'placeholder-for-test' }).backend).toBe('mock')
    expect(modelFromEnv({ ANTHROPIC_API_KEY: 'placeholder-for-test' }).backend).toBe('api')
    expect(modelFromEnv({}).backend).toBe('agent-sdk')
  })
})
