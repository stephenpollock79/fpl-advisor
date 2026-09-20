/**
 * Before and After, for whichever filter chip is active (F8-AC-09 – F8-AC-11,
 * F8-AC-20 – F8-AC-26, F3-UP-01 – F3-UP-03).
 *
 * **The counter-intuitive rule lives here** (`F8-AC-25`). Under All, Forced Only
 * and Forced and Recommended, After means *if you took the advice* — including
 * the calls the manager has already rejected. Those three are read-only views of
 * the advice as given, so a rejected call still belongs to its band and the
 * original recommendation stays inspectable. **Selected is the only filter that
 * reads decisions at all** (`F8-AC-24`), and it is the one that answers *what
 * have I actually chosen*.
 *
 * Nothing here recomputes a conviction, a band or a net. Every figure a call
 * carries came from the engine through the run, and this module only decides
 * which calls are in the picture and what the squad looks like if they happen
 * (ENGINE-AC-04).
 */

import type { DecisionState, World, WorldCall, WorldPlayer } from '../api'

export type Filter = 'all' | 'forced' | 'recommended' | 'selected'

/** `F8-AC-22`'s own definition: the *strong* and *certain* bands, which start here. */
const RECOMMENDED_AT_OR_ABOVE = 80

/** FPL's cost for every transfer past the free allowance. */
const HIT_POINTS = 4

/** What a legal starting eleven may hold. The fifteen is 2/5/5/3 by construction. */
const XI_LIMITS = {
  GKP: { min: 1, max: 1 },
  DEF: { min: 3, max: 5 },
  MID: { min: 2, max: 5 },
  FWD: { min: 1, max: 3 },
} as const

const MAX_PER_CLUB = 3

export type Breach = { kind: 'bank' | 'transfers' | 'squad'; message: string }

export type Scenario = {
  filter: Filter
  /** The calls in the picture — what the cards under this chip show. */
  calls: WorldCall[]
  before: WorldPlayer[]
  after: WorldPlayer[]
  /** Starters' projected points, less any hit. Net of the deduction (F8-AC-10). */
  projected: number
  /**
   * **What taking this scenario is worth**: the After eleven against the Before
   * one, net of the hit. The absolute total answers *what is this eleven worth*;
   * this answers *is the plan an improvement*, which is the question the
   * Before/After widget is asking (ruled 2026-09-15).
   */
  delta: number
  /** Bank less the cost of the calls in scope — not the status bar's figure unless this is Selected. */
  nbalTenths: number
  transfersUsed: number
  transfersAllowed: number
  /** The deduction this scenario carries, in points. Zero inside the allowance. */
  hit: number
  /** Everything wrong with this plan, stated rather than blocked (F3-UP-01 – F3-UP-03). */
  breaches: Breach[]
}

/**
 * **Which calls a chip shows.** Only `selected` consults decisions; the three
 * band views are the advice as given, rejections included (`F8-AC-24`,
 * `F8-AC-25`).
 */
export function callsUnder(
  filter: Filter,
  live: readonly WorldCall[],
  decisions: Record<string, DecisionState>,
): WorldCall[] {
  switch (filter) {
    case 'forced':
      return live.filter((c) => c.isForced)
    case 'recommended':
      return live.filter((c) => c.isForced || (c.conviction ?? 0) >= RECOMMENDED_AT_OR_ABOVE)
    case 'selected':
      return live.filter((c) => decisions[c.key] === 'selected')
    case 'all':
      return [...live]
  }
}

/** The squad as it would be if every call in `calls` happened. */
function applyTo(before: readonly WorldPlayer[], calls: readonly WorldCall[], world: World): WorldPlayer[] {
  const candidates = new Map([...world.players, ...world.candidates].map((p) => [p.playerId, p]))
  let squad = before.map((p) => ({ ...p }))

  for (const call of calls) {
    const out = squad.find((p) => p.playerId === call.outPlayerId)

    if (call.category === 'transfer') {
      const incoming = candidates.get(call.inPlayerId)
      // A call naming a player the latest read no longer carries cannot be
      // placed. Reporting it as unexecutable is slice 7's rule; here it simply
      // does not move the squad.
      if (!out || !incoming) continue
      squad = squad.map((p) =>
        p.playerId === out.playerId
          ? { ...incoming, isStarter: out.isStarter, benchOrder: out.benchOrder, isCaptain: out.isCaptain, isVice: out.isVice }
          : p,
      )
      continue
    }

    if (call.category === 'captaincy') {
      /**
       * **One call moves both armbands** (STE-151, STE-147).
       *
       * It used to be two, and this read the shape to know which one it was
       * holding. With one call the shape says *armband* and the ranking carries
       * both picks — so taking only the incoming player set the captain and left
       * the vice wherever it already was, even in the weeks the recommendation
       * moved it. The AFTER pitch then showed a vice the advice had replaced.
       */
      const ranking = call.breakdown.armband
      if (ranking) {
        squad = squad.map((p) => ({
          ...p,
          isCaptain: p.playerId === ranking.captainId,
          isVice: p.playerId === ranking.viceId,
        }))
        continue
      }
      // Calls written before 2026-09-20, when each shape moved one armband.
      const armband = call.shape === 'vice' ? 'isVice' : 'isCaptain'
      squad = squad.map((p) => ({ ...p, [armband]: p.playerId === call.inPlayerId }))
      continue
    }

    const into = squad.find((p) => p.playerId === call.inPlayerId)
    if (!out || !into) continue

    if (call.shape === 'bench_order') {
      // Neither player starts; only the order they are called on in changes.
      const order = out.benchOrder
      squad = squad.map((p) =>
        p.playerId === out.playerId
          ? { ...p, benchOrder: into.benchOrder }
          : p.playerId === into.playerId
            ? { ...p, benchOrder: order }
            : p,
      )
      continue
    }

    squad = squad.map((p) =>
      p.playerId === out.playerId
        ? { ...p, isStarter: false, benchOrder: into.benchOrder }
        : p.playerId === into.playerId
          ? { ...p, isStarter: true, benchOrder: null }
          : p,
    )
  }

  return squad
}

function breachesOf(after: readonly WorldPlayer[], nbalTenths: number, used: number, allowed: number): Breach[] {
  const breaches: Breach[] = []

  if (nbalTenths < 0) {
    breaches.push({
      kind: 'bank',
      message: `spends £${(Math.abs(nbalTenths) / 10).toFixed(1)}m more than you have. Drop one, or fund it with a downgrade elsewhere`,
    })
  }

  if (used > allowed) {
    breaches.push({
      kind: 'transfers',
      message: `FT ${String(used)}/${String(allowed)} · −${String((used - allowed) * HIT_POINTS)} pts`,
    })
  }

  // **From the actual fifteen** (F3-UP-03), never from the calls — a plan can
  // reach four of a club through two calls that are each legal on their own.
  const perClub = new Map<string, number>()
  for (const p of after) perClub.set(p.clubShortName, (perClub.get(p.clubShortName) ?? 0) + 1)
  for (const [club, count] of [...perClub].sort()) {
    if (count > MAX_PER_CLUB) {
      breaches.push({ kind: 'squad', message: `${club} ${String(count)}/3 · FPL allows three from one club` })
    }
  }

  const starters = after.filter((p) => p.isStarter)
  for (const [position, limit] of Object.entries(XI_LIMITS)) {
    const count = starters.filter((p) => p.position === position).length
    if (count < limit.min || count > limit.max) {
      breaches.push({
        kind: 'squad',
        message: `${String(count)} ${position} in the eleven · FPL allows ${String(limit.min)} to ${String(limit.max)}`,
      })
    }
  }

  return breaches
}

export function scenarioFor(
  world: World,
  live: readonly WorldCall[],
  filter: Filter,
  decisions: Record<string, DecisionState>,
): Scenario {
  const calls = callsUnder(filter, live, decisions)
  const before = world.players.map((p) => ({ ...p }))
  const after = applyTo(before, calls, world)

  const transfersUsed = calls.filter((c) => c.category === 'transfer').length
  const transfersAllowed = world.snapshot.freeTransfers
  const hit = Math.max(0, transfersUsed - transfersAllowed) * HIT_POINTS

  // **A plain sum of the starters, as the Squad screen's total is.** No captain
  // doubling: nothing else in the app doubles it, and introducing it here would
  // put two different answers to "what is this eleven worth" on two screens.
  const startersTotal = (squad: readonly WorldPlayer[]): number =>
    squad.filter((p) => p.isStarter).reduce((sum, p) => sum + p.projectedPoints, 0)

  const projected = startersTotal(after) - hit
  const delta = projected - startersTotal(before)

  const nbalTenths = calls.reduce((left, c) => left - c.costTenths, world.snapshot.bankTenths)

  return {
    filter,
    calls,
    before,
    after,
    projected,
    delta,
    nbalTenths,
    transfersUsed,
    transfersAllowed,
    hit,
    breaches: breachesOf(after, nbalTenths, transfersUsed, transfersAllowed),
  }
}
