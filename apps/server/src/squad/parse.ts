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

/** What the model is asked to return, before any of it is trusted. */
export type RawParse = {
  team?: {
    players?: { playerId?: unknown; isStarter?: unknown; benchOrder?: unknown; isCaptain?: unknown; isVice?: unknown }[]
    chipsRemaining?: Record<string, unknown>
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

export function parseSquad(raw: RawParse): ParseResult {
  const players = raw.team?.players ?? []

  const legible = players.filter(
    (p) =>
      isPlayerId(p.playerId) &&
      typeof p.isStarter === 'boolean' &&
      typeof p.isCaptain === 'boolean' &&
      typeof p.isVice === 'boolean',
  )

  if (legible.length !== SQUAD_SIZE) {
    return {
      ok: false,
      failure: {
        screen: 'team',
        because: `only ${String(legible.length)} of ${String(SQUAD_SIZE)} players legible on the Team screenshot`,
      },
    }
  }

  // **A squad with no chip row is a failed Team read, not an empty chip row.**
  // Every FPL team has one, so its absence means the picture was not the Team
  // screen — and an empty row would silently tell the manager he has none left.
  if (raw.team?.chipsRemaining === undefined) {
    return { ok: false, failure: { screen: 'team', because: 'the chips row was not found on the Team screenshot' } }
  }

  const squad: SquadPlayer[] = legible.map((p) => ({
    playerId: p.playerId as number,
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
        Object.entries(raw.team.chipsRemaining).map(([chip, state]) => [chip, String(state)]),
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
