/**
 * The one module that owns every model call (ADR 0008).
 *
 * No test here reaches a model. The SDK's `query` is injected, which is exactly
 * the seam ADR 0008 names: the reasoning call is mocked in integration tests, and
 * a test that quietly reaches the network fails on a train and costs money in CI.
 *
 * What is proved: the call is shaped as ruled (pinned model, no tools, no project
 * settings, no transcript on disk); the model's line is checked before it is
 * used; and what is recorded against the run is what the SDK reports it used —
 * not what the config claims (ADR 0008, condition 1).
 */

import { describe, expect, it } from 'vitest'
import { evaluationRows, type CardPlayer } from '../../packages/engine/src/index.js'
import { PINNED, liveModel, mockModel } from '../../apps/server/src/model/client.js'
import { finalReasoning } from '../../apps/server/src/model/reasoning.js'

const player = (projection: number, form: number): CardPlayer => ({
  availability: { eligible: true },
  chanceOfPlayingNextRound: null,
  form,
  projection,
  fixtures: [{ opponent: 'BUR', isHome: true, difficulty: 2 }],
  priceTenths: 60,
  selectedByPercent: 10,
  seasonPoints: 20,
  transfersIn: 1000,
  transfersOut: 1000,
})
const rows = evaluationRows(player(2.4, 2.1), player(7.0, 6.3))

type Captured = { prompt: unknown; options: Record<string, unknown> }

/** A stand-in for the SDK's `query`, yielding one result message. */
const fakeQuery = (result: Record<string, unknown>, captured: Captured[] = []) =>
  ((params: { prompt: unknown; options?: Record<string, unknown> }) => {
    captured.push({ prompt: params.prompt, options: params.options ?? {} })
    return (async function* () {
      yield { type: 'result', subtype: 'success', is_error: false, ...result }
    })()
  }) as unknown as Parameters<typeof liveModel>[0]['query']

const usage = (model: string, costUSD = 0.0012) => ({
  total_cost_usd: costUSD,
  modelUsage: {
    [model]: {
      inputTokens: 900,
      outputTokens: 60,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      webSearchRequests: 0,
      costUSD,
      contextWindow: 200000,
      maxOutputTokens: 8192,
    },
  },
})

describe('F3-AC-22, ENGINE-AC-05 · the model\'s line is checked, never trusted', () => {
  it('F3-AC-22: a clean line is kept, and marked as the model\'s', () => {
    const line = 'Rogers starts on 7.0 projected points against 2.4, with better form and an easier fixture.'
    expect(finalReasoning(line, rows, 'Tzolis', 'Rogers')).toEqual({ text: line, source: 'model' })
  })

  it('F3-AC-22: a line citing something the card does not show falls back to the template', () => {
    const line = 'Rogers was praised in the press conference and should see more minutes.'
    const out = finalReasoning(line, rows, 'Tzolis', 'Rogers')
    expect(out.source).toBe('template')
    expect(out.text).toMatch(/^Rogers over Tzolis/)
  })

  it('F3-AC-22: a line too long for four lines falls back', () => {
    const out = finalReasoning('Rogers has better form. '.repeat(12), rows, 'Tzolis', 'Rogers')
    expect(out.source).toBe('template')
  })

  it('ENGINE-AC-05: a line that reads the strength figure as a chance of being right falls back', () => {
    for (const line of [
      'There is a 90% chance this pays off.',
      'Rogers is likely to outscore Tzolis — high probability.',
      'We are 86% confident in this swap.',
    ]) {
      expect(finalReasoning(line, rows, 'Tzolis', 'Rogers').source).toBe('template')
    }
  })

  it('F3-AC-22: an empty or missing line falls back', () => {
    expect(finalReasoning('', rows, 'Tzolis', 'Rogers').source).toBe('template')
    expect(finalReasoning(null, rows, 'Tzolis', 'Rogers').source).toBe('template')
  })
})

describe('ADR 0008 · the call is shaped as ruled, and recorded as it happened', () => {
  it('pins Haiku for proposing and Sonnet for reasoning, by exact identifier', () => {
    expect(PINNED).toEqual({ propose: 'claude-haiku-4-5', reason: 'claude-sonnet-5' })
  })

  it('sends no tools, no project settings, and keeps no transcript on disk', async () => {
    const captured: Captured[] = []
    const model = liveModel({ query: fakeQuery({ result: 'x', ...usage('claude-sonnet-5') }, captured), env: {} })
    await model.writeReasoning({ outName: 'Tzolis', inName: 'Rogers', rows, summary: { net: 4.6, strength: 90, band: 'certain' } })

    const options = captured[0]?.options ?? {}
    expect(options['model']).toBe('claude-sonnet-5')
    expect(options['tools']).toEqual([])
    expect(options['settingSources']).toEqual([])
    expect(options['persistSession']).toBe(false)
  })

  it('records the model the SDK reports it used, with tokens and cost, per call', async () => {
    const model = liveModel({ query: fakeQuery({ result: 'x', ...usage('claude-sonnet-5', 0.0031) }), env: {} })
    const { record } = await model.writeReasoning({
      outName: 'Tzolis',
      inName: 'Rogers',
      rows,
      summary: { net: 4.6, strength: 90, band: 'certain' },
    })

    expect(record).toEqual({
      step: 'reason',
      pinned: 'claude-sonnet-5',
      modelId: 'claude-sonnet-5',
      inputTokens: 900,
      outputTokens: 60,
      costUsd: 0.0031,
      ok: true,
    })
  })

  it('an override is honoured, and what ran is still read off the SDK rather than the setting', async () => {
    const model = liveModel({
      query: fakeQuery({ result: 'x', ...usage('claude-sonnet-4-6') }),
      env: { ANTHROPIC_MODEL_REASON: 'claude-sonnet-4-6' },
    })
    const { record } = await model.writeReasoning({
      outName: 'A',
      inName: 'B',
      rows,
      summary: { net: 1, strength: 67, band: 'lean' },
    })
    expect(record.pinned).toBe('claude-sonnet-4-6')
    expect(record.modelId).toBe('claude-sonnet-4-6')
  })

  it('proposals are parsed from structured output, and malformed entries dropped', async () => {
    const model = liveModel({
      query: fakeQuery({
        result: '',
        structured_output: {
          proposals: [
            { outPlayerId: 557, inPlayerId: 124 },
            { outPlayerId: 'x', inPlayerId: 1 },
            { outPlayerId: 423 },
          ],
        },
        ...usage('claude-haiku-4-5', 0.0004),
      }),
      env: {},
    })
    const { proposals, record } = await model.proposeTransfers({ bankTenths: 10, freeTransfers: 1, squad: [], shortlist: [] })

    expect(proposals).toEqual([{ outPlayerId: 557, inPlayerId: 124 }])
    expect(record.step).toBe('propose')
    expect(record.modelId).toBe('claude-haiku-4-5')
  })

  it('a failed call is recorded as failed and yields nothing, so the plan falls back to code', async () => {
    const failing = (() => {
      throw new Error('prepaid balance exhausted')
    }) as unknown as Parameters<typeof liveModel>[0]['query']
    const { proposals, record } = await liveModel({ query: failing, env: {} }).proposeTransfers({
      bankTenths: 10,
      freeTransfers: 1,
      squad: [],
      shortlist: [],
    })

    expect(proposals).toEqual([])
    expect(record.ok).toBe(false)
    expect(record.costUsd).toBe(0)
  })

  it('mock mode proposes nothing, writes nothing and spends nothing', async () => {
    const model = mockModel()
    const proposed = await model.proposeTransfers({ bankTenths: 10, freeTransfers: 1, squad: [], shortlist: [] })
    const reasoned = await model.writeReasoning({ outName: 'A', inName: 'B', rows, summary: { net: 1, strength: 67, band: 'lean' } })

    expect(proposed.proposals).toEqual([])
    expect(reasoned.text).toBe('')
    expect([proposed.record.costUsd, reasoned.record.costUsd]).toEqual([0, 0])
    expect(proposed.record.modelId).toBe('mock')
  })
})
