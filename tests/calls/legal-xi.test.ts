/**
 * A substitution is a legal-XI search, not a pairwise comparison (STE-62,
 * handed forward by the GW4 pencil check).
 *
 * On the real squad in GW4, Rogers projects 7.0 on the bench while Shaw starts
 * on 1.7 — and *Shaw out, Rogers in* is illegal, because it leaves two defenders
 * and FPL requires three. The legal answer is a pair: Tzolis → Rogers and
 * Shaw → Van Hecke, keeping the shape at 3-4-3.
 *
 * The squad below is invented around those four players, with their GW4 figures
 * from the pencil check (+4.60 and +3.00).
 */

import { describe, expect, it } from 'vitest'
import { type SquadMember, substitutions } from '../../apps/server/src/calls/legal-xi.js'

const fit = { eligible: true } as const

let nextId = 1
const member = (
  name: string,
  position: SquadMember['position'],
  projection: number,
  role: 'starter' | 0 | 1 | 2 | 3,
  extra: Partial<SquadMember> = {},
): SquadMember & { name: string } => ({
  name,
  playerId: nextId++,
  position,
  projection,
  isStarter: role === 'starter',
  benchOrder: role === 'starter' ? null : role,
  availability: fit,
  flagged: false,
  hasFixture: true,
  ...extra,
})

const gw4 = () => {
  nextId = 1
  return [
    member('Keeper', 'GKP', 3.5, 'starter'),
    member('Shaw', 'DEF', 1.7, 'starter', { flagged: true }),
    member('DefA', 'DEF', 4.0, 'starter'),
    member('DefB', 'DEF', 3.9, 'starter'),
    member('Tzolis', 'MID', 2.4, 'starter'),
    member('MidA', 'MID', 5.5, 'starter'),
    member('MidB', 'MID', 5.0, 'starter'),
    member('Semenyo', 'MID', 6.2, 'starter'),
    member('FwdA', 'FWD', 6.0, 'starter'),
    member('FwdB', 'FWD', 5.0, 'starter'),
    member('Haaland', 'FWD', 8.0, 'starter'),
    member('SubKeeper', 'GKP', 2.0, 0),
    member('Rogers', 'MID', 7.0, 1),
    member('VanHecke', 'DEF', 4.7, 2),
    member('SubDef', 'DEF', 1.0, 3),
  ]
}

const named = (squad: ReturnType<typeof gw4>) => (id: number) =>
  squad.find((m) => m.playerId === id)?.name

describe('F3-AC-03 · substitutions are a legal-XI search', () => {
  it('F3-AC-03: Shaw out for Rogers is never produced; Tzolis→Rogers and Shaw→Van Hecke are', () => {
    const squad = gw4()
    const name = named(squad)
    const pairs = substitutions(squad).map((s) => `${name(s.outPlayerId)}→${name(s.inPlayerId)}`)

    expect(pairs).not.toContain('Shaw→Rogers')
    expect(pairs.sort()).toEqual(['Shaw→VanHecke', 'Tzolis→Rogers'])
  })

  it('F3-AC-03: every pair is legal on its own, because the manager may accept only one', () => {
    // FPL's shape: one keeper, three to five defenders, two to five midfielders,
    // one to three forwards. Checked by counting, not by comparing positions — a
    // defender out for a midfielder is legal whenever four defenders start.
    const shapeIsLegal = (eleven: SquadMember[]) => {
      const count = (p: SquadMember['position']) => eleven.filter((m) => m.position === p).length
      return (
        eleven.length === 11 &&
        count('GKP') === 1 &&
        count('DEF') >= 3 && count('DEF') <= 5 &&
        count('MID') >= 2 && count('MID') <= 5 &&
        count('FWD') >= 1 && count('FWD') <= 3
      )
    }

    const blankForward = gw4().map((m) => (m.name === 'FwdB' ? { ...m, hasFixture: false, projection: 0 } : m))
    for (const squad of [gw4(), blankForward]) {
      for (const swap of substitutions(squad)) {
        const eleven = squad
          .filter((m) => m.isStarter && m.playerId !== swap.outPlayerId)
          .concat(squad.filter((m) => m.playerId === swap.inPlayerId))
        expect(shapeIsLegal(eleven)).toBe(true)
      }
    }
  })

  it('F3-AC-03: a flagged starter is a doubt swap, a fit one an upgrade', () => {
    const squad = gw4()
    const name = named(squad)
    const variants = Object.fromEntries(substitutions(squad).map((s) => [name(s.outPlayerId), s.variant]))

    // Shaw is FPL's 75% doubt in GW4; Tzolis is fit and unflagged (STE-116).
    expect(variants).toEqual({ Shaw: 'doubt', Tzolis: 'upgrade' })
  })

  it('F3-AC-03: a starter the gate excludes is a forced swap', () => {
    const squad = gw4().map((m) =>
      m.name === 'DefA' ? { ...m, availability: { eligible: false, reason: 'injured' } as const } : m,
    )
    const name = named(squad)
    const forced = substitutions(squad).filter((s) => s.variant === 'forced').map((s) => name(s.outPlayerId))
    expect(forced).toEqual(['DefA'])
  })

  it('F3-AC-03: a starter with no fixture is unplayable, so his swap is forced', () => {
    const squad = gw4().map((m) => (m.name === 'FwdB' ? { ...m, hasFixture: false, projection: 0 } : m))
    const name = named(squad)
    const forced = substitutions(squad).filter((s) => s.variant === 'forced').map((s) => name(s.outPlayerId))
    // No forward on the bench, and a forward out for a midfielder leaves two
    // forwards, which is legal — so the blank forward can still come out.
    expect(forced).toContain('FwdB')
  })

  it('F3-UP-07: a bench the gate has emptied produces no substitution rather than an unplayable one', () => {
    const out = { eligible: false, reason: 'injured' } as const
    const squad = gw4().map((m) => (m.isStarter ? m : { ...m, availability: out }))
    expect(substitutions(squad)).toEqual([])
  })

  it('F3-AC-03: an eleven that is already the best produces nothing', () => {
    const squad = gw4().map((m) => (m.isStarter ? m : { ...m, projection: 0.5 }))
    expect(substitutions(squad)).toEqual([])
  })
})
