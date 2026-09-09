/**
 * The squad screen's pure display rules.
 *
 * Formation, surnames and totals are all derived at render and none is stored,
 * so no derived value can drift from the players it describes (F1-AC-03,
 * F1-AC-22).
 *
 * Not in `packages/engine`, deliberately. The engine produces net, conviction and
 * band; these are presentation. Widening its remit before slice 4 defines it would
 * be deciding that slice's shape from here.
 */

export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD'

export type FormattablePlayer = {
  playerId: number
  surname: string
  position: Position
  isStarter: boolean
  benchOrder: 0 | 1 | 2 | 3 | null
  projectedPoints: number
}

/** Longer than this is cut. Eleven characters fit a slot; twelve do not. */
const SURNAME_FITS = 11
const SURNAME_KEEP = 10

/**
 * The shape of the starting eleven, as text (F1-AC-03).
 *
 * **Never a control.** The manager changes their team in the FPL app; this only
 * reports what it already is. The goalkeeper is implicit because every legal
 * formation has exactly one.
 */
export function formationOf(players: FormattablePlayer[]): string {
  const by = startersByPosition(players)
  return `${by.DEF.length}-${by.MID.length}-${by.FWD.length}`
}

/**
 * The starting eleven, grouped. Bench players are excluded entirely.
 *
 * Generic so it returns what it was given. Narrowing to the minimal shape would
 * force every caller to cast back to the type it already had, and a cast is where
 * a wrong field slips through.
 */
export function startersByPosition<T extends FormattablePlayer>(
  players: T[],
): Record<Position, T[]> {
  const starters = players.filter((p) => p.isStarter)
  return {
    GKP: starters.filter((p) => p.position === 'GKP'),
    DEF: starters.filter((p) => p.position === 'DEF'),
    MID: starters.filter((p) => p.position === 'MID'),
    FWD: starters.filter((p) => p.position === 'FWD'),
  }
}

/**
 * The bench, in the fixed order F1-AC-02 requires: substitute goalkeeper, then
 * outfield one, two, three.
 *
 * Sorted rather than trusted. The order is a property of the squad, not of
 * whatever order the rows happened to arrive in.
 */
export function benchInOrder<T extends FormattablePlayer>(players: T[]): T[] {
  return players
    .filter((p) => !p.isStarter)
    .sort((a, b) => (a.benchOrder ?? 0) - (b.benchOrder ?? 0))
}

/**
 * A surname that fits a player slot (F1-UP-03).
 *
 * **Display only.** Every lookup — model, feed, database — keys off the
 * untruncated name. This returns a new string and never mutates its input, so a
 * shortened form cannot leak into anything that matches on a name.
 */
export function displaySurname(surname: string): string {
  if (surname.length <= SURNAME_FITS) return surname
  return `${surname.slice(0, SURNAME_KEEP)}.`
}

/**
 * Projected points, summed from the players shown (F1-AC-22).
 *
 * Computed on every render rather than stored, which is the whole of the
 * criterion: a total that is derived cannot disagree with the players it
 * represents. A blanking player contributes zero and still occupies a slot —
 * zero and absent look identical in a total and are not the same on a pitch.
 */
export function totalProjected(
  players: readonly FormattablePlayer[],
  which: { starters: boolean },
): number {
  return players
    .filter((p) => p.isStarter === which.starters)
    .reduce((sum, p) => sum + p.projectedPoints, 0)
}

/**
 * Colour bands for the stat table's numeric columns.
 *
 * **These thresholds are invented and no criterion specifies them.** F1-AC-15
 * says the master column list is shown; it says nothing about colouring it. They
 * are here, named, so that changing them is one edit rather than a search — and
 * so it is obvious they are a presentation judgement rather than anything the
 * engine or the PRD decided.
 *
 * Chosen against a real gameweek's spread rather than round numbers: form across
 * a squad ran 2.3 to 8.0 and projections 1.5 to 7.7, so the cuts sit where the
 * middle of that distribution actually falls. Re-cut them freely; nothing depends
 * on them but the colour of a figure.
 *
 * They are never the only signal — every banded figure is the number itself, so
 * the colour adds emphasis rather than carrying meaning alone (NFR Accessibility).
 */
export const BANDS = {
  form: { good: 6, fair: 3.5 },
  projected: { good: 5, fair: 3 },
} as const

export type Band = 'good' | 'fair' | 'poor'

export function bandOf(value: number | null, scale: { good: number; fair: number }): Band | null {
  if (value === null) return null
  if (value >= scale.good) return 'good'
  if (value >= scale.fair) return 'fair'
  return 'poor'
}
