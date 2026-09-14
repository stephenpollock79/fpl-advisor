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
  it('F6-AC-03: a rejected call whose figures have not moved stays out', () => {
    const { keys, returning } = suppressed([call()], { 'transfer:out=7:in=124': 'rejected' }, new Set())

    expect([...keys]).toEqual(['transfer:out=7:in=124'])
    expect([...returning]).toEqual([])
  })

  it('F6-AC-03, F6-AC-06: it returns when its own band moves, and returns labelled rather than slipped back in', () => {
    // **Its own band, not a player's record.** Two earlier versions of this rule
    // asked whether the FPL-record diff had touched one of the call's players —
    // and that diff never sees the projections, which is most of a call's
    // premise. It answered "nothing moved" hardest in the weeks the numbers had
    // moved most.
    const { keys, returning } = suppressed(
      [call()],
      { 'transfer:out=7:in=124': 'rejected' },
      new Set(['transfer:out=7:in=124']),
    )

    expect([...keys]).toEqual([])
    expect([...returning]).toEqual(['transfer:out=7:in=124'])
  })

  it('F6-AC-03: another call moving does not bring this one back', () => {
    const { keys } = suppressed([call()], { 'transfer:out=7:in=124': 'rejected' }, new Set(['transfer:out=9:in=200']))
    expect([...keys]).toEqual(['transfer:out=7:in=124'])
  })

  it('F6-AC-01: a selected call is a lock rather than a suppression, so neither set holds it', () => {
    const { keys, returning } = suppressed([call()], { 'transfer:out=7:in=124': 'selected' }, new Set())
    expect(keys.size + returning.size).toBe(0)
  })

  it('F6-AC-04: a pending call was never suppressed, so there is nothing to lift', () => {
    const { keys, returning } = suppressed([call()], {}, new Set(['transfer:out=7:in=124']))
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
