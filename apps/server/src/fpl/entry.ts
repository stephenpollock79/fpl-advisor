/**
 * FPL's public entry endpoint — the one read that turns a team identifier into
 * a team the manager can recognise.
 *
 * **Public endpoints only, by team id** (F7-AC-13). No FPL credentials are
 * requested, transmitted or stored, there is no column for one, and nothing here
 * ever writes to FPL. The authenticated `my-team` endpoint is not used and must
 * not be introduced.
 */

/** The four fields F7-AC-14 shows back for acceptance before anything is stored. */
export type LinkedTeam = {
  fplTeamId: number
  teamName: string
  managerName: string
  /** Null until a manager's first gameweek scores. Zero would read as the best rank in the game. */
  overallRank: number | null
}

/**
 * The entry payload, narrowed to what we read. The live response carries about
 * two dozen other keys; they are deliberately not modelled, because a shape that
 * claims to describe the whole payload is a shape that goes stale silently.
 */
export type EntryPayload = {
  id: number
  name: string
  player_first_name: string
  player_last_name: string
  summary_overall_rank: number | null
}

export function toLinkedTeam(payload: EntryPayload): LinkedTeam {
  return {
    fplTeamId: payload.id,
    teamName: payload.name,
    managerName: `${payload.player_first_name} ${payload.player_last_name}`,
    overallRank: payload.summary_overall_rank,
  }
}

/** FPL's public API. Read-only, by team id, and never the authenticated endpoints. */
const FPL_API = 'https://fantasy.premierleague.com/api'

/**
 * One entry, or null when there is no such team.
 *
 * A 404 is an answer, not a fault — it is the ordinary result of a mistyped
 * identifier, and the screen says so. Any other failing status throws, because
 * "FPL is down" and "that team does not exist" must not reach the manager as the
 * same sentence. Working from a stale read when the feed is unreachable is F6 and
 * arrives in slice 7; until then the failure is loud.
 */
export async function fetchEntry(fplTeamId: number): Promise<EntryPayload | null> {
  const response = await fetch(`${FPL_API}/entry/${fplTeamId}/`, {
    headers: { Accept: 'application/json' },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`FPL entry ${fplTeamId} responded ${response.status}`)
  return (await response.json()) as EntryPayload
}
