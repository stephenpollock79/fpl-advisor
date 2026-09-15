/**
 * The client's pure call helpers — what the card shows, derived rather than
 * computed in a component (ENGINE-AC-04).
 */

import { describe, expect, it } from 'vitest'
import type { WorldCall, WorldPlayer } from '../../apps/client/src/api'
import { decide, defer, initialDecisions, reopen, restore } from '../../apps/client/src/calls/decisions'
import {
  armbandNotes,
  clearVerdict,
  clearedLine,
  diffRows,
  formatCost,
  nbal,
  readingLine,
  recomputeTransfer,
  restoredSwaps,
  shortlistCount,
  storedFigures,
  undecided,
  viceHeldByCaptain,
  watchFreshness,
} from '../../apps/client/src/calls/view'

const player = (id: number, name: string, projection: number, extra: Partial<WorldPlayer> = {}): WorldPlayer => ({
  playerId: id,
  name,
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
  priceLikelihoodTonight: null,
  priceLockedUntil: null,
  ...extra,
})

const STRONGEST = 'Your eleven is already the strongest legal side, and the bench is in order.'

const SHAPE: Record<WorldCall['category'], WorldCall['shape']> = {
  transfer: 'transfer',
  substitution: 'upgrade_swap',
  captaincy: 'captain',
}

const call = (key: string, category: WorldCall['category'], costTenths = 0, extra: Partial<WorldCall> = {}): WorldCall => ({
  key,
  category,
  shape: SHAPE[category],
  outPlayerId: 1,
  inPlayerId: 2,
  net: 1,
  isReading: false,
  readingReason: null,
  conviction: 67,
  band: 'lean',
  k: 2,
  pointsHit: 0,
  costTenths,
  isForced: false,
  watch: false,
  watchReason: null,
  reasoning: 'x',
  reasoningSource: 'template',
  breakdown: { weights: [1], out: { playerId: 1, projections: [1], gate: { eligible: true }, total: 1 }, in: { playerId: 2, projections: [2], gate: { eligible: true }, total: 2 }, net: 1, pointsHit: 0, k: 0.5, kLabel: 'transfer', byCeiling: false },
  alternatives: null,
  position: 0,
  diffTag: null,
  previousConviction: null,
  ...extra,
})

describe('F3-AC-24 · swapping a candidate recomputes through the engine', () => {
  it('F3-AC-24: net, conviction, band, cost and the line all move with the swap', () => {
    const tzolis = player(557, 'Tzolis', 2.4, { nowCostTenths: 64, sellingPriceTenths: 65 })
    const gross = player(124, 'Groß', 6.0, { nowCostTenths: 56 })
    const figures = recomputeTransfer(call('transfer:out=557:in=999', 'transfer'), tzolis, gross, true)

    // 3.6 a week over 1.0 / 0.6 / 0.35 is 7.02; 100 × 7.02 ÷ 9.02 is 77.8 → 78, lean.
    expect(figures).toMatchObject({ reading: 'call', net: 7.02, conviction: 78, band: 'lean', costTenths: -9 })
    expect(figures?.reasoning).toMatch(/^Groß over Tzolis/)
  })

  it('F3-AC-24: a swap that is no better reads as no change, never as a weak call', () => {
    const out = player(1, 'Better', 6.0, { sellingPriceTenths: 60 })
    const worse = player(2, 'Worse', 2.0)
    expect(recomputeTransfer(call('transfer:out=1:in=2', 'transfer'), out, worse, true)?.reading).toBe('no_change')
  })

  it('F3-AC-17: a swapped-in candidate FPL expects to rise tonight sets WATCH on the recomputed card; a locked one does not', () => {
    const out = player(1, 'MidB', 5.0, { sellingPriceTenths: 50 })
    const rising = player(2, 'Konsa', 6.0, { priceLikelihoodTonight: 5 })
    const locked = player(3, 'Hall', 6.0, { priceLikelihoodTonight: 5, priceLockedUntil: '2999-01-01T00:00:00Z' })

    expect(recomputeTransfer(call('t', 'transfer'), out, rising, true)?.watchReason).toMatch(/^FPL expects Konsa's price to rise tonight/)
    expect(recomputeTransfer(call('t', 'transfer'), out, locked, true)?.watchReason).toBeNull()
  })

  it('F3-AC-17: a forecast from before FPL\'s last overnight update sets no WATCH on a swap', () => {
    const out = player(1, 'MidB', 5.0, { sellingPriceTenths: 50 })
    const rising = player(2, 'Konsa', 6.0, { priceLikelihoodTonight: 5 })
    expect(recomputeTransfer(call('t', 'transfer'), out, rising, false)?.watchReason).toBeNull()
  })

  it('F3-AC-25: an outgoing player with no recoverable selling price cannot be scored', () => {
    expect(recomputeTransfer(call('t', 'transfer'), player(1, 'A', 2), player(2, 'B', 6), true)).toBeNull()
  })
})

describe('F3-AC-17 · WATCH says "tonight" only while the forecast is tonight\'s', () => {
  // 11 Sep is summer time: FPL's 01:30 UK update is 00:30 UTC.
  const evening = Date.parse('2026-09-11T20:00:00Z')
  const nextDay = Date.parse('2026-09-12T09:00:00Z')
  const world = (priceForecastReadAt: string | null, lastRunAt: string | null) => ({ priceForecastReadAt, lastRunAt })

  it('F3-AC-17: a run read today keeps its stored flag and lets swaps set one', () => {
    expect(watchFreshness(world('2026-09-11T15:00:00Z', '2026-09-11T15:01:00Z'), evening)).toEqual({ stored: true, swapped: true })
  })

  it('F3-AC-17: after the overnight update, neither the stored flag nor a swap says "tonight"', () => {
    expect(watchFreshness(world('2026-09-11T15:00:00Z', '2026-09-11T15:01:00Z'), nextDay)).toEqual({ stored: false, swapped: false })
  })

  it('F3-AC-17: a fetch newer than the run leaves the stored flag unbacked, while swaps read the new one', () => {
    expect(watchFreshness(world('2026-09-12T08:00:00Z', '2026-09-11T15:01:00Z'), nextDay)).toEqual({ stored: false, swapped: true })
  })

  it('F3-AC-17: no fetch on record, no WATCH', () => {
    expect(watchFreshness(world(null, null), evening)).toEqual({ stored: false, swapped: false })
  })

  it('F3-AC-17: a stored flag is hidden when its forecast has gone stale', () => {
    const c = { ...call('t', 'transfer'), watch: true, watchReason: "FPL expects Konsa's price to rise tonight — buying today avoids paying £0.1m more." }
    const [out, into] = [player(1, 'MidB', 5.0), player(2, 'Konsa', 6.0)]
    expect(storedFigures(c, out, into, true).watchReason).toBe(c.watchReason)
    expect(storedFigures(c, out, into, false).watchReason).toBeNull()
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

  it('F3-AC-29: the shortlist counts selected calls on screen, and nothing else', () => {
    expect(shortlistCount(['a', 'b', 'c'], { a: 'selected', b: 'rejected', c: 'selected' })).toBe(2)
    // A decision with no card behind it is not a call on the shortlist.
    expect(shortlistCount(['a'], { a: 'selected', orphan: 'selected' })).toBe(1)
  })

  it('F3-AC-24: a decision on a swapped candidate brings its swap back after a reload', () => {
    const base = { ...call('transfer:out=7:in=124', 'transfer'), outPlayerId: 7, inPlayerId: 124, alternatives: { out: [6], in: [200] } }
    expect(restoredSwaps([base], { 'transfer:out=7:in=200': 'selected' })).toEqual({
      'transfer:out=7:in=124': { outId: 7, inId: 200 },
    })
    expect(restoredSwaps([base], {})).toEqual({})
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

  it('STE-131: an empty Sub tab names the player the Transfer tab has, rather than claiming the side is strongest', () => {
    // **The message that cost an evening.** Calafiori, projecting 2.1, was
    // starting; the swap was correctly withheld because a transfer already
    // claimed him; and the tab said the eleven was already the strongest legal
    // side. Correct behaviour, false sentence.
    const players = new Map([
      [1, player(1, 'Calafiori', 2.1)],
      [2, player(2, 'Diop', 2.9)],
    ])
    const line = clearVerdict('substitution', STRONGEST, [call('t', 'transfer')], players)

    expect(line).not.toBe(STRONGEST)
    expect(line).toContain('Calafiori')
    expect(line).toContain('Transfer tab')
  })

  it('STE-131: with nobody spoken for, the tab still says the side is the strongest — because now it is', () => {
    const players = new Map([[1, player(1, 'Calafiori', 2.1)]])

    expect(clearVerdict('substitution', STRONGEST, [], players)).toBe(STRONGEST)
    // A substitution claiming a player says nothing about the Sub tab's silence.
    expect(clearVerdict('substitution', STRONGEST, [call('s', 'substitution')], players)).toBe(STRONGEST)
  })

  it('STE-131: only substitutions can be silenced this way, so no other tab is rewritten', () => {
    const players = new Map([[1, player(1, 'Calafiori', 2.1)]])
    const withTransfer = [call('t', 'transfer')]

    expect(clearVerdict('transfer', 'Hold the free transfer.', withTransfer, players)).toBe('Hold the free transfer.')
    expect(clearVerdict('captaincy', 'Both armbands are right.', withTransfer, players)).toBe('Both armbands are right.')
  })

  it('F3-AC-15: the line beneath Category cleared reports the live state', () => {
    expect(clearedLine(0)).toBe('tap a decision to change it')
    expect(clearedLine(1)).toBe('1 call reopened · tap again to put it back')
    expect(clearedLine(2)).toBe('2 calls reopened · tap again to put them back')
  })
})

describe('F4-AC-02, F4-AC-05, F4-AC-12 · a keep reading, as the card holds it', () => {
  const armband = (extra: Partial<WorldCall> = {}) =>
    call('captaincy:captain:from=1:to=2', 'captaincy', 0, {
      isReading: true,
      readingReason: 'incumbent_wins',
      conviction: null,
      band: null,
      net: -1.8,
      reasoning: 'Haaland keeps it: 8.0 projected points this gameweek against Semenyo\u2019s 6.2.',
      breakdown: {
        weights: [1],
        out: { playerId: 1, projections: [8], gate: { eligible: true }, total: 8 },
        in: { playerId: 2, projections: [6.2], gate: { eligible: true }, total: 6.2 },
        net: -1.8,
        pointsHit: 0,
        k: 0.5,
        kLabel: 'captain/vice',
        byCeiling: false,
      },
      ...extra,
    })

  it('F4-AC-02: a stored keep reading reaches the card as a reading, carrying no figure at all', () => {
    const out = player(1, 'Haaland', 8)
    const into = player(2, 'Semenyo', 6.2)
    const figures = storedFigures(armband(), out, into, true)

    expect(figures.reading).toBe('no_change')
    expect(figures).not.toHaveProperty('conviction')
    expect(figures).not.toHaveProperty('band')
    if (figures.reading === 'no_change') expect(readingLine(figures.because)).toBe('Already the stronger option')
  })

  it('F4-AC-02: the two reasons a keep can have are told apart, never flattened into one', () => {
    const out = player(1, 'Haaland', 8)
    const into = player(2, 'Semenyo', 6.2)
    const close = storedFigures(armband({ readingReason: 'below_floor' }), out, into, true)

    if (close.reading === 'no_change') expect(readingLine(close.because)).toBe('Too close to call')
    expect(readingLine('captain_kept')).toBe('Held while the captain stays as he is')
  })

  it('F4-AC-05: the vice premise is on every vice card, and no captain card carries it', () => {
    const vice = armband({ shape: 'vice' })
    expect(armbandNotes(vice).join(' ')).toContain('only pays if the captain does not play')
    expect(armbandNotes(armband()).join(' ')).not.toContain('only pays')
  })

  it('F4-AC-12: the tie-break is said on the card only where it actually chose the challenger', () => {
    const plain = armband()
    expect(armbandNotes(plain)).toHaveLength(0)

    const tied = armband({
      breakdown: { ...plain.breakdown, byCeiling: true },
    })
    expect(armbandNotes(tied).join(' ')).toContain('bigger ceiling')
  })

  it('ENGINE-AC-05: neither written sentence reads the strength figure as a chance', () => {
    const banned = /\b(probab\w*|likel\w*|confiden\w*|odds|chance)\b/i
    const sentences = [...armbandNotes(armband({ shape: 'vice', breakdown: { ...armband().breakdown, byCeiling: true } })), readingLine('incumbent_wins'), readingLine('below_floor'), readingLine('captain_kept')]
    for (const line of sentences) expect(banned.test(line)).toBe(false)
  })
})

describe('F4-UP-02 · rejecting the captain change holds the vice', () => {
  it('F4-UP-02: the vice call becomes a keep reading rather than disappearing, and nothing is recomputed', () => {
    const out = player(1, 'Haaland', 8)
    const into = player(2, 'Semenyo', 6.2)
    const decidable = storedFigures(call('captaincy:vice:from=1:to=2', 'captaincy'), out, into, true)
    expect(decidable.reading).toBe('call')

    const held = viceHeldByCaptain(decidable, true)
    expect(held.reading).toBe('no_change')
    expect(held.net).toBe(decidable.net)
    expect(held.breakdown).toBe(decidable.breakdown)
    if (held.reading === 'no_change') expect(held.because).toBe('captain_kept')
  })

  it('F4-UP-02: while the captain change still stands, the vice call is an ordinary decidable call', () => {
    const out = player(1, 'Haaland', 8)
    const into = player(2, 'Semenyo', 6.2)
    const decidable = storedFigures(call('captaincy:vice:from=1:to=2', 'captaincy'), out, into, true)

    expect(viceHeldByCaptain(decidable, false)).toBe(decidable)
  })
})

describe('F6-AC-11, F6-AC-12 · what a refresh reports, and what it says nothing about', () => {
  const tagged = (key: string, extra: Partial<WorldCall>) => call(key, 'transfer', 0, extra)
  const name = (id: number) => (id === 1 ? 'Semenyo' : 'Haaland')

  it('F6-AC-11: a band move is reported in numbers — what it was, and what it is now', () => {
    const rows = diffRows([tagged('k1', { diffTag: 'band_move', previousConviction: 84, conviction: 71 })], name)
    expect(rows).toEqual([{ key: 'k1', title: 'Semenyo → Haaland', note: 'was 84, now 71' }])
  })

  it('F6-AC-11: a call that became a keep says so in words, not as a percentage of nothing', () => {
    const rows = diffRows(
      [tagged('k1', { diffTag: 'band_move', previousConviction: 84, conviction: null, isReading: true })],
      name,
    )
    expect(rows[0]?.note).toBe('was 84, now no change')
  })

  it('F6-AC-11: the other three tags each read as a reason rather than a code', () => {
    const rows = diffRows(
      [
        tagged('a', { diffTag: 'returned' }),
        tagged('b', { diffTag: 'resurfaced' }),
        tagged('c', { diffTag: 'new' }),
      ],
      name,
    )
    expect(rows.map((r) => r.note)).toEqual([
      'can no longer be made',
      'back, because what you rejected has changed',
      'new this run',
    ])
  })

  it('F6-AC-12: a call that did not move is absent, so an untouched week produces no sheet at all', () => {
    // A sheet that says "nothing happened" teaches dismissal without reading,
    // and the next one will matter.
    expect(diffRows([tagged('k1', { diffTag: null })], name)).toEqual([])
    expect(diffRows([], name)).toEqual([])
  })

  it('F6-AC-11: a band move with nothing to compare against is not claimed as one', () => {
    expect(diffRows([tagged('k1', { diffTag: 'band_move', previousConviction: null })], name)).toEqual([])
  })
})
