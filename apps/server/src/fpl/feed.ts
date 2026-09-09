/**
 * The two FPL reads that are about the world rather than one manager.
 *
 * Lives beside entry.ts rather than in a `feeds/` folder as the slice spec
 * sketched: FPL already had a home here from slice 2, and one feed with two
 * folders is worse than one folder with a different name. Noted rather than
 * silently diverged.
 *
 * **Public endpoints only.** No credentials exist for FPL and none are needed;
 * the app never writes to FPL and never reads the manager's account.
 */

const FPL_API = 'https://fantasy.premierleague.com/api'

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${FPL_API}${path}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`FPL ${path} responded ${response.status}`)
  return (await response.json()) as T
}

/** Gameweeks, clubs, players and their current state. About 1.7 MB. */
export function fetchBootstrap<T>(): Promise<T> {
  return getJson<T>('/bootstrap-static/')
}

/**
 * Every fixture in the season, including ones not yet assigned a gameweek.
 *
 * The whole season rather than one gameweek, because the stat table needs the
 * next three (F1-AC-19) and because a blank is the *absence* of a row — which
 * can only be established against the full set.
 */
export function fetchFixtures<T>(): Promise<T> {
  return getJson<T>('/fixtures/')
}
