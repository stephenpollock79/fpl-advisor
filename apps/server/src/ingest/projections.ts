/**
 * Projections, from Fantasy Football IQ — the number, and only the number.
 *
 * One figure per player per gameweek, and **that figure already covers however
 * many matches the gameweek holds.** There is no fixture dimension here and none
 * in the table, which is what makes "nothing is summed across fixture entries"
 * structurally true rather than a convention someone has to remember.
 *
 * The feed is unauthenticated public HTTPS and needs no credential (STE-98).
 * Attribution to fantasyfootballiq.app is a licence condition, not a courtesy.
 *
 * **FFIQ carries its own opponent, venue and fixture-ease per gameweek. None of
 * it is read here.** The FPL feed owns fixtures; taking them from this payload
 * would put two sources behind one fact, and they would disagree in exactly the
 * weeks that matter.
 */

export type ProjectionRow = {
  gameweek: number
  playerId: number
  projectedPoints: number
  feedReadId: string
}

type FfiqPayload = {
  players: {
    /** Null, absent, or a real FPL player id. The code guards all three, so the
     *  type says all three — a type stricter than the runtime check is a lie that
     *  compiles. */
    fpl_id?: number | null
    /** Optional, because the code already defends against its absence and a type that
     *  disagrees with the code is worse than either. A player with no gameweek rows
     *  simply produces no projections. */
    gws?: { gw: number; proj: number }[]
  }[]
}

export function toProjectionRows(payload: FfiqPayload, feedReadId: string): ProjectionRow[] {
  const rows: ProjectionRow[] = []

  for (const player of payload.players) {
    // The join is fpl_id. A projection for a player FPL does not list cannot be
    // attached to anything, and inventing a row would break the foreign key.
    if (player.fpl_id === null || player.fpl_id === undefined) continue

    const seen = new Set<number>()
    for (const gw of player.gws ?? []) {
      // **Never summed.** If the feed ever emits two entries for one gameweek,
      // adding them would double-count a double — the precise failure the
      // one-figure rule exists to prevent. The first is taken; the table's
      // primary key would reject the second anyway.
      if (seen.has(gw.gw)) continue
      seen.add(gw.gw)

      rows.push({
        gameweek: gw.gw,
        playerId: player.fpl_id,
        projectedPoints: gw.proj,
        feedReadId,
      })
    }
  }

  return rows
}

/**
 * What a player is actually projected to score, once the fixture count is known.
 *
 * **On conflict the count wins.** A club with no fixture projects zero, whatever
 * the projections feed carries — the feed is not wrong, it simply does not know
 * about the blank. A double returns the figure unchanged, because the figure
 * already covers both matches.
 */
export function effectiveProjection(input: {
  projectedPoints: number
  fixtureCount: number
}): number {
  return input.fixtureCount === 0 ? 0 : input.projectedPoints
}
