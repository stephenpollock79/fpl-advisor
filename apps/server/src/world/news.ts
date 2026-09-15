/**
 * The red token in the Assistant status bar (F8-AC-13 – F8-AC-19).
 *
 * **It is derived on every read, never stamped.** The count is the difference
 * between the feed read this world was assembled from and the read the last
 * *successful* run saw — so it clears because a run moves the baseline, not
 * because anything writes a flag and something else remembers to clear it
 * (F8-AC-17). Slice 7's cold review found the opposite shape in `F6-AC-13`: a
 * tag a run wrote, with nothing to clear it, read past until it meant nothing.
 *
 * **No baseline means no token.** Before the first successful run there is no
 * "since" to measure against, and every player would read as changed — a token
 * announcing that the whole league has moved on the manager's first open is
 * worse than no token, because it teaches him to ignore the one that matters.
 *
 * Squad players only. The criterion says *squad players*, and the run's own diff
 * is league-wide because a player outside the squad can become a candidate
 * (F6-RS-05) — a different question from *has your team changed under you*.
 */

import { type EvidenceRow, diffEvidence } from '../refresh/evidence.js'

/** One squad player whose evidence has moved, and the fields that moved. */
export type FlaggedPlayer = {
  playerId: number
  /** F6's own four. Named so the tooltip can say which (F8-AC-15). */
  fields: readonly ('status' | 'news' | 'chance' | 'price')[]
  /** He has crossed out of the availability gate — the case that changes advice. */
  nowExcluded: boolean
}

export type News = {
  flagged: FlaggedPlayer[]
  /** When the last successful run finished. Null before there has been one. */
  since: string | null
}

export function squadNews(input: {
  /** The read the last successful run saw. Null when there has been no run. */
  before: readonly EvidenceRow[] | null
  /** The read this world was assembled from. */
  after: readonly EvidenceRow[]
  squad: readonly number[]
  since: string | null
}): News {
  if (input.before === null) return { flagged: [], since: input.since }

  const inSquad = new Set(input.squad)
  const narrow = (rows: readonly EvidenceRow[]) => rows.filter((r) => inSquad.has(r.playerId))

  const { changed } = diffEvidence(narrow(input.before), narrow(input.after))

  return {
    flagged: changed.map((c) => ({
      playerId: c.playerId,
      fields: c.fields,
      nowExcluded: !c.after.eligible,
    })),
    since: input.since,
  }
}
