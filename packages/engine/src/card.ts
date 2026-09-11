/**
 * F3-AC-16, F3-AC-19, F3-AC-20, F3-AC-22 — the call card's evaluation table,
 * and the sentence built from it when the model's is not used.
 *
 * One master row list, identical on transfer, substitution and captain calls,
 * with a winner per row and a tie that is legitimately neither. It sits in the
 * engine for the reason net does: the server builds the fallback reasoning from
 * these winners, and the client recomputes them when a candidate is swapped
 * (F3-AC-24). Two implementations of "who wins this row" are how a card's
 * highlights and its sentence come to disagree.
 *
 * Nothing here enters net, conviction or band. These rows are what the card
 * shows beside them — and the only dimensions the reasoning may cite.
 */
import type { AvailabilityVerdict } from './types.js'

export type CardFixture = { readonly opponent: string; readonly isHome: boolean; readonly difficulty: number }

export type CardPlayer = {
  readonly availability: AvailabilityVerdict
  /** FPL's percentage, shown read-only either way (ENGINE-AC-02). */
  readonly chanceOfPlayingNextRound: number | null
  readonly form: number | null
  /** The feed's projection for this gameweek, zero where the club blanks. */
  readonly projection: number
  /** This gameweek's fixtures, from the fixture table: none, one or two. */
  readonly fixtures: readonly CardFixture[]
  readonly priceTenths: number
  readonly selectedByPercent: number | null
  readonly seasonPoints: number | null
  readonly transfersIn: number | null
  readonly transfersOut: number | null
}

export type RowKey =
  | 'games'
  | 'availability'
  | 'form'
  | 'xpts'
  | 'fixtures'
  | 'price'
  | 'selected_by'
  | 'season_points'
  | 'transfers_in'
  | 'transfers_out'

export type RowWinner = 'out' | 'in' | 'tie'

export type EvaluationRow = {
  readonly key: RowKey
  readonly label: string
  readonly out: number | null
  readonly in: number | null
  readonly winner: RowWinner
}

const LABELS: Readonly<Record<RowKey, string>> = {
  games: 'games this GW',
  availability: 'availability',
  form: 'form',
  xpts: 'xPts this GW',
  fixtures: 'this gameweek',
  price: 'price',
  selected_by: 'selected by',
  season_points: 'points, season',
  transfers_in: 'transfers in, this GW',
  transfers_out: 'transfers out, this GW',
}

/** How the reasoning names a row, in running prose. */
const PROSE: Readonly<Record<RowKey, string>> = {
  games: 'games this gameweek',
  availability: 'availability',
  form: 'form',
  xpts: 'projected points',
  fixtures: 'fixtures',
  price: 'price',
  selected_by: 'ownership',
  season_points: 'season points',
  transfers_in: 'transfers in',
  transfers_out: 'fewer transfers out',
}

/** A missing figure never wins; two missing figures tie. */
const compare = (out: number | null, into: number | null, lowerBetter: boolean): RowWinner => {
  if (out === null && into === null) return 'tie'
  if (out === null) return 'in'
  if (into === null) return 'out'
  if (out === into) return 'tie'
  return (out < into) === lowerBetter ? 'out' : 'in'
}

/** Eligible reads as FPL's figure, or 100 where it publishes none; excluded as its figure, or 0. */
const availabilityPercent = (p: CardPlayer): number =>
  p.availability.eligible ? (p.chanceOfPlayingNextRound ?? 100) : (p.chanceOfPlayingNextRound ?? 0)

/** The difficulty this gameweek presents, averaged across a double. Null for a blank. */
const difficulty = (p: CardPlayer): number | null =>
  p.fixtures.length === 0 ? null : p.fixtures.reduce((sum, f) => sum + f.difficulty, 0) / p.fixtures.length

const row = (key: RowKey, out: number | null, into: number | null, winner: RowWinner): EvaluationRow => ({
  key,
  label: LABELS[key],
  out,
  in: into,
  winner,
})

export const evaluationRows = (out: CardPlayer, into: CardPlayer): EvaluationRow[] => {
  const availability = (() => {
    // The gate's verdict decides first: a player it lets through beats one it
    // excludes, whatever the two percentages say.
    if (out.availability.eligible !== into.availability.eligible) return out.availability.eligible ? 'out' : 'in'
    return compare(availabilityPercent(out), availabilityPercent(into), false)
  })()

  const rows = [
    row('availability', availabilityPercent(out), availabilityPercent(into), availability),
    row('form', out.form, into.form, compare(out.form, into.form, false)),
    row('xpts', out.projection, into.projection, compare(out.projection, into.projection, false)),
    row(
      'fixtures',
      difficulty(out),
      difficulty(into),
      out.fixtures.length === into.fixtures.length
        ? compare(difficulty(out), difficulty(into), true)
        : out.fixtures.length > into.fixtures.length
          ? 'out'
          : 'in',
    ),
    row('price', out.priceTenths, into.priceTenths, compare(out.priceTenths, into.priceTenths, true)),
    // Ownership is neither better nor worse — a template pick and a differential
    // are both legitimate — so the row never carries a winner.
    row('selected_by', out.selectedByPercent, into.selectedByPercent, 'tie'),
    row('season_points', out.seasonPoints, into.seasonPoints, compare(out.seasonPoints, into.seasonPoints, false)),
    row('transfers_in', out.transfersIn, into.transfersIn, compare(out.transfersIn, into.transfersIn, false)),
    row('transfers_out', out.transfersOut, into.transfersOut, compare(out.transfersOut, into.transfersOut, true)),
  ]

  // In a blank or double gameweek the count leads the table (F3-AC-16).
  const exceptional = out.fixtures.length !== 1 || into.fixtures.length !== 1
  if (!exceptional) return rows

  return [
    row('games', out.fixtures.length, into.fixtures.length, compare(out.fixtures.length, into.fixtures.length, false)),
    ...rows,
  ]
}

const oxford = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * The fallback sentence (ENGINE step 3): built from the table's own winning
 * rows, so it can cite nothing the card does not show. Used whenever the model's
 * line fails the blocklist, and whenever a candidate swap recomputes the card
 * locally.
 */
export const templateReasoning = (rows: readonly EvaluationRow[], outName: string, inName: string): string => {
  const xpts = rows.find((r) => r.key === 'xpts')
  const won = rows
    .filter((r) => r.winner === 'in' && r.key !== 'xpts' && r.key !== 'selected_by')
    .slice(0, 3)
    .map((r) => PROSE[r.key])

  const head = `${inName} over ${outName}: ${(xpts?.in ?? 0).toFixed(1)} projected points this gameweek against ${(xpts?.out ?? 0).toFixed(1)}`
  return won.length > 0 ? `${head}, and ahead on ${oxford(won)}.` : `${head}.`
}
