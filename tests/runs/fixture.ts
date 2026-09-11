/**
 * A GW4-shaped week for the run route's tests: the real squad's four named
 * players with their pencil-check figures, around an invented supporting cast.
 * Not a test file — imported by them.
 */

import type { PlanPlayer, SquadEntry } from '../../apps/server/src/calls/plan.js'
import type { CardInfo } from '../../apps/server/src/runs/generate.js'

const fit = { eligible: true } as const

export function gw4Week() {
  let nextId = 1
  type Named = PlanPlayer & { name: string }
  const player = (name: string, position: PlanPlayer['position'], clubId: number, x: number, cost = 50, extra: Partial<PlanPlayer> = {}): Named => ({
    name,
    playerId: nextId++,
    position,
    clubId,
    projections: [x, x, x],
    availability: fit,
    flagged: false,
    hasFixture: true,
    nowCostTenths: cost,
    ...extra,
  })
  const inSquad = (p: Named, role: 'starter' | 0 | 1 | 2 | 3): SquadEntry & { name: string } => ({
    ...p,
    isStarter: role === 'starter',
    benchOrder: role === 'starter' ? null : role,
    sellingPriceTenths: p.nowCostTenths,
  })

  const squad = [
    inSquad(player('Keeper', 'GKP', 1, 3.5), 'starter'),
    inSquad(player('Shaw', 'DEF', 2, 1.7, 44, { flagged: true }), 'starter'),
    inSquad(player('DefA', 'DEF', 3, 4.0), 'starter'),
    inSquad(player('DefB', 'DEF', 4, 3.9), 'starter'),
    inSquad(player('Tzolis', 'MID', 5, 2.4, 64), 'starter'),
    inSquad(player('MidA', 'MID', 6, 5.5), 'starter'),
    inSquad(player('MidB', 'MID', 7, 5.0), 'starter'),
    inSquad(player('Semenyo', 'MID', 8, 6.2, 84), 'starter'),
    inSquad(player('FwdA', 'FWD', 9, 6.0), 'starter'),
    inSquad(player('FwdB', 'FWD', 10, 5.0), 'starter'),
    inSquad(player('Haaland', 'FWD', 11, 8.0, 155), 'starter'),
    inSquad(player('SubKeeper', 'GKP', 12, 2.0, 40), 0),
    inSquad(player('Rogers', 'MID', 13, 7.0, 76), 1),
    inSquad(player('VanHecke', 'DEF', 14, 4.7, 49), 2),
    inSquad(player('SubDef', 'DEF', 15, 1.0, 40), 3),
  ]
  const pool = [player('Gross', 'MID', 16, 6.0, 56), player('Winger', 'MID', 17, 5.8, 55)]

  const cards = new Map<number, CardInfo>(
    [...squad, ...pool].map((p) => [
      p.playerId,
      {
        name: p.name,
        club: `C${String(p.clubId)}`,
        status: p.flagged ? 'd' : 'a',
        availability: p.availability,
        chanceOfPlayingNextRound: p.flagged ? 75 : null,
        form: p.projections[0] ?? 0,
        projection: p.projections[0] ?? 0,
        fixtures: [{ opponent: 'XXX', isHome: true, difficulty: 3 }],
        priceTenths: p.nowCostTenths,
        selectedByPercent: 10,
        seasonPoints: 20,
        transfersIn: 1000,
        transfersOut: 1000,
      },
    ]),
  )

  return {
    gameweek: 4,
    snapshotId: 'snapshot-gw4',
    plan: { squad, pool, bankTenths: 10, freeTransfers: 1 },
    cards,
  }
}
