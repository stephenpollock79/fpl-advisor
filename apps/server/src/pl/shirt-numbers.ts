/**
 * Shirt numbers, from the Premier League's own public API.
 *
 * **A third source, and the only thing it supplies is this.** F1-AC-10 asks each
 * player slot to show a shirt number, and neither of the two feeds has one: FPL's
 * `squad_number` is null for all 654 players, and Fantasy Football IQ has no
 * number-shaped field at all (STE-112).
 *
 * **The join is `opta_code`.** FPL carries it on every element and the Premier
 * League carries the same identifier as `altIds.opta`, so the two match exactly
 * with no name-guessing. Measured on 2026-09-09: 530 of 654 FPL players matched,
 * and **253 of the 254 with ninety minutes or more** — effectively complete for
 * anyone who could be in a squad, and the misses are academy players who never
 * appear.
 *
 * **This is not a feed and must not become one.** A shirt number changes about
 * once a season, plus transfers. `ensureShirtNumbers` fetches only when the
 * numbers are largely missing, so it runs once and then stops — no schedule
 * (CLAUDE.md forbids one), no manual step to remember, and no twenty-one extra
 * requests on every open.
 *
 * It also fails soft. A shirt number is decoration on a thirty-four pixel kit
 * with the player's surname printed beneath it; if this source is unreachable the
 * squad screen is unchanged but for a blank kit, so an error here must never take
 * down a read of the world.
 */

const PL_API = 'https://footballapi.pulselive.com/football'

/**
 * The Premier League's API expects a browser origin. Sent because the endpoint
 * requires it, not to disguise anything — this is the same public data the
 * premierleague.com squad pages show.
 */
const HEADERS = { Origin: 'https://www.premierleague.com', Accept: 'application/json' }

/** Below this many stored numbers, it is worth a fetch. Above it, leave well alone. */
const ENOUGH = 400

type PlayerNeedingNumber = { id: number; optaCode: string | null }

/**
 * Fill in any missing shirt numbers, and do nothing at all if they are already
 * there.
 *
 * Returns how many were written, so the caller can log a real figure rather than
 * asserting success.
 */
export async function ensureShirtNumbers(
  countExisting: () => Promise<number>,
  players: PlayerNeedingNumber[],
  save: (numbers: { id: number; shirtNumber: number }[]) => Promise<void>,
  log: (message: string) => void = console.warn,
): Promise<number> {
  if ((await countExisting()) >= ENOUGH) return 0

  let byOpta: Map<string, number>
  try {
    byOpta = await fetchShirtNumbers()
  } catch (cause) {
    // Soft by design. A blank kit is a cosmetic loss; a failed world read is not.
    log(`[shirt-numbers] could not reach the Premier League API: ${String(cause)}`)
    return 0
  }

  const found = players.flatMap((p) => {
    const number = p.optaCode === null ? undefined : byOpta.get(p.optaCode)
    return number === undefined ? [] : [{ id: p.id, shirtNumber: number }]
  })

  if (found.length > 0) await save(found)
  log(`[shirt-numbers] matched ${found.length} of ${players.length} players by opta code`)
  return found.length
}

/** Every club's squad, reduced to opta identifier and number. */
export async function fetchShirtNumbers(season = 841): Promise<Map<string, number>> {
  const teams = await getJson<{ content: { id: number }[] }>(
    `/teams?pageSize=100&compSeasons=${season}&comps=1&altIds=true&page=0`,
  )

  const squads = await Promise.all(
    teams.content.map((team) =>
      getJson<{ players?: { altIds?: { opta?: string }; info?: { shirtNum?: number } }[] }>(
        `/teams/${team.id}/compseasons/${season}/staff?compSeasons=${season}&altIds=true`,
      ),
    ),
  )

  const byOpta = new Map<string, number>()
  for (const squad of squads) {
    for (const player of squad.players ?? []) {
      const opta = player.altIds?.opta
      const number = player.info?.shirtNum
      if (opta && typeof number === 'number') byOpta.set(opta, number)
    }
  }
  return byOpta
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${PL_API}${path}`, { headers: HEADERS })
  if (!response.ok) throw new Error(`Premier League ${path} responded ${response.status}`)
  return (await response.json()) as T
}
