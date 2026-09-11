/**
 * The substitution search never silently drops a swap the best eleven needs.
 *
 * Swaps are offered one at a time, each legal on its own, because the manager
 * may accept one and reject the other. The argument that this never loses a swap
 * — pair like-for-like first, and FPL's shape ranges leave every remaining swap
 * legal alone — is reasoning, not proof. So this tries it: two thousand random
 * squads in FPL's own shape, random legal elevens, random projections, random
 * injuries and blanks. If any swap is ever left unpaired, the argument was wrong
 * and the Sub tab is hiding something (slice 5 review, ruled 2026-09-11).
 *
 * Seeded, so a failure reproduces exactly.
 */

import { describe, expect, it } from 'vitest'
import { type SquadMember, substitutions } from '../../apps/server/src/calls/legal-xi.js'

/** A small seeded generator, so the same two thousand squads are tried every run. */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Every formation FPL allows: 3–5 defenders, 2–5 midfielders, 1–3 forwards, ten outfielders. */
const FORMATIONS: [number, number, number][] = []
for (let d = 3; d <= 5; d++) for (let m = 2; m <= 5; m++) for (let f = 1; f <= 3; f++) if (d + m + f === 10) FORMATIONS.push([d, m, f])

function randomSquad(random: () => number): SquadMember[] {
  // FPL's squad: two keepers, five defenders, five midfielders, three forwards.
  const pick = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)] as T
  const [defs, mids, fwds] = pick(FORMATIONS)
  const starters = { GKP: 1, DEF: defs, MID: mids, FWD: fwds }
  const counts = { GKP: 2, DEF: 5, MID: 5, FWD: 3 }

  let id = 1
  let bench = 1
  const squad: SquadMember[] = []
  for (const position of ['GKP', 'DEF', 'MID', 'FWD'] as const) {
    for (let i = 0; i < counts[position]; i++) {
      const isStarter = i < starters[position]
      const roll = random()
      squad.push({
        playerId: id++,
        position,
        projection: Math.round(random() * 100) / 10,
        isStarter,
        benchOrder: isStarter ? null : position === 'GKP' ? 0 : ((bench++) as 1 | 2 | 3),
        availability: roll < 0.08 ? { eligible: false, reason: 'injured' } : { eligible: true },
        flagged: roll >= 0.08 && roll < 0.16,
        hasFixture: random() > 0.05,
      })
    }
  }
  return squad
}

describe('F3-AC-03 · no swap the best eleven needs is ever dropped', () => {
  it('F3-AC-03: across 2,000 random legal squads, every needed swap is offered as one legal on its own', () => {
    const random = seeded(20260911)
    const dropped: string[] = []

    for (let trial = 0; trial < 2000; trial++) {
      const squad = randomSquad(random)
      substitutions(squad, (outs, ins) => dropped.push(`trial ${String(trial)}: out ${outs.join(',')} in ${ins.join(',')}`))
    }

    expect(dropped).toEqual([])
  })
})
