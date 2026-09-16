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
import { type CardInfo, composeEditorial, generateWeek } from '../../apps/server/src/runs/generate.js'

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
  takesPenalties: false,
  ...extra,
})
const inSquad = (
  p: Named,
  role: 'starter' | 0 | 1 | 2 | 3,
  armband?: 'captain' | 'vice',
): SquadEntry & { name: string } => ({
  ...p,
  isStarter: role === 'starter',
  benchOrder: role === 'starter' ? null : role,
  sellingPriceTenths: p.nowCostTenths,
  isCaptain: armband === 'captain',
  isVice: armband === 'vice',
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
    inSquad(player('Semenyo', 'MID', 8, 6.2, 84), 'starter', 'captain'),
    inSquad(player('FwdA', 'FWD', 9, 6.0), 'starter'),
    inSquad(player('FwdB', 'FWD', 10, 5.0), 'starter'),
    inSquad(player('Haaland', 'FWD', 11, 8.0, 155), 'starter', 'vice'),
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
  const record = (step: 'propose' | 'reason' | 'editorial' | 'parse') => ({
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
    async writeEditorial() {
      return { text: 'A quiet week with one thing worth doing.', record: record('editorial') }
    },
    async readSquadScreenshots() {
      return { raw: null, record: record('parse') }
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

    // **Every call the model is asked about**, which is every call that is
    // neither a keep nor forced. Both of those are written in code because the
    // comparison misleads there — a keep's fallback recommends the wrong
    // player, and a forced call's reason is not a comparison at all (STE-143).
    const asked = calls.filter((c) => !c.isReading && !c.isForced)
    expect(asked.length).toBeGreaterThan(0)
    expect(asked.every((c) => c.reasoningSource === 'model')).toBe(true)
  })

  it('STE-143: a forced call is explained in code, never argued by the model', async () => {
    const { plan, cards } = build()
    const { calls } = await generateWeek({
      plan,
      cards,
      // A line that would pass every check and still be false on a forced call.
      model: scriptedModel([], '{in} projects higher this week and has the easier fixture.'),
    })

    const forced = calls.filter((c) => c.isForced && !c.isReading)
    expect(forced.length).toBeGreaterThan(0)
    for (const call of forced) {
      expect(call.reasoningSource).toBe('template')
      // The structural reason, not a comparison that runs the other way.
      expect(call.reasoning).toMatch(/cannot (hold this armband|play this gameweek)/)
    }
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
    /**
     * **One reasoning call per call the model is actually asked about**, which
     * is neither a keep nor a forced call. A keep writes its own line and asks
     * nothing (F4-AC-01); a forced call does the same since 2026-09-16, because
     * its reason is structural and the model can only build a comparison
     * (STE-143). Both save a call, which is the point of counting them here.
     */
    const asked = calls.filter((c) => !c.isReading && !c.isForced)
    expect(modelCalls.filter((m) => m.step === 'reason')).toHaveLength(asked.length)
    expect(calls.every((c) => !c.isReading)).toBe(true)
    // The fixture must still contain a forced call, or this asserts nothing.
    expect(calls.some((c) => c.isForced)).toBe(true)
  })

  it('F8-AC-01, F8-AC-06: the editorial counts the whole week, carried calls included', async () => {
    // **The trigger is a carried call** — one the manager already selected, which
    // a run does not re-plan. Writing the editorial inside the pipeline counted
    // only what the run produced, so the prose read "3 calls this week" over a
    // screen showing six (found live 2026-09-15). Handing it the planned calls
    // alone would pass whether the fix were there or not.
    const { plan, cards } = build()
    const { calls } = await generateWeek({ plan, cards, model: scriptedModel([], 'x') })
    const carried = { ...calls[0], key: 'transfer:out=99:in=98', position: calls.length } as (typeof calls)[number]

    let seen = 0
    const model: ModelPort = {
      ...mockModel(),
      async writeEditorial(input) {
        seen = input.calls.length
        return { text: '', record: null as never }
      },
    }

    await composeEditorial({
      model,
      calls: [...calls, carried],
      nameOf: () => 'Someone',
      context: { exception: null, squadSource: 'deadline' },
    })

    expect(seen).toBe(calls.filter((c) => !c.isReading).length + 1)
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
      kLabel: 'substitution',
      byCeiling: false,
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

describe('F4 · the captaincy calls, through the whole pipeline', () => {
  it('F4-AC-04, F4-AC-11: a captaincy card uses the master row list, and its breakdown names the captaincy bar', async () => {
    const { plan, cards } = build()
    const { calls } = await generateWeek({ plan, cards, model: mockModel() })
    const captain = calls.find((c) => c.shape === 'captain')
    const transfer = calls.find((c) => c.category === 'transfer')

    expect(captain).toBeDefined()
    // Not a captaincy-specific set: the same rows a transfer card shows.
    expect(captain?.breakdown.weights).toEqual([1])
    expect(captain?.breakdown.kLabel).toBe('captain/vice')
    expect(transfer?.breakdown.kLabel).toBe('transfer')
    // 0.5 alone does not say which bar it is — a substitution reads the same.
    expect(captain?.k).toBe(0.5)
  })

  it('F4-UP-01: a captain whose club has no fixture projects zero, and the call is forced rather than re-scored', async () => {
    const { plan, cards, id } = build()
    const blanking = id('Semenyo')
    const squad = plan.squad.map((p) => (p.playerId === blanking ? { ...p, hasFixture: false } : p))
    const { calls } = await generateWeek({ plan: { ...plan, squad }, cards, model: mockModel() })
    const captain = calls.find((c) => c.shape === 'captain')

    expect(captain?.outPlayerId).toBe(blanking)
    expect(captain?.breakdown.out.projections).toEqual([0])
    expect(captain?.isForced).toBe(true)
    // Forced, and never shown a negative figure (slice 4's rule).
    expect(captain?.net).toBeGreaterThanOrEqual(0)
  })

  it('F4-AC-01, F4-AC-02: a keep reading is stored with no conviction, no band, and no model call behind it', async () => {
    const { plan, cards } = build()
    // Both armbands already on the right players.
    const squad = plan.squad.map((p) => ({
      ...p,
      isCaptain: p.name === 'Haaland',
      isVice: p.name === 'Semenyo',
    }))
    const { calls, modelCalls } = await generateWeek({ plan: { ...plan, squad }, cards, model: scriptedModel([], 'x') })
    const captaincy = calls.filter((c) => c.category === 'captaincy')

    expect(captaincy).toHaveLength(2)
    for (const call of captaincy) {
      expect(call.isReading).toBe(true)
      expect(call.conviction).toBeNull()
      expect(call.band).toBeNull()
      expect(call.readingReason).not.toBeNull()
      expect(call.reasoningSource).toBe('template')
      expect(call.reasoning.length).toBeGreaterThan(0)
    }
    expect(modelCalls.filter((m) => m.step === 'reason')).toHaveLength(calls.length - 2)
  })
})
