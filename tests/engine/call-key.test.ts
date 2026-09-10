/**
 * The deterministic key from architecture.md §5.
 *
 * A decision cannot belong to a call row, because the call row is thrown away
 * and rewritten by the next run. It belongs to the key, which is what makes a
 * call *the same call* across runs — so both consumers must produce the same
 * string from the same call, and the shapes must not drift.
 */
import { describe, expect, it } from 'vitest'

import { callKey } from '../../packages/engine/src/call-key.js'

describe('call identity · the five key shapes', () => {
  it('builds a transfer key from the two players', () => {
    expect(callKey({ type: 'transfer', outPlayerId: 401, inPlayerId: 517 })).toBe(
      'transfer:out=401:in=517',
    )
  })

  it('builds a substitution key that carries which of the three shapes it is', () => {
    expect(
      callKey({ type: 'substitution', variant: 'forced', outPlayerId: 12, inPlayerId: 88 }),
    ).toBe('substitution:forced:out=12:in=88')
    expect(
      callKey({ type: 'substitution', variant: 'doubt', outPlayerId: 12, inPlayerId: 88 }),
    ).toBe('substitution:doubt:out=12:in=88')
  })

  it('builds a bench-order key from the slots, not the players', () => {
    expect(callKey({ type: 'bench_order', slotA: 13, slotB: 14 })).toBe(
      'substitution:bench_order:slots=13,14',
    )
  })

  it('builds captain and vice keys separately, because they are separate assignments', () => {
    expect(callKey({ type: 'captain', fromPlayerId: 355, toPlayerId: 427 })).toBe(
      'captaincy:captain:from=355:to=427',
    )
    expect(callKey({ type: 'vice', fromPlayerId: 355, toPlayerId: 427 })).toBe(
      'captaincy:vice:from=355:to=427',
    )
  })
})

describe('call identity · the key is stable and order-independent where it should be', () => {
  it('produces the same string every time from the same call', () => {
    const identity = { type: 'transfer', outPlayerId: 401, inPlayerId: 517 } as const
    expect(callKey(identity)).toBe(callKey(identity))
  })

  it('orders bench slots so the same pair never produces two keys', () => {
    expect(callKey({ type: 'bench_order', slotA: 14, slotB: 13 })).toBe(
      callKey({ type: 'bench_order', slotA: 13, slotB: 14 }),
    )
  })

  it('keeps a transfer directional, because out and in are different roles', () => {
    expect(callKey({ type: 'transfer', outPlayerId: 517, inPlayerId: 401 })).not.toBe(
      callKey({ type: 'transfer', outPlayerId: 401, inPlayerId: 517 }),
    )
  })
})
