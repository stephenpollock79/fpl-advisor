/**
 * One run, end to end, with the model injected.
 *
 * The four steps of the pipeline in the order the criteria give them: the model
 * proposes, code computes, the model writes the reasoning, code decides what is
 * shown. No test here reaches a model (ADR 0008) — a stand-in answers instead,
 * and the mock is what a real failure degrades to.
 */

import { describe, expect, it } from 'vitest'
import type { CardPlayer } from '../../packages/engine/src/index.js'
import type { PlanPlayer, SquadEntry } from '../../apps/server/src/calls/plan.js'
import { type ModelPort, mockModel } from '../../apps/server/src/model/client.js'
import { type CardInfo, generateWeek } from '../../apps/server/src/runs/generate.js'

const fit = { eligible: true } as const
let nextId = 1

type Named = PlanPlayer & { name: string }
const player = (name: string, position: PlanPlayer['position'], clubId: number, x: number, cost = 50, extra: Partial<PlanPlayer> = {}): Named => ({
  name,
  playerId: nextId++,
  position,
  clubId,
  projections: [x, x, x],
  availability: fit,
  flagged: false,
  hasFixture: true,
  nowCostTenths: cost,
  ...extra,
})
const inSquad = (p: Named, role: 'starter' | 0 | 1 | 2 | 3): SquadEntry & { name: string } => ({
  ...p,
  isStarter: role === 'starter',
  benchOrder: role === 'starter' ? null : role,
  sellingPriceTenths: p.nowCostTenths,
})

const build = () => {
  nextId = 1
  const squad = [
    inSquad(player('Keeper', 'GKP', 1, 3.5), 'starter'),
    inSquad(player('Shaw', 'DEF', 2, 1.7, 44, { flagged: true }), 'starter'),
    inSquad(player('DefA', 'DEF', 3, 4.0), 'starter'),
    inSquad(player('DefB', 'DEF', 4, 3.9), 'starter'),
    inSquad(player('Tzolis', 'MID', 5, 2.4, 64), 'starter'),
    inSquad(player('MidA', 'MID', 6, 5.5), 'starter'),
    inSquad(player('MidB', 'MID', 7, 5.0), 'starter'),
    inSquad(player('Semenyo', 'MID', 8, 6.2, 84), 'starter'),
    inSquad(player('FwdA', 'FWD', 9, 6.0), 'starter'),
    inSquad(player('FwdB', 'FWD', 10, 5.0), 'starter'),
    inSquad(player('Haaland', 'FWD', 11, 8.0, 155), 'starter'),
    inSquad(player('SubKeeper', 'GKP', 12, 2.0, 40), 0),
    inSquad(player('Rogers', 'MID', 13, 7.0, 76), 1),
    inSquad(player('VanHecke', 'DEF', 14, 4.7, 49), 2),
    inSquad(player('SubDef', 'DEF', 15, 1.0, 40), 3),
  ]
  const pool = [player('Gross', 'MID', 16, 6.0, 56), player('Winger', 'MID', 17, 5.8, 55)]
  const everyone = [...squad, ...pool]
  const card = (p: Named): CardInfo => ({
    name: p.name,
    club: `C${String(p.clubId)}`,
    status: 'a',
    availability: p.availability,
    chanceOfPlayingNextRound: p.flagged ? 75 : null,
    form: p.projections[0] ?? 0,
    projection: p.projections[0] ?? 0,
    fixtures: [{ opponent: 'XXX', isHome: true, difficulty: 3 }],
    priceTenths: p.nowCostTenths,
    selectedByPercent: 10,
    seasonPoints: 20,
    transfersIn: 1000,
    transfersOut: 1000,
  })
  return {
    plan: { squad, pool, bankTenths: 10, freeTransfers: 1 },
    cards: new Map(everyone.map((p) => [p.playerId, card(p)])),
    id: (name: string) => everyone.find((p) => p.name === name)?.playerId ?? -1,
  }
}

/** A stand-in model: proposes what it is told to and writes a fixed line. */
const scriptedModel = (proposals: { outPlayerId: number; inPlayerId: number }[], line: string): ModelPort => {
  const record = (step: 'propose' | 'reason') => ({
    step,
    via: 'mock' as const,
    pinned: step === 'propose' ? 'claude-haiku-4-5' : 'claude-sonnet-5',
    modelId: step === 'propose' ? 'claude-haiku-4-5' : 'claude-sonnet-5',
    inputTokens: 100,
    outputTokens: 10,
    costUsd: 0.001,
    ok: true,
  })
  return {
    backend: 'mock',
    async proposeTransfers() {
      return { proposals, record: record('propose') }
    },
    async writeReasoning(input) {
      return { text: line.replace('{in}', input.inName), record: record('reason') }
    },
  }
}

describe('One run, end to end', () => {
  it('F3-AC-22: every call carries reasoning — the template when there is no model line', async () => {
    const { plan, cards } = build()
    const { calls } = await generateWeek({ plan, cards, model: mockModel() })

    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((c) => c.reasoning.length > 0 && c.reasoningSource === 'template')).toBe(true)
  })

  it('F3-AC-22: a clean model line is used, and marked as the model\'s', async () => {
    const { plan, cards } = build()
    const { calls } = await generateWeek({ plan, cards, model: scriptedModel([], '{in} projects higher this week and has the easier fixture.') })
    expect(calls.every((c) => c.reasoningSource === 'model')).toBe(true)
  })

  it('the model\'s transfer proposals reach the plan', async () => {
    const { plan, cards, id } = build()
    const { calls } = await generateWeek({
      plan,
      cards,
      model: scriptedModel([{ outPlayerId: id('MidB'), inPlayerId: id('Winger') }], 'x'),
    })
    const transfers = calls.filter((c) => c.category === 'transfer')
    expect(transfers.map((c) => [c.outPlayerId, c.inPlayerId])).toEqual([[id('MidB'), id('Winger')]])
  })

  it('ADR 0008: every model call is recorded — one proposal and one line per call', async () => {
    const { plan, cards } = build()
    const { calls, modelCalls } = await generateWeek({ plan, cards, model: scriptedModel([], 'x') })

    expect(modelCalls.filter((m) => m.step === 'propose')).toHaveLength(1)
    expect(modelCalls.filter((m) => m.step === 'reason')).toHaveLength(calls.length)
  })

  it('F3-AC-30, F3-AC-31: the breakdown holds every value the card explains, already computed', async () => {
    const { plan, cards, id } = build()
    const { calls } = await generateWeek({ plan, cards, model: mockModel() })
    const sub = calls.find((c) => c.outPlayerId === id('Tzolis'))

    expect(sub?.breakdown).toEqual({
      weights: [1],
      out: { playerId: id('Tzolis'), projections: [2.4], gate: { eligible: true }, total: 2.4 },
      in: { playerId: id('Rogers'), projections: [7], gate: { eligible: true }, total: 7 },
      net: 4.6,
      pointsHit: 0,
      k: 0.5,
    })
  })

  it('F3-AC-17: WATCH is set on a transfer FPL expects to move tonight, with its reason — never on a substitution', async () => {
    const { plan, cards, id } = build()
    const rising = { likelihoodTonight: 5, locked: false }
    // Gross is the transfer's incoming player; Rogers the substitution's.
    for (const name of ['Gross', 'Rogers']) {
      const c = cards.get(id(name))
      if (c) cards.set(id(name), { ...c, priceSignal: rising })
    }
    const { calls } = await generateWeek({ plan, cards, model: mockModel() })

    const transfer = calls.find((c) => c.inPlayerId === id('Gross'))
    expect(transfer?.watch).toBe(true)
    expect(transfer?.watchReason).toBe("FPL expects Gross's price to rise tonight — buying today avoids paying £0.1m more.")

    const sub = calls.find((c) => c.inPlayerId === id('Rogers'))
    expect(sub?.watch).toBe(false)
    expect(sub?.watchReason).toBeNull()
  })

  it('positions follow the plan\'s order, so the screen shows what the plan chose', async () => {
    const { plan, cards } = build()
    const { calls } = await generateWeek({ plan, cards, model: mockModel() })
    expect(calls.map((c) => c.position)).toEqual(calls.map((_, i) => i))
    expect(calls.every((c) => c.watch === false)).toBe(true)
  })
})
