/**
 * Fantasy Football IQ's projections.
 *
 * **Unauthenticated public HTTPS.** Two static files, no key, no token, no
 * account, no developer portal and no `/api` path — confirmed by live fetch on
 * 2026-09-09 (STE-98). There is no credential to configure and none should be
 * created. A search for a "Fantasy Football IQ API" returns nothing relevant;
 * that is not evidence the feed has gone, and the check that settles it is
 * fetching the URL.
 *
 * **Neither this feed nor FPL's sends CORS headers**, so the browser can never
 * call either directly. The server fetches, the client calls our own origin.
 * Physical, not a preference.
 *
 * Attribution to fantasyfootballiq.app is a condition of the licence the payload
 * itself carries (STE-53), not a courtesy.
 *
 * **There is no fallback.** If this feed is unreachable, projections are absent
 * rather than substituted. FPL's own `ep_next` must never stand in: measured on
 * 2026-09-02 it equalled points-per-game for 214 of 217 players, with no fixture,
 * opponent, venue or minutes term. It is a different quantity, and substituting
 * it degrades every recommendation while looking entirely normal.
 */

const FFIQ_DATA = 'https://fantasyfootballiq.app/data'

export function fetchProjections<T>(): Promise<T> {
  return getJson<T>('/ffiq-projections-latest.json')
}

export function fetchFixtureEase<T>(): Promise<T> {
  return getJson<T>('/ffiq-fixture-ease-latest.json')
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${FFIQ_DATA}${path}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`FFIQ ${path} responded ${response.status}`)
  return (await response.json()) as T
}
