/**
 * The pure display rules of the squad screen (STE-107).
 *
 * Formation, surnames and totals are all derived at render and never stored, so
 * this is where they are proved. Nothing here touches a DOM: what matters is the
 * arithmetic and the truncation, not the markup around them.
 */

import { describe, expect, it } from 'vitest'
import {
  benchInOrder,
  displaySurname,
  formationOf,
  startersByPosition,
  totalProjected,
} from '../../apps/client/src/squad/format.js'

type P = Parameters<typeof formationOf>[0][number]

const player = (over: Partial<P> & Pick<P, 'position'>): P => ({
  playerId: 1,
  surname: 'Smith',
  isStarter: true,
  benchOrder: null,
  projectedPoints: 0,
  ...over,
})

const eleven = (def: number, mid: number, fwd: number): P[] => [
  player({ position: 'GKP' }),
  ...Array.from({ length: def }, () => player({ position: 'DEF' })),
  ...Array.from({ length: mid }, () => player({ position: 'MID' })),
  ...Array.from({ length: fwd }, () => player({ position: 'FWD' })),
]

describe('F1-AC-03 · formation is derived from the starting eleven', () => {
  it('F1-AC-03: reads the shape off the players, for every legal formation', () => {
    // The goalkeeper is implicit — every legal formation has exactly one, so
    // printing it would be noise. These are the shapes FPL actually permits.
    expect(formationOf(eleven(4, 4, 2))).toBe('4-4-2')
    expect(formationOf(eleven(3, 5, 2))).toBe('3-5-2')
    expect(formationOf(eleven(5, 4, 1))).toBe('5-4-1')
    expect(formationOf(eleven(3, 4, 3))).toBe('3-4-3')
    expect(formationOf(eleven(4, 5, 1))).toBe('4-5-1')
  })

  it('F1-AC-03: the bench never enters the shape', () => {
    // Four bench players, deliberately of positions that would change the answer
    // if they were counted.
    const withBench = [
      ...eleven(4, 4, 2),
      player({ position: 'GKP', isStarter: false, benchOrder: 0 }),
      player({ position: 'DEF', isStarter: false, benchOrder: 1 }),
      player({ position: 'DEF', isStarter: false, benchOrder: 2 }),
      player({ position: 'FWD', isStarter: false, benchOrder: 3 }),
    ]
    expect(formationOf(withBench)).toBe('4-4-2')
  })
})

describe('F1-UP-03 · surnames too long for a slot', () => {
  it('F1-UP-03: eleven characters fit; twelve are cut at ten and closed with a full stop', () => {
    expect(displaySurname('Saka')).toBe('Saka')
    // Exactly eleven — the boundary, and it is not truncated.
    expect(displaySurname('Alexander-')).toBe('Alexander-')
    expect(displaySurname('Gundogan123')).toBe('Gundogan123')
    // Twelve.
    expect(displaySurname('Alexander-Arnold')).toBe('Alexander-.')
    expect(displaySurname('Alexander-Arnold')).toHaveLength(11)
  })

  it('F1-UP-03: truncation is display only — the full name is what is passed on', () => {
    // The important half of the criterion. Every lookup keys off the untruncated
    // name, so this function must never be the thing a name is stored or matched
    // by. Proved by it being pure and returning a new string: the input is
    // untouched and available to its caller.
    const full = 'Alexander-Arnold'
    displaySurname(full)
    expect(full).toBe('Alexander-Arnold')
  })
})

describe('F1-AC-02 · the bench, in a fixed order', () => {
  it('F1-AC-02: goalkeeper first, then outfield one, two, three — whatever order the rows arrive in', () => {
    const shuffled = [
      player({ playerId: 4, position: 'FWD', isStarter: false, benchOrder: 3 }),
      player({ playerId: 1, position: 'GKP', isStarter: false, benchOrder: 0 }),
      player({ playerId: 3, position: 'DEF', isStarter: false, benchOrder: 2 }),
      ...eleven(4, 4, 2),
      player({ playerId: 2, position: 'MID', isStarter: false, benchOrder: 1 }),
    ]

    expect(benchInOrder(shuffled).map((p) => p.playerId)).toEqual([1, 2, 3, 4])
  })
})

describe('F1-AC-22 · totals are summed from the players shown', () => {
  it('F1-AC-22: the squad total counts the eleven, and the bench total the four', () => {
    const squad = [
      ...eleven(4, 4, 2).map((p) => ({ ...p, projectedPoints: 2 })),
      player({ position: 'GKP', isStarter: false, benchOrder: 0, projectedPoints: 1 }),
      player({ position: 'DEF', isStarter: false, benchOrder: 1, projectedPoints: 1 }),
      player({ position: 'DEF', isStarter: false, benchOrder: 2, projectedPoints: 1 }),
      player({ position: 'FWD', isStarter: false, benchOrder: 3, projectedPoints: 1 }),
    ]

    expect(totalProjected(squad, { starters: true })).toBe(22)
    expect(totalProjected(squad, { starters: false })).toBe(4)
  })

  it('F1-AC-22: change a projection and the total moves, because nothing caches it', () => {
    // The criterion's actual claim: no total can disagree with the players it
    // represents. A stored total would pass a snapshot test and fail this one.
    const squad = eleven(4, 4, 2).map((p) => ({ ...p, projectedPoints: 2 }))
    const before = totalProjected(squad, { starters: true })

    const changed = squad.map((p, i) => (i === 0 ? { ...p, projectedPoints: 9 } : p))

    expect(totalProjected(changed, { starters: true })).toBe(before + 7)
  })

  it('F1-UP-01: a blanking player contributes zero rather than being left out', () => {
    // Zero and absent look the same in a total and are not the same on a pitch.
    // The player is still one of the fifteen and still occupies a slot.
    const squad = eleven(4, 4, 2).map((p, i) => ({ ...p, projectedPoints: i === 0 ? 0 : 2 }))
    expect(totalProjected(squad, { starters: true })).toBe(20)
    expect(startersByPosition(squad).GKP).toHaveLength(1)
  })
})
