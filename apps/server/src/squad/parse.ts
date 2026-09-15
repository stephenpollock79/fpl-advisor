/**
 * What two screenshots say the squad is (F2).
 *
 * **Pure: what the model read in, a squad or a failure out.** No network, no
 * database, no clock — so every case `F2-UP-01` names can be fabricated, which
 * matters because none of them can be produced on demand from a real phone.
 *
 * **All-or-nothing across both images** (`F2-AC-04`, `F2-UP-01`). The two
 * screenshots are the source of truth for that week, not a diff applied to the
 * last-deadline squad, so a partial read applies *nothing* — there is no
 * confirm-and-correct screen and no manual gap filling. A half-applied squad
 * would be worse than no upload: it would look complete.
 *
 * **Which picture owes what** (`F2-AC-01`, `F2-AC-02`):
 *
 * | Team screen | Transfers screen |
 * | --- | --- |
 * | the fifteen, who starts, the bench order, captain, vice, chips remaining | bank, free transfers |
 *
 * No single FPL screen carries all of it, which is why there are two.
 */

import type { SquadPlayer } from './snapshot.js'

/** Exactly this many, or the Team read has failed. FPL squads are always fifteen. */
const SQUAD_SIZE = 15

/** One outfield keeper on the bench plus three outfielders: 0, 1, 2, 3. */
const BENCH_SIZE = 4

export type ParsedTeam = {
  players: SquadPlayer[]
  /** Chip name to state, as `squad_snapshot.chips_remaining` holds it. */
  chipsRemaining: Record<string, string>
}

export type ParsedTransfers = {
  bankTenths: number
  freeTransfers: number
}

export type ParsedSquad = ParsedTeam & ParsedTransfers

/**
 * **Which screenshot fell short, and what was missing from it** — the failure
 * screen names both, because "upload failed" on its own leaves the manager
 * retrying the picture that was fine (`F2-UP-01`).
 */
export type ParseFailure = {
  screen: 'team' | 'transfers'
  /** Shown verbatim: "only 4 of 15 players legible on the Team screenshot". */
  because: string
}

export type ParseResult = { ok: true; squad: ParsedSquad } | { ok: false; failure: ParseFailure }

/**
 * **What every legal FPL squad holds**, and the check that catches a wrong
 * match before it reaches a screen.
 *
 * A misread name produces a *plausible* squad rather than an obviously broken
 * one: on 2026-09-15 a forward was matched to a midfielder, landed in midfield,
 * and the formation quietly read 3-5-2 for a 3-4-3 side. Nothing looked wrong.
 * A squad that is not 2/5/5/3 cannot be the manager's, whatever the names say.
 */
const SQUAD_SHAPE = { GKP: 2, DEF: 5, MID: 5, FWD: 3 } as const

/** What the model is asked to return, before any of it is trusted. */
export type RawParse = {
  team?: {
    players?: {
      playerId?: unknown
      /** The name as printed on the shirt, checked when the id does not land. */
      name?: unknown
      isStarter?: unknown
      benchOrder?: unknown
      isCaptain?: unknown
      isVice?: unknown
    }[]
    /**
     * **An array of pairs, not a map.** Structured outputs reject an open
     * object — `additionalProperties` must be the boolean `false` — and
     * declaring the chips as one had every upload refused with HTTP 400 before
     * a picture was looked at (2026-09-15).
     */
    chips?: { chip?: unknown; state?: unknown }[]
  }
  transfers?: { bankTenths?: unknown; freeTransfers?: unknown }
}

const isPlayerId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0

/**
 * **Money is an integer in tenths of £1m, and no float ever holds it**
 * (CLAUDE.md, *Stack*). A bank read as "£2.8m" reaches here as 28; anything
 * that is not a whole number of tenths is a failed read, not a rounding job.
 */
const isTenths = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

/**
 * **Names as they are written down, and as they are read off a shirt, are not
 * the same string.** Accents, punctuation and case all differ between FPL's own
 * data and what a reader transcribes, so the comparison is made on a form that
 * strips all three. It is only ever used to *resolve* a name to an id, never to
 * display one.
 */
const normalise = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Letters and digits: punctuation and spacing differ between a data field
    // and a transcription, the characters themselves do not.
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()

export function parseSquad(
  raw: RawParse,
  /**
   * Every player the read could choose from. Its positions are the composition
   * check; its names are the fallback when an id does not land. Omit to skip
   * both.
   */
  known?: readonly { id: number; name: string; position: string }[],
): ParseResult {
  const positions = known ? new Map(known.map((p) => [p.id, p.position])) : undefined

  /**
   * **Reading the name is the model's job; resolving it is code's.** The read
   * returns an id *and* the name it saw, and a three-digit id copied fifteen
   * times is where a slip happens — one of which failed a whole upload under
   * the all-or-nothing rule (2026-09-15). Where the id does not land on a known
   * player, the name decides.
   */
  /**
   * **A name two players share resolves to neither.** Picking the last one
   * would be a coin toss dressed as a match, and the all-or-nothing rule exists
   * precisely so a doubtful read fails loudly rather than quietly.
   */
  const byName = new Map<string, number | null>()
  for (const p of known ?? []) {
    const key = normalise(p.name)
    byName.set(key, byName.has(key) ? null : p.id)
  }
  const knownIds = new Set((known ?? []).map((p) => p.id))

  const resolve = (entry: { playerId?: unknown; name?: unknown }): number | null => {
    const id = entry.playerId
    if (typeof id === 'number' && Number.isInteger(id) && (knownIds.size === 0 || knownIds.has(id))) return id
    const matched = typeof entry.name === 'string' ? byName.get(normalise(entry.name)) : undefined
    return matched ?? null
  }
  const players = raw.team?.players ?? []

  const resolved = players.map((p) => ({ ...p, resolvedId: resolve(p) }))

  const legible = resolved.filter(
    (p) =>
      isPlayerId(p.resolvedId) &&
      typeof p.isStarter === 'boolean' &&
      typeof p.isCaptain === 'boolean' &&
      typeof p.isVice === 'boolean',
  )

  if (legible.length !== SQUAD_SIZE) {
    /**
     * **Two different faults wear this message, and they need different
     * answers** (2026-09-15). Fifteen shirts reported but one not matched to a
     * known player is *ours* — the name on that shirt is not in the list we
     * gave the reader — and no amount of retaking the photo fixes it. Fewer
     * than fifteen reported is the picture.
     */
    const reported = players.length
    // **Name the players it could not place.** "One of fifteen" sends the
    // manager back to his camera roll; "could not place Ajayi" is something
    // anyone can act on, and tells us at once whether it is a reading problem
    // or a gap in our own list.
    const unplaced = resolved
      .filter((p) => !isPlayerId(p.resolvedId))
      .map((p) => (typeof p.name === 'string' && p.name.length > 0 ? p.name : 'an unnamed player'))

    const because =
      reported === SQUAD_SIZE
        ? `all ${String(SQUAD_SIZE)} players were read, but ${unplaced.join(', ')} could not be matched to a known player — that is our end, not your picture`
        : `only ${String(legible.length)} of ${String(SQUAD_SIZE)} players legible on the Team screenshot`
    return { ok: false, failure: { screen: 'team', because } }
  }

  // **A squad with no chip row is a failed Team read, not an empty chip row.**
  // Every FPL team has one, so its absence means the picture was not the Team
  // screen — and an empty row would silently tell the manager he has none left.
  const chips = raw.team?.chips
  if (!Array.isArray(chips) || chips.length === 0) {
    return { ok: false, failure: { screen: 'team', because: 'the chips row was not found on the Team screenshot' } }
  }

  const squad: SquadPlayer[] = legible.map((p) => ({
    playerId: p.resolvedId as number,
    isStarter: p.isStarter as boolean,
    benchOrder: (p.isStarter === true ? null : (p.benchOrder as 0 | 1 | 2 | 3)),
    isCaptain: p.isCaptain as boolean,
    isVice: p.isVice as boolean,
  }))

  const starters = squad.filter((p) => p.isStarter)
  if (starters.length !== SQUAD_SIZE - BENCH_SIZE) {
    return {
      ok: false,
      failure: {
        screen: 'team',
        because: `${String(starters.length)} players read as starting on the Team screenshot, and a team starts eleven`,
      },
    }
  }

  const benchOrders = squad.filter((p) => !p.isStarter).map((p) => p.benchOrder)
  if (new Set(benchOrders).size !== BENCH_SIZE || benchOrders.some((o) => o === null)) {
    return { ok: false, failure: { screen: 'team', because: 'the bench order was not legible on the Team screenshot' } }
  }

  if (squad.filter((p) => p.isCaptain).length !== 1) {
    return { ok: false, failure: { screen: 'team', because: 'the captain’s armband was not legible on the Team screenshot' } }
  }
  if (squad.filter((p) => p.isVice).length !== 1) {
    return { ok: false, failure: { screen: 'team', because: 'the vice-captain’s armband was not legible on the Team screenshot' } }
  }

  /**
   * **Every legal FPL squad is 2/5/5/3, so one that is not was misread.** This
   * is the check that turns a wrong name from a plausible squad into a refused
   * upload — and it costs nothing, because the positions are already on the
   * list the read chose from.
   */
  if (positions) {
    const nameOf = new Map((known ?? []).map((p) => [p.id, p.name]))
    const counts: Record<string, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 }
    const placed: Record<string, string[]> = { GKP: [], DEF: [], MID: [], FWD: [] }

    for (const p of squad) {
      const position = positions.get(p.playerId)
      if (position === undefined) {
        return {
          ok: false,
          failure: { screen: 'team', because: 'a player on the Team screenshot could not be identified' },
        }
      }
      counts[position] = (counts[position] ?? 0) + 1
      placed[position]?.push(nameOf.get(p.playerId) ?? String(p.playerId))
    }

    const wrong = Object.entries(SQUAD_SHAPE).filter(([position, wanted]) => counts[position] !== wanted)
    if (wrong.length > 0) {
      /**
       * **Name who it put where.** A count alone — "4 DEF where a squad has 5"
       * — says something is wrong and nothing about what, which is the fault
       * every message in this path has had tonight. Listing the matched names
       * against each position shows the culprit at a glance: the defender
       * sitting in the midfield line is the one that was misread.
       */
      const summary = (['GKP', 'DEF', 'MID', 'FWD'] as const)
        .map((position) => `${position}: ${placed[position]?.join(', ') || 'none'}`)
        .join(' · ')
      const [position, wanted] = wrong[0] as [string, number]
      return {
        ok: false,
        failure: {
          screen: 'team',
          because:
            `the Team screenshot read as ${String(counts[position] ?? 0)} ${position} where a squad has ${String(wanted)}, ` +
            `so at least one player was matched to the wrong name — ${summary}`,
        },
      }
    }
  }

  const bank = raw.transfers?.bankTenths
  if (!isTenths(bank)) {
    return { ok: false, failure: { screen: 'transfers', because: 'the bank was not found on the Transfers screenshot' } }
  }

  const free = raw.transfers?.freeTransfers
  if (typeof free !== 'number' || !Number.isInteger(free) || free < 0) {
    return {
      ok: false,
      failure: { screen: 'transfers', because: 'free transfers were not found on the Transfers screenshot' },
    }
  }

  return {
    ok: true,
    squad: {
      players: squad,
      chipsRemaining: Object.fromEntries(
        chips
          .filter((c) => typeof c.chip === 'string' && c.chip.length > 0)
          .map((c) => [String(c.chip), String(c.state ?? 'unknown')]),
      ),
      bankTenths: bank,
      freeTransfers: free,
    },
  }
}

/**
 * The three causes worth naming on the failure screen (`F2-UP-01`), in the
 * order they actually happen. Not derived from the failure — any of the three
 * can produce any of them, so listing all three is the honest answer.
 */
export const COMMON_CAUSES = [
  'the screenshot was cropped',
  'it is a photo of a screen rather than a screenshot',
  'it is the wrong screen',
] as const
