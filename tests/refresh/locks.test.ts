/**
 * His decisions are locks; everything unlocked is regenerated (F6, happy path).
 */

import { describe, expect, it } from 'vitest'
import { type LockableCall, committedPairs, suppressed } from '../../apps/server/src/refresh/locks.js'

const call = (extra: Partial<LockableCall> = {}): LockableCall => ({
  key: 'transfer:out=7:in=124',
  category: 'transfer',
  outPlayerId: 7,
  inPlayerId: 124,
  costTenths: 6,
  alternatives: { out: [6], in: [200] },
  ...extra,
})

const cost = () => 9

describe('F6-AC-01 · a selected call is a constraint, not a suggestion', () => {
  it('F6-AC-01: a selected call commits its pair and its cash to the next run', () => {
    const committed = committedPairs([call()], { 'transfer:out=7:in=124': 'selected' }, cost)

    expect(committed).toEqual([{ key: 'transfer:out=7:in=124', outPlayerId: 7, inPlayerId: 124, costTenths: 6, isTransfer: true }])
  })

  it('F6-AC-01, F3-AC-24: a swapped candidate commits the swapped pair, not the one first proposed', () => {
    // The decision was filed under a pair no stored call carries. Committing the
    // originally proposed pair would spend the manager's money on a transfer he
    // did not choose.
    const committed = committedPairs([call()], { 'transfer:out=6:in=200': 'selected' }, cost)

    expect(committed).toEqual([{ key: 'transfer:out=6:in=200', outPlayerId: 6, inPlayerId: 200, costTenths: 9, isTransfer: true }])
  })

  it('F6-AC-04: a pending call commits nothing, and is free to be rewritten', () => {
    expect(committedPairs([call()], {}, cost)).toEqual([])
  })

  it('F6-AC-01: a rejected call commits nothing either', () => {
    expect(committedPairs([call()], { 'transfer:out=7:in=124': 'rejected' }, cost)).toEqual([])
  })

  it('a captaincy call commits its pair and no money (F4-AC-09)', () => {
    const armband = call({ key: 'captaincy:captain:from=8:to=411', category: 'captaincy', outPlayerId: 8, inPlayerId: 411, costTenths: 0, alternatives: null })
    const committed = committedPairs([armband], { 'captaincy:captain:from=8:to=411': 'selected' }, cost)

    expect(committed[0]?.costTenths).toBe(0)
    expect(committed[0]?.isTransfer).toBe(false)
  })
})

describe('F6-AC-03, F6-AC-05 · what a rejection does to the next refresh', () => {
  it('STE-128: a rejected call comes back at the next refresh, and comes back labelled', () => {
    // **The defect this replaced.** A rejection used to hold until the evidence
    // diff touched one of the call's players — and that diff reads FPL's player
    // records, never the projections, for which no previous value is stored. So
    // it held hardest in the weeks the numbers had moved most. A +0.8
    // substitution sat behind "you have the strongest side" for a day.
    const { keys, returning } = suppressed([call()], { 'transfer:out=7:in=124': 'rejected' }, new Set())

    expect([...keys]).toEqual([])
    expect([...returning]).toEqual(['transfer:out=7:in=124'])
  })

  it('STE-128: it comes back whether or not the FPL record moved — that diff cannot see the premise', () => {
    const moved = suppressed([call()], { 'transfer:out=7:in=124': 'rejected' }, new Set([124]))
    const still = suppressed([call()], { 'transfer:out=7:in=124': 'rejected' }, new Set([999]))

    expect([...moved.returning]).toEqual(['transfer:out=7:in=124'])
    expect([...still.returning]).toEqual(['transfer:out=7:in=124'])
    expect(moved.keys.size + still.keys.size).toBe(0)
  })

  it('F6-AC-01: a selected call is the only lock, so nothing about it returns', () => {
    const { keys, returning } = suppressed([call()], { 'transfer:out=7:in=124': 'selected' }, new Set())
    expect(keys.size + returning.size).toBe(0)
  })

  it('F6-AC-04: a pending call was never suppressed, so there is nothing to lift', () => {
    const { keys, returning } = suppressed([call()], {}, new Set([124]))
    expect(keys.size + returning.size).toBe(0)
  })
})

describe('F6-AC-01, F3-AC-25 · a swapped transfer costs what it costs', () => {
  it('F6-AC-01: the swapped pair commits the price actually paid, not nothing', () => {
    // It used to commit zero. The next run then believed the bank untouched and
    // could recommend a second transfer the manager could not afford, removing
    // the one hard constraint money has in this build.
    const cost = (outId: number, inId: number) => (outId === 6 && inId === 200 ? 9 : 0)
    const committed = committedPairs([call()], { 'transfer:out=6:in=200': 'selected' }, cost)

    expect(committed[0]?.costTenths).toBe(9)
  })
})
