/**
 * Before and After under each filter chip (F8-AC-09 – F8-AC-11, F8-AC-20 –
 * F8-AC-26, F3-UP-01 – F3-UP-03).
 *
 * **The rejected-call case is the one that matters** (F8-AC-25), and it only
 * exists if a call has actually been rejected — so these tests reject one,
 * rather than filtering a list nobody has touched. A test over undecided calls
 * would pass identically whether the rule were implemented or not.
 */

import { describe, expect, it } from 'vitest'
import type { DecisionState, World, WorldCall, WorldPlayer } from '../../apps/client/src/api'
import { callsUnder, scenarioFor } from '../../apps/client/src/calls/scenario'

const player = (id: number, name: string, extra: Partial<WorldPlayer> = {}): WorldPlayer => ({
  playerId: id,
  name,
  shirtNumber: null,
  clubId: id,
  clubShortName: `C${String(id)}`,
  position: 'MID',
  isStarter: true,
  benchOrder: null,
  isCaptain: false,
  isVice: false,
  status: 'a',
  chanceOfPlayingNextRound: null,
  nowCostTenths: 50,
  form: 3,
  selectedByPercent: 10,
  seasonPoints: 20,
  transfersIn: 0,
  transfersOut: 0,
  projectedPoints: 4,
  projections: [4, 4, 4],
  fixtures: [{ opponentClubId: 99, opponentShortName: 'BUR', isHome: true, difficulty: 2 }],
  nextThree: [2, 2, 2],
  purchasePriceTenths: null,
  sellingPriceTenths: null,
  priceLikelihoodTonight: null,
  priceLockedUntil: null,
  ...extra,
})

const call = (key: string, extra: Partial<WorldCall> = {}): WorldCall => ({
  key,
  category: 'transfer',
  shape: 'transfer',
  outPlayerId: 1,
  inPlayerId: 20,
  net: 2,
  isReading: false,
  readingReason: null,
  conviction: 67,
  band: 'lean',
  k: 2,
  pointsHit: 0,
  costTenths: 0,
  isForced: false,
  watch: false,
  watchReason: null,
  reasoning: 'x',
  reasoningSource: 'template',
  breakdown: { weights: [1], out: { playerId: 1, projections: [1], gate: { eligible: true }, total: 1 }, in: { playerId: 20, projections: [2], gate: { eligible: true }, total: 2 }, net: 1, pointsHit: 0, k: 0.5, kLabel: 'transfer', byCeiling: false },
  alternatives: null,
  position: 0,
  diffTag: null,
  previousConviction: null,
  ...extra,
})

/** A legal fifteen: 2 GKP, 5 DEF, 5 MID, 3 FWD, eleven of them starting 4-4-2. */
const SQUAD: WorldPlayer[] = [
  player(1, 'Keeper', { position: 'GKP' }),
  player(2, 'Sub keeper', { position: 'GKP', isStarter: false, benchOrder: 0 }),
  ...[3, 4, 5, 6].map((id) => player(id, `Def${String(id)}`, { position: 'DEF' })),
  player(7, 'Def7', { position: 'DEF', isStarter: false, benchOrder: 1 }),
  ...[8, 9, 10, 11].map((id) => player(id, `Mid${String(id)}`, { position: 'MID' })),
  player(12, 'Mid12', { position: 'MID', isStarter: false, benchOrder: 2, projectedPoints: 6 }),
  ...[13, 14].map((id) => player(id, `Fwd${String(id)}`, { position: 'FWD' })),
  player(15, 'Fwd15', { position: 'FWD', isStarter: false, benchOrder: 3 }),
]

const world = (extra: Partial<World> = {}): World => ({
  gameweek: { id: 5, name: 'Gameweek 5', deadlineTime: '2026-09-18T17:30:00Z' },
  snapshot: { id: 's1', source: 'fpl_deadline', capturedAt: '2026-09-12T11:30:00Z', bankTenths: 10, freeTransfers: 1, chipsRemaining: {}, picksFrom: 4 },
  players: SQUAD,
  candidates: [player(20, 'Incoming', { position: 'MID', projectedPoints: 7, clubShortName: 'C3' })],
  calls: [],
  decisions: {},
  lastRunAt: null,
  editorial: null,
  priceForecastReadAt: null,
  blanks: 0,
  doubles: 0,
  attribution: { name: 'Fantasy Football IQ', href: 'https://fantasyfootballiq.app' },
  ...extra,
})

const none: Record<string, DecisionState> = {}

describe('F8-AC-20 – F8-AC-24 · what each chip shows', () => {
  const live = [
    call('plain'),
    call('forced', { isForced: true, conviction: 59, band: 'thin' }),
    call('strong', { conviction: 84, band: 'strong' }),
    call('weak', { conviction: 40, band: 'thin' }),
  ]

  it('F8-AC-20, F8-AC-21, F8-AC-22: each chip over the same four calls yields its own set', () => {
    expect(callsUnder('all', live, none).map((c) => c.key)).toEqual(['plain', 'forced', 'strong', 'weak'])
    expect(callsUnder('forced', live, none).map((c) => c.key)).toEqual(['forced'])
    // Forced *and* Recommended: the forced one is in despite being 59%, and the
    // 84% one is in because 80 is where strong starts.
    expect(callsUnder('recommended', live, none).map((c) => c.key)).toEqual(['forced', 'strong'])
  })

  it('F8-AC-23, F8-AC-24: only Selected reads decisions, and it reads them alone', () => {
    // The trigger: decisions that actually exist. One selected, one rejected.
    const decisions: Record<string, DecisionState> = { plain: 'selected', strong: 'rejected' }

    expect(callsUnder('selected', live, decisions).map((c) => c.key)).toEqual(['plain'])
    // The three band views are unmoved by the same decisions.
    expect(callsUnder('all', live, decisions)).toHaveLength(4)
    expect(callsUnder('recommended', live, decisions).map((c) => c.key)).toEqual(['forced', 'strong'])
  })

  it('F8-AC-25: a rejected call is still inside a band filter’s After squad', () => {
    // The counter-intuitive half, and it needs a rejection to exist at all.
    const w = world({ calls: [call('strong', { conviction: 84, band: 'strong' })] })
    const rejected: Record<string, DecisionState> = { strong: 'rejected' }

    const band = scenarioFor(w, w.calls, 'recommended', rejected)
    expect(band.calls.map((c) => c.key)).toEqual(['strong'])
    expect(band.after.some((p) => p.playerId === 20)).toBe(true)

    // And Selected, over the same rejection, shows the squad unchanged.
    const selected = scenarioFor(w, w.calls, 'selected', rejected)
    expect(selected.calls).toEqual([])
    expect(selected.after.some((p) => p.playerId === 20)).toBe(false)
  })
})

describe('F8-AC-09, F8-AC-10 · Before, After and the three totals', () => {
  it('F8-AC-09, F8-AC-10: a transfer in the scenario replaces the player and moves the projected total', () => {
    const w = world({ calls: [call('t', { outPlayerId: 8, inPlayerId: 20, costTenths: 4 })] })
    const s = scenarioFor(w, w.calls, 'all', none)

    expect(s.before.some((p) => p.playerId === 8)).toBe(true)
    expect(s.after.some((p) => p.playerId === 8)).toBe(false)
    expect(s.after.find((p) => p.playerId === 20)?.isStarter).toBe(true)
    // The incoming player projects 7 where the outgoing projected 4.
    expect(s.projected).toBeCloseTo(
      s.before.filter((p) => p.isStarter).reduce((n, p) => n + p.projectedPoints, 0) + 3,
    )
    expect(s.nbalTenths).toBe(6)
  })

  it('F8-AC-10: a substitution changes who starts without changing the fifteen or the bank', () => {
    const w = world({
      calls: [call('s', { category: 'substitution', shape: 'upgrade_swap', outPlayerId: 9, inPlayerId: 12 })],
    })
    const s = scenarioFor(w, w.calls, 'all', none)

    expect(s.after.find((p) => p.playerId === 9)?.isStarter).toBe(false)
    expect(s.after.find((p) => p.playerId === 12)?.isStarter).toBe(true)
    expect(s.after).toHaveLength(15)
    expect(s.nbalTenths).toBe(10)
    expect(s.transfersUsed).toBe(0)
  })

  it('STE-147: one armband call moves both armbands, not just the captain', () => {
    /**
     * **The defect this was written after.** With two calls this read the shape
     * to know which armband it was holding. One call says *armband* and carries
     * both picks in its ranking — so taking only the incoming player set the
     * captain and left the vice wherever it already was, and the AFTER pitch
     * showed a vice the advice had replaced.
     */
    const w = world({
      players: SQUAD.map((p) =>
        p.playerId === 8 ? { ...p, isCaptain: true } : p.playerId === 11 ? { ...p, isVice: true } : p,
      ),
      calls: [
        call('a', {
          category: 'captaincy',
          shape: 'armband',
          outPlayerId: 8,
          inPlayerId: 13,
          breakdown: {
            ...call('x', { category: 'captaincy' }).breakdown,
            armband: {
              captainId: 13,
              viceId: 9,
              rows: [
                { playerId: 13, projection: 8, because: null, isCaptainPick: true, isVicePick: false, byCeiling: false },
                { playerId: 9, projection: 7, because: null, isCaptainPick: false, isVicePick: true, byCeiling: false },
              ],
            },
          },
        }),
      ],
    })
    const s = scenarioFor(w, w.calls, 'all', none)

    expect(s.after.find((p) => p.playerId === 13)?.isCaptain).toBe(true)
    // The half that used to be left behind.
    expect(s.after.find((p) => p.playerId === 9)?.isVice).toBe(true)
    expect(s.after.find((p) => p.playerId === 11)?.isVice).toBe(false)
    expect(s.after.filter((p) => p.isCaptain)).toHaveLength(1)
    expect(s.after.filter((p) => p.isVice)).toHaveLength(1)
  })

  it('F8-AC-10: a captaincy call moves the armband and nothing else', () => {
    const w = world({
      players: SQUAD.map((p) => (p.playerId === 8 ? { ...p, isCaptain: true } : p)),
      calls: [call('c', { category: 'captaincy', shape: 'captain', outPlayerId: 8, inPlayerId: 13 })],
    })
    const s = scenarioFor(w, w.calls, 'all', none)

    expect(s.after.find((p) => p.playerId === 8)?.isCaptain).toBe(false)
    expect(s.after.find((p) => p.playerId === 13)?.isCaptain).toBe(true)
    expect(s.after.filter((p) => p.isCaptain)).toHaveLength(1)
  })
})

describe('F8-AC-11, F3-UP-01 – F3-UP-03 · what a plan gets wrong, stated not blocked', () => {
  it('F8-AC-11, F3-UP-02: a second transfer against one free transfer states the deduction and nets the total', () => {
    // The trigger is a scenario that genuinely exceeds the allowance — two
    // transfer calls against `freeTransfers: 1`.
    const w = world({
      calls: [
        call('t1', { outPlayerId: 8, inPlayerId: 20 }),
        call('t2', { outPlayerId: 9, inPlayerId: 21 }),
      ],
      candidates: [
        player(20, 'In20', { position: 'MID', projectedPoints: 7, clubShortName: 'C20' }),
        player(21, 'In21', { position: 'MID', projectedPoints: 7, clubShortName: 'C21' }),
      ],
    })
    const s = scenarioFor(w, w.calls, 'all', none)

    expect(s.transfersUsed).toBe(2)
    expect(s.hit).toBe(4)
    expect(s.breaches).toContainEqual({ kind: 'transfers', message: 'FT 2/1 · −4 pts' })
    // The total is net of the hit, so the cost is visible in the figure he judges by.
    const gross = s.after.filter((p) => p.isStarter).reduce((n, p) => n + p.projectedPoints, 0)
    expect(s.projected).toBeCloseTo(gross - 4)
  })

  it('F3-UP-01: a plan costing more than the bank holds reports the shortfall in money', () => {
    const w = world({ calls: [call('t', { outPlayerId: 8, inPlayerId: 20, costTenths: 12 })] })
    const s = scenarioFor(w, w.calls, 'all', none)

    expect(s.nbalTenths).toBe(-2)
    expect(s.breaches[0]).toMatchObject({ kind: 'bank' })
    expect(s.breaches[0]?.message).toMatch(/£0.2m more than you have/)
  })

  it('F3-UP-03: a fourth player from one club is caught from the fifteen, not from the calls', () => {
    // Three players already share a club, and the incoming player is a fourth.
    // Neither call is illegal on its own — the breach only exists in the squad.
    const shared = SQUAD.map((p) => ([3, 4, 5] as number[]).includes(p.playerId) ? { ...p, clubShortName: 'LIV' } : p)
    const w = world({
      players: shared,
      candidates: [player(20, 'In20', { position: 'MID', projectedPoints: 7, clubShortName: 'LIV' })],
      calls: [call('t', { outPlayerId: 8, inPlayerId: 20 })],
    })
    const s = scenarioFor(w, w.calls, 'all', none)

    expect(s.breaches).toContainEqual({ kind: 'squad', message: 'LIV 4/3 · FPL allows three from one club' })
  })

  it('F3-UP-03: an eleven left with too few defenders is named as an illegal shape', () => {
    // Two substitutions, each legal alone, that together bench three defenders.
    const w = world({
      calls: [
        call('s1', { category: 'substitution', shape: 'upgrade_swap', outPlayerId: 3, inPlayerId: 12 }),
        call('s2', { category: 'substitution', shape: 'upgrade_swap', outPlayerId: 4, inPlayerId: 15 }),
      ],
    })
    const s = scenarioFor(w, w.calls, 'all', none)

    expect(s.breaches.map((b) => b.message)).toContain('2 DEF in the eleven · FPL allows 3 to 5')
  })

  it('F8-AC-10: a legal plan inside the allowance reports no breach at all', () => {
    const w = world({ calls: [call('t', { outPlayerId: 8, inPlayerId: 20, costTenths: 4 })] })
    expect(scenarioFor(w, w.calls, 'all', none).breaches).toEqual([])
  })
})
