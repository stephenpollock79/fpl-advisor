/**
 * Substitutions, found as a legal eleven rather than compared pair by pair
 * (F3-AC-03).
 *
 * The GW4 pencil check is why. Rogers projected 7.0 on the bench while Shaw
 * started on 1.7, so a pairwise comparison proposes *Shaw out, Rogers in* — which
 * leaves two defenders, and FPL requires three. A call the manager cannot make is
 * worse than no call, because it looks exactly like one he can.
 *
 * So the best eleven is searched for whole, under FPL's shape rules, and the
 * difference from the current eleven is then split into swaps that are each legal
 * **on their own**, because the manager may accept one and reject the other.
 *
 * Projection alone decides the eleven — the same rule that orders the bench
 * (ENGINE-AC-06). No model opinion reaches this file, and nothing here scores a
 * swap: the engine does that, once, for every surface.
 *
 * Pure: squad in, proposals out.
 */

import type { AvailabilityVerdict, Position } from '@fpl/engine'

export type SquadMember = {
  playerId: number
  position: Position
  /** The feed's projection for this gameweek, already zero for a blank. */
  projection: number
  isStarter: boolean
  benchOrder: 0 | 1 | 2 | 3 | null
  availability: AvailabilityVerdict
  /** FPL has put a flag on him — a doubt the gate lets through. */
  flagged: boolean
  /** From the fixture table, never from the projection (CLAUDE.md, data rule 1). */
  hasFixture: boolean
}

export type SubstitutionVariant = 'forced' | 'doubt' | 'upgrade'

export type SubstitutionProposal = {
  outPlayerId: number
  inPlayerId: number
  variant: SubstitutionVariant
}

/** FPL's shape rules for the starting eleven. */
const SHAPE: Readonly<Record<Position, readonly [number, number]>> = {
  GKP: [1, 1],
  DEF: [3, 5],
  MID: [2, 5],
  FWD: [1, 3],
}

const EPSILON = 1e-9

/** A player who cannot score this week: the gate excludes him, or his club blanks. */
export const isUnplayable = (m: SquadMember): boolean => !m.availability.eligible || !m.hasFixture

/**
 * What a player is worth to the search. An unplayable player is worth so little
 * that he is chosen only when the shape cannot be made without him — which is
 * exactly when no legal substitution exists (F3-UP-07), and the search then
 * leaves him where he is rather than inventing a replacement.
 */
const worth = (m: SquadMember): number => (isUnplayable(m) ? -1000 : m.projection)

const shapeIsLegal = (eleven: readonly SquadMember[]): boolean => {
  if (eleven.length !== 11) return false
  return (Object.keys(SHAPE) as Position[]).every((position) => {
    const [min, max] = SHAPE[position]
    const count = eleven.filter((m) => m.position === position).length
    return count >= min && count <= max
  })
}

function* combinations<T>(items: readonly T[], size: number, start = 0, chosen: T[] = []): Generator<T[]> {
  if (chosen.length === size) {
    yield [...chosen]
    return
  }
  for (let i = start; i <= items.length - (size - chosen.length); i++) {
    chosen.push(items[i] as T)
    yield* combinations(items, size, i + 1, chosen)
    chosen.pop()
  }
}

type Candidate = { eleven: SquadMember[]; score: number; kept: number; ids: string }

/**
 * Better when it scores more; on a tie, when it keeps more of the current
 * eleven, so no swap is proposed for nothing; then by player id, so the same
 * inputs give the same answer on every run.
 */
const better = (a: Candidate, b: Candidate): boolean => {
  if (Math.abs(a.score - b.score) > EPSILON) return a.score > b.score
  if (a.kept !== b.kept) return a.kept > b.kept
  return a.ids < b.ids
}

/** The best legal eleven. Two keepers and thirteen outfielders: 572 candidates. */
export function bestEleven(squad: readonly SquadMember[]): SquadMember[] {
  const keepers = squad.filter((m) => m.position === 'GKP')
  const outfield = squad.filter((m) => m.position !== 'GKP')

  let best: Candidate | null = null
  for (const keeper of keepers) {
    for (const ten of combinations(outfield, 10)) {
      const eleven = [keeper, ...ten]
      if (!shapeIsLegal(eleven)) continue
      const candidate: Candidate = {
        eleven,
        score: eleven.reduce((sum, m) => sum + worth(m), 0),
        kept: eleven.filter((m) => m.isStarter).length,
        ids: eleven.map((m) => m.playerId).sort((x, y) => x - y).join(','),
      }
      if (best === null || better(candidate, best)) best = candidate
    }
  }

  if (best === null) throw new Error('No legal eleven exists in this squad. Refusing to invent one.')
  return best.eleven
}

const variantOf = (starter: SquadMember): SubstitutionVariant => {
  if (isUnplayable(starter)) return 'forced'
  if (starter.flagged) return 'doubt'
  return 'upgrade'
}

/**
 * The swaps that turn the current eleven into the best one, each legal alone.
 *
 * Same-position swaps are paired first — weakest starter out for strongest bench
 * player in — because they are legal whatever else happens. What remains is
 * paired across positions only where that single swap keeps the shape legal; a
 * cross-position swap that is legal only alongside another is not produced,
 * because the manager could accept it alone.
 */
export function substitutions(
  squad: readonly SquadMember[],
  // Swaps the best eleven needs that could not be paired into ones legal alone.
  // Under FPL's shape ranges, pairing like-for-like first should always leave the
  // rest legal — but that is an argument, not a proof, so a dropped swap is
  // recorded rather than lost in silence (slice 5 review, ruled 2026-09-11).
  onUnpaired: (outs: number[], ins: number[]) => void = (outs, ins) =>
    console.warn(`[calls] best eleven needs swaps that are only legal together — out ${outs.join(',')}, in ${ins.join(',')}`),
): SubstitutionProposal[] {
  const current = squad.filter((m) => m.isStarter)
  const best = new Set(bestEleven(squad).map((m) => m.playerId))

  const byWorthAsc = (a: SquadMember, b: SquadMember) => worth(a) - worth(b) || a.playerId - b.playerId
  const outs = current.filter((m) => !best.has(m.playerId)).sort(byWorthAsc)
  const ins = squad.filter((m) => !m.isStarter && best.has(m.playerId)).sort((a, b) => byWorthAsc(b, a))

  const pairs: [SquadMember, SquadMember][] = []
  const take = (out: SquadMember, into: SquadMember) => {
    pairs.push([out, into])
    outs.splice(outs.indexOf(out), 1)
    ins.splice(ins.indexOf(into), 1)
  }

  for (const out of [...outs]) {
    const into = ins.find((m) => m.position === out.position)
    if (into) take(out, into)
  }

  for (const out of [...outs]) {
    const into = ins.find((m) =>
      shapeIsLegal(current.filter((c) => c.playerId !== out.playerId).concat(m)),
    )
    if (into) take(out, into)
  }

  if (outs.length > 0 || ins.length > 0) {
    onUnpaired(
      outs.map((m) => m.playerId),
      ins.map((m) => m.playerId),
    )
  }

  return pairs.map(([out, into]) => ({
    outPlayerId: out.playerId,
    inPlayerId: into.playerId,
    variant: variantOf(out),
  }))
}
