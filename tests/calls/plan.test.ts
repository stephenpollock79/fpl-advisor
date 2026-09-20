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
import { type PlanPlayer, type PlannedCall, type SquadEntry, isDecidable, planWeek } from '../../apps/server/src/calls/plan.js'

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
  takesPenalties: false,
  ...extra,
})

const inSquad = (
  p: PlanPlayer & { name: string },
  role: 'starter' | 0 | 1 | 2 | 3,
  sellingPriceTenths = p.nowCostTenths,
  armband?: 'captain' | 'vice',
): SquadEntry & { name: string } => ({
  ...p,
  isStarter: role === 'starter',
  benchOrder: role === 'starter' ? null : role,
  sellingPriceTenths,
  isCaptain: armband === 'captain',
  isVice: armband === 'vice',
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
    inSquad(player('Semenyo', 'MID', 8, 6.2, 84), 'starter', 84, 'captain'),
    inSquad(player('FwdA', 'FWD', 9, 6.0), 'starter'),
    inSquad(player('FwdB', 'FWD', 10, 5.0), 'starter'),
    inSquad(player('Haaland', 'FWD', 11, 8.0, 155), 'starter', 155, 'vice'),
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

/**
 * The figures of a call the manager can act on.
 *
 * Every assertion below was written when every call had them. A keep reading has
 * no conviction and no cost, so reaching for one has to fail loudly here rather
 * than read as zero — which is the whole point of the two arms being separate.
 */
const figuresOf = (call: PlannedCall | undefined) => {
  if (!call || !isDecidable(call)) throw new Error('expected a call the manager can act on, not a reading')
  return call.outcome
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
  it('F3-UP-04: no two calls touch the same player, outside the armband pair', () => {
    const w = world()
    // The captain and vice calls are one armband decision shown as two cards and
    // are exempt from each other (ruled 2026-09-14) — promoting the vice and
    // naming his replacement names him twice, unavoidably. The rule the exemption
    // does not touch is the one it was written for: between categories.
    const touched = planWeek(w)
      .filter((c) => c.category !== 'captaincy')
      .flatMap((c) => [c.outPlayerId, c.inPlayerId])
    expect(new Set(touched).size).toBe(touched.length)
  })

  it('F3-UP-04: an armband is never offered to a player another call already holds', () => {
    const w = world()
    const calls = planWeek(w)
    const claimed = new Set(
      calls.filter((c) => c.category !== 'captaincy').flatMap((c) => [c.outPlayerId, c.inPlayerId]),
    )
    // The challenger is the claim. The incumbent side is the squad as it stands:
    // if the captain is being sold the armband has to move, and refusing to say so
    // would leave the manager with advice that contradicts itself.
    for (const call of calls.filter((c) => c.category === 'captaincy')) {
      expect(claimed.has(call.inPlayerId)).toBe(false)
    }
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

    expect(figuresOf(transfer).costTenths).toBe((into?.nowCostTenths ?? 0) - (out?.sellingPriceTenths ?? 0))
  })

  it('F3-AC-28: every substitution costs £0.00', () => {
    const subs = planWeek(world()).filter((c) => c.category === 'substitution')
    expect(subs.length).toBeGreaterThan(0)
    expect(subs.every((c) => figuresOf(c).costTenths === 0)).toBe(true)
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

    expect(one.every((c, i) => figuresOf(c).pointsHit === (i === 0 ? 0 : 4))).toBe(true)
    expect(two.slice(0, 2).every((c) => figuresOf(c).pointsHit === 0)).toBe(true)
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
    expect(figuresOf(bench).costTenths).toBe(0)
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
    expect(figuresOf(subs[0]).conviction < figuresOf(subs[1]).conviction).toBe(true)
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

describe('F4-AC-01, STE-151 · the armband, as one ranked call', () => {
  const armbandOf = (w: ReturnType<typeof world>, squad = w.squad) =>
    planWeek({ ...w, squad }).filter((c) => c.category === 'captaincy')

  it('STE-151: one call carries the week, not two swaps', () => {
    // **The shape this replaced.** It was a captain call and a vice call, each a
    // head-to-head. The engine never worked that way — it ranks and takes the
    // top two — and every translation back into a pair of swaps was a chance to
    // get it wrong. Five editorials did.
    const calls = armbandOf(world())

    expect(calls).toHaveLength(1)
    expect(calls[0]?.shape).toBe('armband')
  })

  it('ENGINE-AC-06, F4-AC-01: the ranking is carried whole, top two marked, highest first', () => {
    const w = world()
    const name = byName(w)
    const rows = armbandOf(w)[0]?.armband?.rows ?? []

    // Every squad member is here, pickable or not — a high projection on the
    // bench is the answer to "why isn't he captain?".
    expect(rows).toHaveLength(w.squad.length)
    expect([...rows].sort((a, b) => b.projection - a.projection)).toEqual([...rows])

    const captain = rows.find((r) => r.isCaptainPick)
    const vice = rows.find((r) => r.isVicePick)
    expect(name(captain?.playerId ?? -1)).toBe('Haaland')
    expect(captain?.playerId).not.toBe(vice?.playerId)
  })

  it('F4-AC-14: a bench player is a candidate, because the manager is one tap from starting him', () => {
    // **The rule this replaced barred the squad's two best answers.** On the
    // first live week Groß projected 11.0 and De Cuyper 8.8, both on the bench,
    // both the subject of substitutions not yet accepted — and the table ruled
    // them out on a condition the manager was one tap from changing.
    const w = world()
    const name = byName(w)
    const rows = armbandOf(w)[0]?.armband?.rows ?? []

    // Rogers is on the bench on 7.0 and is now second in the squad.
    expect(name(rows.find((r) => r.isVicePick)?.playerId ?? -1)).toBe('Rogers')
    expect(rows.find((r) => r.isVicePick)?.because).toBeNull()
  })

  it("F4-AC-14: a player another call names is not barred — the manager has not agreed to that call yet", () => {
    /**
     * **Presuming in both directions at once is not consistency.** The table
     * greyed out five of the fifteen for substitutions and transfers the manager
     * had not accepted, while the two picks at the top were there *because* of
     * substitutions he had not accepted. Only the facts that hold whatever he
     * decides may bar anyone.
     */
    const w = world()
    const calls = planWeek(w)
    const named = new Set(
      calls.filter((c) => c.category !== 'captaincy').flatMap((c) => [c.outPlayerId, c.inPlayerId]),
    )
    const rows = calls.find((c) => c.shape === 'armband')?.armband?.rows ?? []

    expect(named.size).toBeGreaterThan(0)
    for (const id of named) {
      const row = rows.find((r) => r.playerId === id)
      if (row) expect(row.because).toBeNull()
    }
  })

  it('F4-AC-14: the two facts that hold whatever he decides do bar a player, and say so', () => {
    const w = world()
    const out = { eligible: false, reason: 'injured' } as const
    const squad = w.squad.map((p) =>
      p.name === 'MidA' ? { ...p, availability: out } : p.name === 'MidB' ? { ...p, hasFixture: false } : p,
    )
    const rows = armbandOf(w, squad)[0]?.armband?.rows ?? []
    const name = byName(w)

    expect(rows.find((r) => name(r.playerId) === 'MidA')?.because).toBe('injured')
    expect(rows.find((r) => name(r.playerId) === 'MidB')?.because).toBe('no fixture this gameweek')
  })

  it('ENGINE-AC-06: the figure is the captain move, because the captain is what doubles', () => {
    const w = world()
    const name = byName(w)
    const call = armbandOf(w)[0]

    // Semenyo holds it on 6.2; Haaland is the best starter on 8.0. The week
    // scores 2·Haaland + Semenyo instead of 2·Semenyo + Haaland, so the gain is
    // the plain difference, once.
    expect(name(call?.outPlayerId ?? -1)).toBe('Semenyo')
    expect(name(call?.inPlayerId ?? -1)).toBe('Haaland')
    if (call?.outcome.reading === 'call') expect(call.outcome.net).toBeCloseTo(1.8, 5)
  })

  it('STE-151: where the captain is already right but the vice is not, the call is the vice move', () => {
    // The case a captain-only figure would report as +0.00 over a real change.
    const w = world()
    const name = byName(w)
    const squad = w.squad.map((p) => ({ ...p, isCaptain: p.name === 'Haaland', isVice: p.name === 'MidA' }))
    const call = armbandOf(w, squad)[0]

    expect(call?.outcome.reading).toBe('call')
    expect(name(call?.outPlayerId ?? -1)).toBe('MidA')
    expect(name(call?.inPlayerId ?? -1)).toBe('Rogers')
  })

  it('F4-AC-15, F3-AC-28: the armband costs nothing and uses no transfer', () => {
    const call = armbandOf(world())[0]
    if (call?.outcome.reading !== 'call') throw new Error('expected a decidable armband call')
    expect(call.outcome.costTenths).toBe(0)
    expect(call.outcome.pointsHit).toBe(0)
  })

  it('STE-189: a holder who cannot play moves the armband without being forced', () => {
    /**
     * **The flag was a second way of saying what the order already says**
     * (ruled 2026-09-20). A holder who cannot play is barred by `F4-AC-14`,
     * cannot be the pick, and sinks below every eligible player — so the
     * armband moves, visibly, with the reason on his row.
     */
    const w = world()
    const name = byName(w)
    const squad = w.squad.map((p) => (p.name === 'Semenyo' ? { ...p, hasFixture: false } : p))
    const call = armbandOf(w, squad)[0]
    const rows = call?.armband?.rows ?? []

    expect(call?.outcome.reading).toBe('call')
    if (call?.outcome.reading === 'call') expect(call.outcome.isForced).toBe(false)
    // The armband leaves him, and the table shows why without a badge.
    expect(name(call?.inPlayerId ?? -1)).not.toBe('Semenyo')
    expect(rows.find((r) => name(r.playerId) === 'Semenyo')?.because).toBe('no fixture this gameweek')
  })

  it('F4-AC-14: a barred player sinks below every eligible one, whatever his figure says', () => {
    // He does not sink on the figure — the feed keeps projecting him unless his
    // club blanks. Only the gate knows, and only the order can show it.
    const w = world()
    const name = byName(w)
    const out = { eligible: false, reason: 'injured' } as const
    const squad = w.squad.map((p) => (p.name === 'Haaland' ? { ...p, availability: out } : p))
    const rows = armbandOf(w, squad)[0]?.armband?.rows ?? []

    const haaland = rows.findIndex((r) => name(r.playerId) === 'Haaland')
    const lastEligible = rows.map((r) => r.because).lastIndexOf(null)
    expect(haaland).toBeGreaterThan(lastEligible)
  })

  it('STE-189: a holder who cannot play still scores strongly, because he projects zero', () => {
    // Stephen's point when this was designed: forced should read strongly on its
    // own, because the gap to the best available *is* the whole of it.
    const w = world()
    const squad = w.squad.map((p) => (p.name === 'Semenyo' ? { ...p, hasFixture: false } : p))
    const free = armbandOf(w)[0]
    const forced = armbandOf(w, squad)[0]

    if (free?.outcome.reading !== 'call' || forced?.outcome.reading !== 'call') {
      throw new Error('expected decidable armband calls')
    }
    expect(forced.outcome.net).toBeGreaterThan(free.outcome.net)
    expect(forced.outcome.conviction).toBeGreaterThan(free.outcome.conviction)
  })

  it('STE-189: a holder the gate excludes is still forced, because that rule is the whole app\'s', () => {
    /**
     * **How far the ruling actually reaches, stated rather than discovered.**
     *
     * "The armband is never forced" is not achievable from here. The engine sets
     * forced for any call whose incumbent fails the availability gate, and that
     * rule is shared with substitutions (`F3-AC-17`) — changing it would change
     * them too, and overriding it when storing would leave our own row
     * disagreeing with the arithmetic that produced it.
     *
     * So what went is the armband's *own* forcing: a blanking club no longer
     * flags the call, because the ranking already sinks him. A holder the gate
     * excludes is forced by the same rule that forces every other call about a
     * player who cannot play, and that is not an armband special case.
     */
    const w = world()
    const out = { eligible: false, reason: 'injured' } as const
    const squad = w.squad.map((p) => (p.name === 'Semenyo' ? { ...p, availability: out } : p))
    const call = armbandOf(w, squad)[0]

    expect(call?.outcome.reading).toBe('call')
    if (call?.outcome.reading === 'call') expect(call.outcome.isForced).toBe(true)
  })

  it('STE-189: a blanking club no longer forces the armband — the ranking already sinks him', () => {
    const call = armbandOf(world())[0]
    expect(call?.outcome.reading).toBe('call')
    if (call?.outcome.reading === 'call') expect(call.outcome.isForced).toBe(false)
  })

  it('F4-AC-01: a squad with fewer than two eligible starters keeps its other advice rather than failing', () => {
    const w = world()
    const out = { eligible: false, reason: 'injured' } as const
    // The whole fifteen now, not the eleven — a bench player is a candidate.
    const squad = w.squad.map((p) => (p.name === 'Haaland' ? p : { ...p, availability: out }))
    const calls = planWeek({ ...w, squad })

    expect(calls.filter((c) => c.category === 'captaincy')).toHaveLength(0)
    expect(calls.length).toBeGreaterThan(0)
  })

  it('F4-AC-01: where both armbands are already right, the call is a keep reading with no figure', () => {
    const w = world()
    // Haaland tops the fifteen on 8.0 and Rogers is second on 7.0, bench or not.
    const squad = w.squad.map((p) => ({ ...p, isCaptain: p.name === 'Haaland', isVice: p.name === 'Rogers' }))
    const calls = armbandOf(w, squad)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.outcome.reading).toBe('no_change')
    expect(calls[0]?.outcome).not.toHaveProperty('conviction')
    // The ranking still travels, because the table is the advice (F4-AC-01).
    expect(calls[0]?.armband?.rows.length).toBe(w.squad.length)
  })
})

describe('F4-AC-13 · the ceiling tie-break reaches the table', () => {
  it('F4-AC-13: the row the tie-break chose says so, and the others do not', () => {
    const w = world()
    const plain = planWeek(w).find((c) => c.shape === 'armband')
    expect(plain?.armband?.rows.some((r) => r.byCeiling)).toBe(false)

    // Inside the noise floor of 0.125 points, and the penalty taker wins it.
    const squad = w.squad.map((p) =>
      p.name === 'FwdA' ? { ...p, projections: [7.95, 7.95, 7.95], takesPenalties: true } : p,
    )
    const name = byName(w)
    const tied = planWeek({ ...w, squad }).find((c) => c.shape === 'armband')
    const chosen = tied?.armband?.rows.find((r) => r.isCaptainPick)

    expect(name(chosen?.playerId ?? -1)).toBe('FwdA')
    expect(chosen?.byCeiling).toBe(true)
  })
})

describe('F6-AC-01, F6-AC-03, F6-AC-05 · what a refresh keeps, and what it walks through', () => {
  it('F6-AC-01: a selected transfer spends its money and its free transfer before the plan starts', () => {
    const w = world({ freeTransfers: 1, bankTenths: 100 })
    const name = byName(w)
    const committed = [{ key: 'transfer:out=7:in=16', outPlayerId: 7, inPlayerId: 16, costTenths: 30, isTransfer: true }]
    const calls = planWeek({ ...w, committed })

    // Neither player is offered again — the decision is not a suggestion.
    const touched = calls.flatMap((c) => [c.outPlayerId, c.inPlayerId])
    expect(touched).not.toContain(7)
    expect(touched).not.toContain(16)
    // And the free transfer is gone, so a further transfer carries the hit.
    const transfers = calls.filter((c) => c.category === 'transfer')
    expect(transfers.length).toBeGreaterThan(0)
    for (const t of transfers) expect(figuresOf(t).pointsHit).toBe(4)
    expect(name(16)).toBe('Gross')
  })

  it('F6-AC-01: the bought player is in the squad, so he can be substituted or captained', () => {
    const w = world({ bankTenths: 200 })
    // Commit the strongest pool player in, and check the plan treats him as owned
    // rather than as someone still to be bought.
    const committed = [{ key: 'transfer:out=7:in=18', outPlayerId: 7, inPlayerId: 18, costTenths: 90, isTransfer: true }]
    const calls = planWeek({ ...w, committed })

    /**
     * **The title of this test was already right and its assertion was not.**
     *
     * It asserted he appeared in no call at all — F3-UP-04 read as *one player,
     * one call* — while the name above says he can be substituted or captained.
     * A committed transfer is not a competing proposal; it is settled, and the
     * player is as much a squad member as anyone else.
     *
     * So he is a candidate for the armband (ruled 2026-09-20 with the widened
     * pool), and F3-UP-04 still holds where it means something: nothing may
     * claim him *out* of the squad a second time.
     */
    const armband = calls.find((c) => c.shape === 'armband')
    expect(armband?.armband?.rows.some((r) => r.playerId === 18 && r.because === null)).toBe(true)
    expect(calls.filter((c) => c.category !== 'captaincy').flatMap((c) => [c.outPlayerId, c.inPlayerId])).not.toContain(
      18,
    )
  })

  it('F6-AC-03: a rejected call is not offered again while its premise stands', () => {
    const w = world()
    const first = planWeek(w).filter((c) => c.category === 'transfer')
    const rejected = first[0]?.key
    expect(rejected).toBeDefined()

    const again = planWeek({ ...w, suppressed: new Set([rejected ?? '']) })
    expect(again.map((c) => c.key)).not.toContain(rejected)
  })

  it('F6-AC-05: a forced call surfaces even when it was rejected earlier', () => {
    const w = world()
    // Shaw's club blanks, so the swap that covers him is forced.
    const squad = w.squad.map((p) => (p.name === 'Shaw' ? { ...p, hasFixture: false } : p))
    const forced = planWeek({ ...w, squad }).find((c) => c.outPlayerId === 2)
    expect(forced).toBeDefined()
    expect(figuresOf(forced).isForced).toBe(true)

    const again = planWeek({ ...w, squad, suppressed: new Set([forced?.key ?? '']) })
    expect(again.map((c) => c.key)).toContain(forced?.key)
  })

  it('F6-AC-04: with nothing committed and nothing suppressed the plan is exactly what it was', () => {
    const w = world()
    expect(planWeek({ ...w, committed: [], suppressed: new Set() }).map((c) => c.key)).toEqual(
      planWeek(w).map((c) => c.key),
    )
  })
})
