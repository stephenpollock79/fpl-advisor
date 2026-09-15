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
 * | the fifteen, who starts, the bench order, captain, vice, chips remaining | bank, free transfers, **the fifteen again** |
 *
 * No single FPL screen carries all of it, which is why there are two.
 *
 * **Both pictures show all fifteen names, so both are read for them**
 * (2026-09-15). The Transfers screen lays the same squad out by position rather
 * than by selection, which makes it useless for who starts — and a completely
 * independent second look at who is *in* the squad. The read is not
 * deterministic: the same two pictures gave fifteen names one attempt and
 * fourteen the next. Two readings of the same fifteen turn that from a coin
 * flip into a near-miss that code can close.
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
  transfers?: {
    bankTenths?: unknown
    freeTransfers?: unknown
    /**
     * **The same fifteen, read again off the other picture.** Names only: the
     * Transfers screen arranges the squad by position, so it says nothing about
     * who starts, who is captain or what order the bench is in. It is used to
     * *recover* a name the Team read dropped and never to reject one it made.
     */
    players?: { playerId?: unknown; name?: unknown }[]
  }
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
    /**
     * **ß first, because it does not decompose.** Every other accent in FPL's
     * data breaks into a letter plus a mark and survives the strip below —
     * Kinský becomes kinsky, João becomes joao. `ß` does not: it would be
     * removed outright, leaving Groß as "gro" while a reader transcribing
     * "Gross" gives "gross", and the two would never meet. It is one of the
     * fifteen in the squad this was built for.
     */
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Letters and digits: punctuation and spacing differ between a data field
    // and a transcription, the characters themselves do not.
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()

/** One shirt as the Team read described it, plus whoever code matched it to. */
type TeamEntry = {
  playerId?: unknown
  name?: unknown
  isStarter?: unknown
  benchOrder?: unknown
  isCaptain?: unknown
  isVice?: unknown
  resolvedId: number | null
}

/**
 * Completes a Team read that came back one short, from the other picture.
 * Returns the list unchanged wherever the answer is not forced.
 */
function withSecondReading(team: TeamEntry[], second: readonly number[]): TeamEntry[] {
  const placed = new Set(team.filter((e) => isPlayerId(e.resolvedId)).map((e) => e.resolvedId as number))
  const extra = [...new Set(second)].filter((id) => !placed.has(id))

  // One gap, one name to put in it. Anything else is a choice, not a recovery.
  if (SQUAD_SIZE - placed.size !== 1 || extra.length !== 1) return team
  const found = extra[0] as number

  /**
   * **The Team read produced the slot and could not name it.** Everything else
   * about him was legible — starting or benched, the armband, his place on the
   * bench — so the recovered name goes into the slot already described.
   */
  const slot = team.findIndex((e) => !isPlayerId(e.resolvedId))
  if (slot >= 0) return team.map((e, i) => (i === slot ? { ...e, resolvedId: found } : e))

  /**
   * **The Team read never produced the slot at all**, so what it would have
   * said has to come from what the other fourteen say — and each of those is
   * forced rather than guessed. A team starts eleven: fourteen read with ten
   * starting means the missing man starts. There is exactly one captain and one
   * vice: if neither is among the fourteen, he is that one.
   */
  const benchNumbers = team
    .filter((e) => e.isStarter !== true && typeof e.benchOrder === 'number')
    .map((e) => e.benchOrder as number)
  // **Whichever bench place nobody claimed.** The read numbers the bench from
  // nought in some attempts and from one in others, so the gap is looked for
  // inside the run it actually used rather than an assumed 0–3.
  const base = benchNumbers.length > 0 ? Math.min(...benchNumbers) : 0
  const free = [0, 1, 2, 3].map((n) => base + n).filter((n) => !benchNumbers.includes(n))

  return [
    ...team,
    {
      playerId: found,
      name: '',
      resolvedId: found,
      isStarter: team.filter((e) => e.isStarter === true).length < SQUAD_SIZE - BENCH_SIZE,
      benchOrder: free.length === 1 ? (free[0] as number) : base + BENCH_SIZE,
      isCaptain: team.every((e) => e.isCaptain !== true),
      isVice: team.every((e) => e.isVice !== true),
    },
  ]
}

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
   * **The name decides; the id only breaks a tie.**
   *
   * This was the other way round for one evening and it did not work. The read
   * returned ids that were perfectly valid and belonged to the wrong players —
   * Szoboszlai matched to Curtis Jones, van Hecke to Igor, João Pedro to Pedro
   * Porro. Right club, wrong man. A fallback that fires only on an *invalid*
   * id never fires on those, because there is nothing invalid about them.
   *
   * So the priority is inverted to match where each side is actually reliable:
   * reading the name off a shirt is what a model does well, and choosing one
   * row out of six hundred is what a lookup does well. The id is consulted only
   * when the name belongs to more than one player, which is the one case a name
   * genuinely cannot settle.
   */
  /**
   * **A name two players share resolves to neither.** Picking the last one
   * would be a coin toss dressed as a match, and the all-or-nothing rule exists
   * precisely so a doubtful read fails loudly rather than quietly.
   */
  const byName = new Map<string, number | null>()
  /** Every id behind a name more than one player answers to. */
  const sharedBy = new Map<string, Set<number>>()
  /** Every known name in its comparable form, for the prefix fallback below. */
  const normalisedKnown: [string, number][] = []
  for (const p of known ?? []) {
    const key = normalise(p.name)
    byName.set(key, byName.has(key) ? null : p.id)
    const ids = sharedBy.get(key) ?? new Set<number>()
    ids.add(p.id)
    sharedBy.set(key, ids)
    normalisedKnown.push([key, p.id])
  }
  const knownIds = new Set((known ?? []).map((p) => p.id))

  /**
   * **FPL truncates a long shirt name on the card, and the card is all the
   * picture has** (found live 2026-09-15). "Calvert-Le…" is what is printed, so
   * "Calvert-Le…" is what an honest read reports — and it matches no player,
   * because no player is called that. The whole upload failed on it.
   *
   * Correcting it is code's job and not the model's: we ask for the name
   * character for character precisely so that a reader never expands a
   * half-name into a player it half-recognises. So the expansion happens here,
   * against the real list, and **only where exactly one player's name begins
   * that way** — two candidates is a coin toss and resolves to neither.
   *
   * This runs only after an exact match has already failed, so a name that is
   * genuinely someone's full name can never be re-read as the start of a longer
   * one. Short fragments are refused outright: four characters is the floor.
   */
  const MIN_PREFIX = 4
  const byPrefix = (key: string): number | null => {
    if (key.length < MIN_PREFIX) return null
    const hits = new Set(normalisedKnown.filter(([name]) => name.startsWith(key)).map(([, id]) => id))
    return hits.size === 1 ? ((hits.values().next().value as number) ?? null) : null
  }

  const resolve = (entry: { playerId?: unknown; name?: unknown }): number | null => {
    const id = entry.playerId
    const validId =
      typeof id === 'number' && Number.isInteger(id) && (knownIds.size === 0 || knownIds.has(id)) ? id : null

    // No list to check against: the id is all there is.
    if (knownIds.size === 0) return validId

    const key = typeof entry.name === 'string' ? normalise(entry.name) : ''
    // No player answers to it whole. It may be the start of one — a card the
    // app ran out of room on.
    if (!byName.has(key)) return byPrefix(key)

    const byThatName = byName.get(key)
    // One player with that name: the name settles it, whatever the id said.
    if (byThatName !== null && byThatName !== undefined) return byThatName

    // Shared by several — the one case only the id can settle, and only if it
    // is one of them.
    return validId !== null && sharedBy.get(key)?.has(validId) === true ? validId : null
  }
  const players = raw.team?.players ?? []

  const fromTeam = players.map((p) => ({ ...p, resolvedId: resolve(p) }))

  /**
   * **The second reading, and what it is allowed to do.**
   *
   * The Transfers screen shows the same fifteen shirts, so it is a second,
   * independent look at who is in the squad — and the two readings miss
   * different players, because neither is deterministic. Where the Team read
   * comes back one short, the other picture almost always has the one it lost.
   *
   * **It recovers, it never rejects.** A name the Transfers read did not see is
   * not evidence against a name the Team read did: that would be a new way for
   * a good upload to fail, and this feature has had enough of those. The only
   * thing it can do is fill a gap.
   *
   * **And only when the filling is forced, never guessed.** One player missing
   * and exactly one name the other picture has that this one does not is a
   * single possible answer. Two of each is a choice between two arrangements,
   * and a coin toss dressed as a match is what the all-or-nothing rule exists
   * to stop — so two missing still fails, and says so.
   */
  const resolved = withSecondReading(
    fromTeam,
    (raw.transfers?.players ?? []).map((p) => resolve(p)).filter(isPlayerId),
  )

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

    // **Say whether the other picture was any help**, because after tonight the
    // next question is always which of the two readings fell short. Only when
    // there was a second reading to speak of.
    const secondHelped =
      (raw.transfers?.players ?? []).length > 0 ? ', and the Transfers screenshot did not make up the difference' : ''

    const because =
      reported === SQUAD_SIZE
        ? `all ${String(SQUAD_SIZE)} players were read, but ${unplaced.join(', ')} could not be matched to a known player — that is our end, not your picture`
        : `only ${String(legible.length)} of ${String(SQUAD_SIZE)} players legible on the Team screenshot${secondHelped}`
    return { ok: false, failure: { screen: 'team', because } }
  }

  // **A squad with no chip row is a failed Team read, not an empty chip row.**
  // Every FPL team has one, so its absence means the picture was not the Team
  // screen — and an empty row would silently tell the manager he has none left.
  const chips = raw.team?.chips
  if (!Array.isArray(chips) || chips.length === 0) {
    return { ok: false, failure: { screen: 'team', because: 'the chips row was not found on the Team screenshot' } }
  }

  /**
   * **The bench order is a ranking, and it is derived rather than demanded.**
   *
   * Requiring the read to emit four distinct integers made it the one thing
   * standing between a correct fifteen and a refused upload: every name matched
   * and the whole thing failed on "the bench order was not legible"
   * (2026-09-15). Reading *which four are on the bench and in what order* is
   * the job; producing 0, 1, 2, 3 without repeating itself is bookkeeping, and
   * bookkeeping is code's.
   *
   * So the four substitutes are ranked by whatever the read reported, and where
   * it reported the same number twice the order they were listed in decides —
   * which is the order they appear on the screen, and therefore the answer.
   */
  const bench = legible
    .map((p, index) => ({ p, index, order: typeof p.benchOrder === 'number' ? p.benchOrder : index }))
    .filter((e) => e.p.isStarter !== true)
    .sort((a, b) => a.order - b.order || a.index - b.index)

  const benchRank = new Map(bench.map((e, rank) => [e.index, rank as 0 | 1 | 2 | 3]))

  const squad: SquadPlayer[] = legible.map((p, index) => ({
    playerId: p.resolvedId as number,
    isStarter: p.isStarter as boolean,
    benchOrder: p.isStarter === true ? null : (benchRank.get(index) ?? null),
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

  // **Four on the bench, or the eleven above was not really eleven.** The
  // ranking itself can no longer fail; only the count can.
  if (bench.length !== BENCH_SIZE) {
    return {
      ok: false,
      failure: {
        screen: 'team',
        because: `${String(bench.length)} players read as substitutes on the Team screenshot, where a squad has ${String(BENCH_SIZE)}`,
      },
    }
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
