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

describe('F6-AC-03, F6-AC-05 · suppression, and the one thing that ignores it', () => {
  it('F6-AC-03: a rejected call is suppressed for the gameweek while its premise holds', () => {
    const { keys, returning } = suppressed([call()], { 'transfer:out=7:in=124': 'rejected' }, new Set())

    expect([...keys]).toEqual(['transfer:out=7:in=124'])
    expect([...returning]).toEqual([])
  })

  it('F6-AC-03: it returns when the premise moves, and returns labelled rather than slipped back in', () => {
    const { keys, returning } = suppressed([call()], { 'transfer:out=7:in=124': 'rejected' }, new Set([124]))

    expect([...keys]).toEqual([])
    expect([...returning]).toEqual(['transfer:out=7:in=124'])
  })

  it('F6-AC-03: a change to some other player does not bring it back', () => {
    const { keys } = suppressed([call()], { 'transfer:out=7:in=124': 'rejected' }, new Set([999]))
    expect([...keys]).toEqual(['transfer:out=7:in=124'])
  })

  it('F6-AC-04: a pending call was never suppressed, so there is nothing to lift', () => {
    const { keys, returning } = suppressed([call()], {}, new Set([124]))
    expect(keys.size + returning.size).toBe(0)
  })
})
