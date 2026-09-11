/**
 * What slice 5 adds to the world: calls, decisions, candidates, a horizon of
 * projections per player, and the selling price.
 *
 * The world passes the engine's figures through exactly as the run stored them
 * — nothing about a call is recomputed on read (ENGINE-AC-04).
 */

import { describe, expect, it } from 'vitest'
import { type WorldCall, assembleWorld } from '../../apps/server/src/world/assemble.js'

const gameweek = { id: 4, name: 'Gameweek 4', deadlineTime: '2026-09-12T12:30:00Z', isNext: true, isCurrent: false, finished: false, dataChecked: false }

const clubs = [
  { id: 1, name: 'Forest', shortName: 'NFO' },
  { id: 2, name: 'Villa', shortName: 'AVL' },
  { id: 3, name: 'Palace', shortName: 'CRY' },
  { id: 4, name: 'Spurs', shortName: 'TOT' },
]

const players = [
  { id: 557, clubId: 1, position: 'MID' as const, firstName: 'Christos', surname: 'Tzolis', shirtNumber: 21 },
  { id: 40, clubId: 2, position: 'MID' as const, firstName: 'Morgan', surname: 'Rogers', shirtNumber: 27 },
  { id: 124, clubId: 3, position: 'MID' as const, firstName: 'Pascal', surname: 'Groß', shirtNumber: 13 },
]

// Club 1 plays in GW4 and GW6 but blanks GW5; clubs 2 and 3 play all three.
const fixtures = [
  { id: 1, gameweek: 4, homeClub: 1, awayClub: 2, kickoff: null, homeDifficulty: 3, awayDifficulty: 2, finished: false },
  { id: 2, gameweek: 4, homeClub: 3, awayClub: 4, kickoff: null, homeDifficulty: 2, awayDifficulty: 3, finished: false },
  { id: 3, gameweek: 5, homeClub: 2, awayClub: 3, kickoff: null, homeDifficulty: 2, awayDifficulty: 3, finished: false },
  { id: 4, gameweek: 6, homeClub: 3, awayClub: 1, kickoff: null, homeDifficulty: 2, awayDifficulty: 4, finished: false },
  { id: 5, gameweek: 6, homeClub: 2, awayClub: 4, kickoff: null, homeDifficulty: 2, awayDifficulty: 3, finished: false },
]

const projections = [4, 5, 6].flatMap((gw) =>
  [557, 40, 124].map((playerId) => ({ gameweek: gw, playerId, projectedPoints: 5, feedReadId: 'r1' })),
)

const state = (playerId: number, nowCostTenths: number) => ({
  feedReadId: 'r1',
  playerId,
  status: 'a',
  news: null,
  newsAdded: null,
  chanceOfPlayingNextRound: null,
  nowCostTenths,
  form: 3,
  selectedByPercent: 10,
  seasonPoints: 20,
  transfersIn: 100,
  transfersOut: 100,
})

const call: WorldCall = {
  key: 'substitution:upgrade:out=557:in=40',
  category: 'substitution',
  shape: 'upgrade_swap',
  outPlayerId: 557,
  inPlayerId: 40,
  net: 4.6,
  conviction: 90,
  band: 'certain',
  k: 0.5,
  pointsHit: 0,
  costTenths: 0,
  isForced: false,
  watch: false,
  watchReason: null,
  reasoning: 'Rogers over Tzolis.',
  reasoningSource: 'template',
  breakdown: { net: 4.6 },
  alternatives: { out: [], in: [124] },
  position: 0,
}

const world = () =>
  assembleWorld({
    gameweek,
    lastScored: null,
    snapshot: { id: 's1', source: 'fpl_deadline', capturedAt: '2026-09-11T10:00:00Z', bankTenths: 10, freeTransfers: 3, chipsRemaining: {} },
    squad: [
      { playerId: 557, isStarter: true, benchOrder: null, isCaptain: true, isVice: false, purchasePriceTenths: 60 },
      { playerId: 40, isStarter: false, benchOrder: 1, isCaptain: false, isVice: true, purchasePriceTenths: null },
    ],
    players,
    clubs,
    fixtures,
    projections,
    states: [state(557, 64), state(40, 76), state(124, 56)],
    calls: [call],
    decisions: [{ callKey: call.key, state: 'selected' }],
    candidateIds: [124],
    lastRunAt: '2026-09-11T15:00:00Z',
  })

describe('What the world carries for the calls', () => {
  it('F3-AC-25: a squad player\'s selling price comes from the engine, from what he was bought for', () => {
    // Bought at 6.0, worth 6.4: half the 0.4 profit, so 6.2.
    expect(world().players.find((p) => p.playerId === 557)?.sellingPriceTenths).toBe(62)
  })

  it('F3-AC-26: an unrecovered purchase price stays unknown rather than being guessed', () => {
    const rogers = world().players.find((p) => p.playerId === 40)
    expect(rogers?.purchasePriceTenths).toBeNull()
    expect(rogers?.sellingPriceTenths).toBeNull()
  })

  it('F3-AC-24: every player carries three gameweeks of projections, zero where his club blanks', () => {
    // Tzolis's club blanks GW5: the count wins, whatever the feed carries.
    expect(world().players.find((p) => p.playerId === 557)?.projections).toEqual([5, 0, 5])
    expect(world().players.find((p) => p.playerId === 40)?.projections).toEqual([5, 5, 5])
  })

  it('ENGINE-AC-04: the latest run\'s calls reach the world with the engine\'s figures untouched', () => {
    expect(world().calls).toEqual([call])
  })

  it('F3-AC-01: this gameweek\'s decisions are keyed by call; a pending call has no entry', () => {
    expect(world().decisions).toEqual({ [call.key]: 'selected' })
  })

  it('F3-AC-23: a player named from outside the squad is carried as a candidate, with his figures', () => {
    const [gross] = world().candidates
    expect(gross?.playerId).toBe(124)
    expect(gross?.surname).toBe('Groß')
    expect(gross?.isStarter).toBe(false)
    expect(gross?.nowCostTenths).toBe(56)
  })

  it('F6-AC-14: the last-run time is carried through as given — the loader reads it from succeeded runs only', () => {
    expect(world().lastRunAt).toBe('2026-09-11T15:00:00Z')
  })
})
