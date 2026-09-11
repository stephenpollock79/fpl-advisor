/**
 * The week, generated as one plan (F3-UP-04).
 *
 * Built around GW4's real collision: Tzolis is wanted by a substitution
 * (Tzolis → Rogers, +4.60, 90 · certain) and by the best transfer available
 * (Tzolis → Groß, 77 · lean). Two calls may never touch the same player, and that
 * is prevented here rather than detected on screen — so the stronger call holds
 * him and the transfer is searched again without him.
 *
 * Every figure below is the engine's. This file checks what the plan *chooses*,
 * never re-derives how a call is scored.
 */

import { describe, expect, it } from 'vitest'
import { type PlanPlayer, type SquadEntry, planWeek } from '../../apps/server/src/calls/plan.js'

const fit = { eligible: true } as const
const flat = (x: number) => [x, x, x] as const

let nextId = 1
const player = (
  name: string,
  position: PlanPlayer['position'],
  clubId: number,
  projection: number,
  nowCostTenths = 50,
  extra: Partial<PlanPlayer> = {},
): PlanPlayer & { name: string } => ({
  name,
  playerId: nextId++,
  position,
  clubId,
  projections: flat(projection),
  availability: fit,
  flagged: false,
  hasFixture: true,
  nowCostTenths,
  ...extra,
})

const inSquad = (
  p: PlanPlayer & { name: string },
  role: 'starter' | 0 | 1 | 2 | 3,
  sellingPriceTenths = p.nowCostTenths,
): SquadEntry & { name: string } => ({
  ...p,
  isStarter: role === 'starter',
  benchOrder: role === 'starter' ? null : role,
  sellingPriceTenths,
})

/** GW4's shapes, invented around the four players the pencil check named. */
const world = (overrides: { freeTransfers?: number; bankTenths?: number } = {}) => {
  nextId = 1
  const squad = [
    inSquad(player('Keeper', 'GKP', 1, 3.5), 'starter'),
    inSquad(player('Shaw', 'DEF', 2, 1.7, 44, { flagged: true }), 'starter'),
    inSquad(player('DefA', 'DEF', 3, 4.0), 'starter'),
    inSquad(player('DefB', 'DEF', 4, 3.9), 'starter'),
    inSquad(player('Tzolis', 'MID', 5, 2.4, 64), 'starter', 65),
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
  const pool = [
    player('Gross', 'MID', 16, 6.0, 56),
    player('Winger', 'MID', 17, 5.8, 55),
    player('Costly', 'MID', 18, 9.0, 140),
    player('Hurt', 'MID', 19, 9.5, 60, { availability: { eligible: false, reason: 'injured' } }),
  ]
  return {
    squad,
    pool,
    bankTenths: overrides.bankTenths ?? 10,
    freeTransfers: overrides.freeTransfers ?? 1,
  }
}

const byName = (w: ReturnType<typeof world>) => {
  const all = [...w.squad, ...w.pool]
  return (id: number) => all.find((p) => p.playerId === id)?.name
}

const label = (w: ReturnType<typeof world>) => {
  const name = byName(w)
  return (c: ReturnType<typeof planWeek>[number]) => `${c.shape}:${name(c.outPlayerId)}→${name(c.inPlayerId)}`
}

describe('F3-UP-04 · the week is one plan', () => {
  it('F3-UP-04: no two calls touch the same player', () => {
    const w = world()
    const calls = planWeek(w)
    const touched = calls.flatMap((c) => [c.outPlayerId, c.inPlayerId])
    expect(new Set(touched).size).toBe(touched.length)
  })

  it('F3-UP-04: the Tzolis substitution holds him, and the transfer is searched again without him', () => {
    const w = world()
    const calls = planWeek(w).map(label(w))

    expect(calls).toContain('upgrade_swap:Tzolis→Rogers')
    expect(calls).toContain('doubt_swap:Shaw→VanHecke')
    expect(calls.some((c) => c.startsWith('transfer:Tzolis'))).toBe(false)
    expect(calls.filter((c) => c.startsWith('transfer:'))).toHaveLength(1)
  })
})

describe('F3-AC-25, F3-AC-28 · what a call costs', () => {
  it('F3-AC-25: a transfer costs the incoming price minus the outgoing selling price', () => {
    const w = world()
    const transfer = planWeek(w).find((c) => c.category === 'transfer')
    const out = w.squad.find((p) => p.playerId === transfer?.outPlayerId)
    const into = w.pool.find((p) => p.playerId === transfer?.inPlayerId)

    expect(transfer?.outcome.costTenths).toBe((into?.nowCostTenths ?? 0) - (out?.sellingPriceTenths ?? 0))
  })

  it('F3-AC-28: every substitution costs £0.00', () => {
    const subs = planWeek(world()).filter((c) => c.category === 'substitution')
    expect(subs.length).toBeGreaterThan(0)
    expect(subs.every((c) => c.outcome.costTenths === 0)).toBe(true)
  })

  it('never proposes a transfer the bank cannot fund, or an excluded player', () => {
    const w = world()
    const name = byName(w)
    const ins = planWeek(w).filter((c) => c.category === 'transfer').map((c) => name(c.inPlayerId))
    expect(ins).not.toContain('Costly')
    expect(ins).not.toContain('Hurt')
  })

  it('never proposes a fourth player from one club', () => {
    const w = world()
    // Three of the squad now play for Gross's club.
    for (const name of ['DefA', 'DefB', 'FwdA']) {
      const p = w.squad.find((s) => s.name === name)
      if (p) p.clubId = 16
    }
    const nameOf = byName(w)
    const ins = planWeek(w).filter((c) => c.category === 'transfer').map((c) => nameOf(c.inPlayerId))
    expect(ins).not.toContain('Gross')
  })
})

describe('Points hits · on the call that incurs them', () => {
  it('a transfer beyond the free allowance carries the four-point hit in its own net', () => {
    const one = planWeek(world({ freeTransfers: 1 })).filter((c) => c.category === 'transfer')
    const two = planWeek(world({ freeTransfers: 2 })).filter((c) => c.category === 'transfer')

    expect(one.every((c, i) => c.outcome.pointsHit === (i === 0 ? 0 : 4))).toBe(true)
    expect(two.slice(0, 2).every((c) => c.outcome.pointsHit === 0)).toBe(true)
  })
})

describe('F3-AC-04, F3-AC-06 · bench order', () => {
  it('F3-AC-04: a mis-ordered bench produces a bench-order call between the two bench players, at £0.00', () => {
    const w = world()
    // Bench 1 projects less than bench 3, and neither is wanted in the eleven.
    const rogers = w.squad.find((p) => p.name === 'Rogers')
    const subDef = w.squad.find((p) => p.name === 'SubDef')
    if (rogers) rogers.projections = flat(0.5)
    if (subDef) subDef.projections = flat(1.4)
    const name = byName(w)

    // No transfer pool, so the bench is tested alone. With one, selling a 0.5
    // bench player is a stronger call than reordering him — correctly — and the
    // transfer would hold Rogers first.
    const bench = planWeek({ ...w, pool: [] }).find((c) => c.shape === 'bench_order')
    expect(bench?.category).toBe('substitution')
    expect(bench?.outcome.costTenths).toBe(0)
    expect([name(bench?.outPlayerId ?? 0), name(bench?.inPlayerId ?? 0)].sort()).toEqual(['Rogers', 'SubDef'])
  })

  it('F3-AC-06: in a blank week the bench-order call leads the substitutions', () => {
    const w = world()
    // FwdB's club blanks, and the bench is mis-ordered. Van Hecke comes into the
    // eleven for FwdB — a forced swap at 90 — while the bench-order call between
    // Rogers and SubDef reads far lower. It leads anyway.
    const fwdB = w.squad.find((s) => s.name === 'FwdB')
    if (fwdB) { fwdB.hasFixture = false; fwdB.projections = [0, 5, 5] }
    const rogers = w.squad.find((p) => p.name === 'Rogers')
    const subDef = w.squad.find((p) => p.name === 'SubDef')
    if (rogers) rogers.projections = flat(0.5)
    if (subDef) subDef.projections = flat(1.4)

    const subs = planWeek({ ...w, pool: [] }).filter((c) => c.category === 'substitution')
    expect(subs.map((c) => c.shape)).toContain('forced_swap')
    expect(subs[0]?.shape).toBe('bench_order')
    expect((subs[0]?.outcome.conviction ?? 0) < (subs[1]?.outcome.conviction ?? 0)).toBe(true)
  })
})

describe('Model proposals are checked, never trusted', () => {
  it('a valid proposal is used even when code would have picked another', () => {
    const w = world()
    const name = byName(w)
    const midA = w.squad.find((p) => p.name === 'MidB')
    const winger = w.pool.find((p) => p.name === 'Winger')
    const calls = planWeek({ ...w, proposals: [{ outPlayerId: midA?.playerId ?? 0, inPlayerId: winger?.playerId ?? 0 }] })
    const transfers = calls.filter((c) => c.category === 'transfer').map((c) => `${name(c.outPlayerId)}→${name(c.inPlayerId)}`)
    expect(transfers).toEqual(['MidB→Winger'])
  })

  it('a proposal the engine scores as no better never suppresses the transfer code would have found', () => {
    // The second live run's failure: valid, losing proposals left the week with
    // no transfer at all while a strong one existed.
    const w = world()
    const semenyo = w.squad.find((p) => p.name === 'Semenyo')
    const winger = w.pool.find((p) => p.name === 'Winger')
    const withLoser = planWeek({ ...w, proposals: [{ outPlayerId: semenyo?.playerId ?? 0, inPlayerId: winger?.playerId ?? 0 }] })

    const transfers = (calls: ReturnType<typeof planWeek>) => calls.filter((c) => c.category === 'transfer').map((c) => c.key)
    expect(transfers(withLoser)).toEqual(transfers(planWeek(w)))
    expect(transfers(withLoser).length).toBeGreaterThan(0)
  })

  it('a proposal naming an excluded, unaffordable or unknown player is ignored', () => {
    const w = world()
    const hurt = w.pool.find((p) => p.name === 'Hurt')
    const midB = w.squad.find((p) => p.name === 'MidB')
    const withBad = planWeek({
      ...w,
      proposals: [
        { outPlayerId: midB?.playerId ?? 0, inPlayerId: hurt?.playerId ?? 0 },
        { outPlayerId: 9999, inPlayerId: 1 },
      ],
    })
    const without = planWeek(w)
    expect(withBad.map((c) => c.key)).toEqual(without.map((c) => c.key))
  })
})
