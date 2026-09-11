/**
 * F3-AC-18 — neither flag is ever derived from conviction, and neither changes
 * the figure.
 *
 * *Forced* is a property of the call: the incumbent cannot play. It comes from
 * the availability gate or the fixture table, never from how strong the call
 * is. So a forced call can read at the bottom of the scale and an unforced one
 * at the top, and the flag says nothing about either figure.
 */

import { describe, expect, it } from 'vitest'
import { evaluateCall } from '../../packages/engine/src/index.js'

const fit = { eligible: true } as const
const injured = { eligible: false, reason: 'injured' } as const

describe('F3-AC-18 · flags are properties of the call, never of its strength', () => {
  it('F3-AC-18: a forced call can read 5 and an unforced one 95 — the flag follows the gate, not the figure', () => {
    const forced = evaluateCall({
      identity: { type: 'substitution', variant: 'forced', outPlayerId: 1, inPlayerId: 2 },
      incumbent: { playerId: 1, projections: [4], availability: injured },
      challenger: { playerId: 2, projections: [1], availability: fit },
    })
    const unforced = evaluateCall({
      identity: { type: 'substitution', variant: 'upgrade', outPlayerId: 3, inPlayerId: 4 },
      incumbent: { playerId: 3, projections: [0.5], availability: fit },
      challenger: { playerId: 4, projections: [12], availability: fit },
    })

    expect(forced.reading === 'call' && [forced.isForced, forced.conviction]).toEqual([true, 5])
    expect(unforced.reading === 'call' && [unforced.isForced, unforced.conviction]).toEqual([false, 95])
  })

  it('F3-AC-18: being forced does not move the figure — the same edge reads the same strength either way', () => {
    const base = {
      identity: { type: 'substitution' as const, variant: 'upgrade' as const, outPlayerId: 5, inPlayerId: 6 },
      challenger: { playerId: 6, projections: [5], availability: fit },
    }
    const free = evaluateCall({ ...base, incumbent: { playerId: 5, projections: [2], availability: fit } })
    const blank = evaluateCall({ ...base, incumbent: { playerId: 5, projections: [2], availability: fit }, incumbentUnplayable: true })

    expect(free.reading === 'call' && blank.reading === 'call' && [free.conviction, blank.conviction, blank.isForced]).toEqual([86, 86, true])
  })
})
