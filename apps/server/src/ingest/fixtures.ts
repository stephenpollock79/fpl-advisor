/**
 * Fixtures — **the only source of a fixture count.**
 *
 * No row for a club in a gameweek means it blanks; two rows is a double. A
 * projection's size or presence never implies a count, and where the two disagree
 * the count wins. That rule is the reason this module exists separately from
 * projections: keeping them apart makes borrowing one for the other awkward
 * enough to notice.
 */

export type FixtureRow = {
  id: number
  gameweek: number
  homeClub: number
  awayClub: number
  kickoff: string | null
  homeDifficulty: number
  awayDifficulty: number
  finished: boolean
}

type FixturePayload = {
  id: number
  event: number | null
  team_h: number
  team_a: number
  kickoff_time: string | null
  team_h_difficulty: number
  team_a_difficulty: number
  finished: boolean
}

/**
 * Rows for every fixture that belongs to a gameweek.
 *
 * A fixture with `event: null` is postponed and not yet rescheduled. It is
 * dropped rather than defaulted, because a default would silently attach it to a
 * gameweek and turn a blank into an ordinary week.
 */
export function toFixtureRows(payload: FixturePayload[]): FixtureRow[] {
  return payload
    .filter((f) => f.event !== null)
    .map((f) => ({
      id: f.id,
      gameweek: f.event as number,
      homeClub: f.team_h,
      awayClub: f.team_a,
      kickoff: f.kickoff_time,
      homeDifficulty: f.team_h_difficulty,
      awayDifficulty: f.team_a_difficulty,
      finished: f.finished,
    }))
}

/** How many fixtures each club has in one gameweek. Absent means zero, not unknown. */
export function fixtureCountsByClub(rows: FixtureRow[], gameweek: number): Map<number, number> {
  const counts = new Map<number, number>()
  for (const f of rows.filter((r) => r.gameweek === gameweek)) {
    for (const club of [f.homeClub, f.awayClub]) {
      counts.set(club, (counts.get(club) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Announce every club that does not play exactly once.
 *
 * Blanks and doubles cannot be observed live this early in a season — doubles
 * come later — so the first real one has to say so rather than pass silently.
 * This is the whole of that mechanism: it logs, it does not correct anything, and
 * the count it reports is the one the rest of the pipeline uses.
 */
export function reportFixtureAnomalies(
  rows: FixtureRow[],
  gameweek: number,
  clubIds: number[],
  log: (message: string) => void = console.warn,
): void {
  const counts = fixtureCountsByClub(rows, gameweek)
  for (const clubId of clubIds) {
    const count = counts.get(clubId) ?? 0
    if (count === 1) continue
    log(
      `[fixtures] gameweek ${gameweek}: club id ${clubId} has ${count} fixtures ` +
        `(${count === 0 ? 'BLANK' : 'DOUBLE'}). Projections for its players are governed by this count.`,
    )
  }
}
