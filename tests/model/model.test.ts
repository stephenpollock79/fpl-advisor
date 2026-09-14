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
import { finalReasoning, reasoningIsAcceptable } from '../../apps/server/src/model/reasoning.js'

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

  it('F3-AC-22: a line citing price movement falls back — the card shows a price, never where it is heading', () => {
    // Written by the model on the first live run, 2026-09-11.
    const line = 'Rogers outscores Tzolis on form, expected points, price rise appeal and transfer momentum this week.'
    expect(finalReasoning(line, rows, 'Tzolis', 'Rogers').source).toBe('template')
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
    await model.writeReasoning({ outName: 'Tzolis', inName: 'Rogers', rows, summary: { net: 4.6, strength: 90, band: 'certain' }, kind: 'transfer' as const })

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
      summary: { net: 4.6, strength: 90, band: 'certain' }, kind: 'transfer' as const,
    })

    expect(record).toEqual({
      step: 'reason',
      via: 'agent-sdk',
      pinned: 'claude-sonnet-5',
      modelId: 'claude-sonnet-5',
      inputTokens: 900,
      outputTokens: 60,
      costUsd: 0.0031,
      ok: true,
    })
  })

  it('counts cache reads and writes as input, so context the harness adds shows in the figure', async () => {
    const withCache = {
      total_cost_usd: 0.42,
      modelUsage: {
        'claude-sonnet-5': {
          inputTokens: 2,
          outputTokens: 60,
          cacheReadInputTokens: 1000,
          cacheCreationInputTokens: 150000,
          webSearchRequests: 0,
          costUSD: 0.42,
          contextWindow: 1000000,
          maxOutputTokens: 64000,
        },
      },
    }
    const model = liveModel({ query: fakeQuery({ result: 'x', ...withCache }), env: {} })
    const { record } = await model.writeReasoning({ outName: 'A', inName: 'B', rows, summary: { net: 1, strength: 67, band: 'lean' }, kind: 'transfer' as const })
    expect(record.inputTokens).toBe(151002)
    expect(record.costUsd).toBe(0.42)
  })

  it('shows the model prices in pounds, as the card does — never raw tenths', async () => {
    const captured: Captured[] = []
    const model = liveModel({ query: fakeQuery({ result: 'x', ...usage('claude-sonnet-5') }, captured), env: {} })
    await model.writeReasoning({ outName: 'Tzolis', inName: 'Rogers', rows, summary: { net: 4.6, strength: 90, band: 'certain' }, kind: 'transfer' as const })
    const prompt = String(captured[0]?.prompt)
    expect(prompt).toContain('price: Tzolis £6.0m · Rogers £6.0m')
    expect(prompt).not.toMatch(/price: Tzolis 60\b/)
  })

  it('switches thinking off on both calls', async () => {
    const captured: Captured[] = []
    const model = liveModel({ query: fakeQuery({ result: 'x', ...usage('claude-haiku-4-5') }, captured), env: {} })
    await model.proposeTransfers({ bankTenths: 10, freeTransfers: 1, squad: [], shortlist: [] })
    await model.writeReasoning({ outName: 'A', inName: 'B', rows, summary: { net: 1, strength: 67, band: 'lean' }, kind: 'transfer' as const })
    expect(captured.map((c) => c.options['thinking'])).toEqual([{ type: 'disabled' }, { type: 'disabled' }])
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
      summary: { net: 1, strength: 67, band: 'lean' }, kind: 'transfer' as const,
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
    const reasoned = await model.writeReasoning({ outName: 'A', inName: 'B', rows, summary: { net: 1, strength: 67, band: 'lean' }, kind: 'transfer' as const })

    expect(proposed.proposals).toEqual([])
    expect(reasoned.text).toBe('')
    expect([proposed.record.costUsd, reasoned.record.costUsd]).toEqual([0, 0])
    expect(proposed.record.modelId).toBe('mock')
  })
})

describe('F4-AC-09, ENGINE step 3 · a line that contradicts its own card is refused', () => {
  it('a line arguing against the call is refused, so Select and Reject keep their meaning', () => {
    // Found live on 2026-09-14: a captaincy call recommending Calvert-Lewin
    // carried "Skip this one… the marginal xPts edge not worth it." The figure
    // said one thing and the prose said the opposite, on the same card.
    expect(reasoningIsAcceptable('Skip this one. The marginal xPts edge is not worth it.')).toBe(false)
    expect(reasoningIsAcceptable('Stick with what you have; no need to change.')).toBe(false)
    expect(reasoningIsAcceptable('Rogers outscores Tzolis on projected points this gameweek.')).toBe(true)
  })

  it('F4-AC-09: money cannot be claimed on a call where no money moves', () => {
    // Not a weak argument — a false one. A captaincy call costs £0.00.
    const armband = { costsNothing: true }
    expect(reasoningIsAcceptable('Haaland edges it while freeing up £7.7m.', armband)).toBe(false)
    expect(reasoningIsAcceptable('The cheaper option with the better fixture.', armband)).toBe(false)
    expect(reasoningIsAcceptable('Haaland projects higher this gameweek and has the easier fixture.', armband)).toBe(true)
  })

  it('F3-AC-25: the same sentence is fine on a transfer, where money really does move', () => {
    expect(reasoningIsAcceptable('Groß edges it while freeing up £7.7m.')).toBe(true)
  })

  it('the model is told what the move actually is, so it cannot reason from the wrong one', async () => {
    const captured: Captured[] = []
    const model = liveModel({ query: fakeQuery({ result: 'fine', ...usage('claude-sonnet-5') }, captured), env: {} })
    await model.writeReasoning({
      outName: 'Haaland',
      inName: 'Junqueira',
      rows,
      summary: { net: 1.2, strength: 71, band: 'lean' },
      kind: 'vice' as const,
    })

    // The armband moving, not a player being sold — which is what it was told
    // until today, and why it wrote about freeing up £7.7m.
    const asked = String(captured[0]?.prompt ?? '')
    expect(asked).toContain("vice-captain's armband moves")
    expect(asked).toContain('no money moves')
    expect(asked).not.toContain('Haaland out, Junqueira in')
  })
})
