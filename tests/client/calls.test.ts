/**
 * The client's pure call helpers — what the card shows, derived rather than
 * computed in a component (ENGINE-AC-04).
 */

import { describe, expect, it } from 'vitest'
import type { WorldCall, WorldPlayer } from '../../apps/client/src/api'
import { decide, defer, initialDecisions, reopen, restore } from '../../apps/client/src/calls/decisions'
import { clearedLine, formatCost, nbal, recomputeTransfer, shortlistCount, undecided } from '../../apps/client/src/calls/view'

const player = (id: number, surname: string, projection: number, extra: Partial<WorldPlayer> = {}): WorldPlayer => ({
  playerId: id,
  surname,
  shirtNumber: null,
  clubId: id,
  clubShortName: 'XXX',
  position: 'MID',
  isStarter: true,
  benchOrder: null,
  isCaptain: false,
  isVice: false,
  status: 'a',
  chanceOfPlayingNextRound: null,
  nowCostTenths: 56,
  form: 3,
  selectedByPercent: 10,
  seasonPoints: 20,
  transfersIn: 100,
  transfersOut: 100,
  projectedPoints: projection,
  projections: [projection, projection, projection],
  fixtures: [{ opponentClubId: 99, opponentShortName: 'BUR', isHome: true, difficulty: 2 }],
  nextThree: [2, 2, 2],
  purchasePriceTenths: null,
  sellingPriceTenths: null,
  ...extra,
})

const call = (key: string, category: WorldCall['category'], costTenths = 0): WorldCall => ({
  key,
  category,
  shape: category === 'transfer' ? 'transfer' : 'upgrade_swap',
  outPlayerId: 1,
  inPlayerId: 2,
  net: 1,
  conviction: 67,
  band: 'lean',
  k: 2,
  pointsHit: 0,
  costTenths,
  isForced: false,
  watch: false,
  reasoning: 'x',
  reasoningSource: 'template',
  breakdown: { weights: [1], out: { playerId: 1, projections: [1], gate: { eligible: true }, total: 1 }, in: { playerId: 2, projections: [2], gate: { eligible: true }, total: 2 }, net: 1, pointsHit: 0, k: 0.5 },
  alternatives: null,
  position: 0,
})

describe('F3-AC-24 · swapping a candidate recomputes through the engine', () => {
  it('F3-AC-24: net, conviction, band, cost and the line all move with the swap', () => {
    const tzolis = player(557, 'Tzolis', 2.4, { nowCostTenths: 64, sellingPriceTenths: 65 })
    const gross = player(124, 'Groß', 6.0, { nowCostTenths: 56 })
    const figures = recomputeTransfer(call('transfer:out=557:in=999', 'transfer'), tzolis, gross)

    // 3.6 a week over 1.0 / 0.6 / 0.35 is 7.02; 100 × 7.02 ÷ 9.02 is 77.8 → 78, lean.
    expect(figures).toMatchObject({ reading: 'call', net: 7.02, conviction: 78, band: 'lean', costTenths: -9 })
    expect(figures?.reasoning).toMatch(/^Groß over Tzolis/)
  })

  it('F3-AC-24: a swap that is no better reads as no change, never as a weak call', () => {
    const out = player(1, 'Better', 6.0, { sellingPriceTenths: 60 })
    const worse = player(2, 'Worse', 2.0)
    expect(recomputeTransfer(call('transfer:out=1:in=2', 'transfer'), out, worse)?.reading).toBe('no_change')
  })

  it('F3-AC-25: an outgoing player with no recoverable selling price cannot be scored', () => {
    expect(recomputeTransfer(call('t', 'transfer'), player(1, 'A', 2), player(2, 'B', 6))).toBeNull()
  })
})

describe('F3-AC-27, F3-AC-28 · money', () => {
  it('F3-AC-27: NBal is the Balance minus the cost of selected calls, and goes negative rather than being blocked', () => {
    const inScope = [{ key: 'a', costTenths: 6 }, { key: 'b', costTenths: 9 }, { key: 'c', costTenths: 30 }]
    expect(nbal(10, inScope, { a: 'selected' })).toBe(4)
    expect(nbal(10, inScope, { a: 'selected', b: 'rejected' })).toBe(4)
    expect(nbal(10, inScope, { a: 'selected', c: 'selected' })).toBe(-26)
  })

  it('F3-AC-28: a call that moves no money reads £0.00', () => {
    expect(formatCost(0)).toBe('£0.00')
    expect(formatCost(6)).toBe('−£0.6m')
    expect(formatCost(-9)).toBe('+£0.9m')
  })

  it('F3-AC-29: the shortlist counts selected calls only', () => {
    expect(shortlistCount({ a: 'selected', b: 'rejected', c: 'selected' })).toBe(2)
  })
})

describe('F3-AC-01, F3-AC-02, F3-AC-13, F3-AC-14, F3-AC-15 · decisions', () => {
  it('F3-AC-02: deciding one call leaves the other pending', () => {
    const state = decide(initialDecisions({}), 'a', 'selected')
    expect(state.decisions).toEqual({ a: 'selected' })
    expect(undecided([call('a', 'transfer'), call('b', 'transfer')], state.decisions).map((c) => c.key)).toEqual(['b'])
  })

  it('F3-AC-01: deferring leaves a call pending — no third stored state', () => {
    const state = defer(decide(initialDecisions({}), 'a', 'rejected'), 'a')
    expect(state.decisions).toEqual({})
  })

  it('F3-AC-14: reopening returns a call to pending and remembers its decision; tapping again restores it', () => {
    const decided = initialDecisions({ a: 'rejected' })
    const reopened = reopen(decided, 'a')
    expect(reopened.decisions).toEqual({})
    expect(reopened.reopened).toEqual({ a: 'rejected' })

    const restored = restore(reopened, 'a')
    expect(restored.decisions).toEqual({ a: 'rejected' })
    expect(restored.reopened).toEqual({})
  })

  it('F3-AC-15: the line beneath Category cleared reports the live state', () => {
    expect(clearedLine(0)).toBe('tap a decision to change it')
    expect(clearedLine(1)).toBe('1 call reopened · tap again to put it back')
    expect(clearedLine(2)).toBe('2 calls reopened · tap again to put them back')
  })
})
