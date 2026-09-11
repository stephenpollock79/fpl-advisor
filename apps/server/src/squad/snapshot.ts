/**
 * The manager's fifteen, as at the last completed deadline.
 *
 * Read from FPL's **public** endpoints by team id — `entry/{id}/event/{gw}/picks/`
 * for the squad and `entry/{id}/history/` for the chips. The manager's FPL account
 * is never read, no credentials exist, and nothing here writes to FPL (F7-AC-13).
 *
 * Pure: payloads in, rows out.
 */

export type SquadPlayer = {
  playerId: number
  isStarter: boolean
  /** 0 for the substitute goalkeeper, then 1, 2, 3 outfield. Null for a starter. */
  benchOrder: 0 | 1 | 2 | 3 | null
  isCaptain: boolean
  isVice: boolean
}

type Pick = {
  element: number
  position: number
  is_captain: boolean
  is_vice_captain: boolean
}

/** The first bench position FPL uses. 1–11 start; 12 is the substitute keeper. */
const FIRST_BENCH_POSITION = 12

/**
 * The fifteen, with the bench in the fixed order F1-AC-02 requires.
 *
 * The order is not "whatever the feed sent" — it is positional. Confirmed against
 * the live endpoint on 2026-09-09: position 12 carries `element_type` 1, the
 * substitute goalkeeper, and 13 to 15 do not.
 *
 * Throws on a squad that is not fifteen, or that has no captain. A short or
 * headless read is a broken read, and storing it would put a squad on screen that
 * the manager does not have — worse than failing loudly, because it looks right.
 */
export function toSquadPlayers(picks: Pick[]): SquadPlayer[] {
  if (picks.length !== 15) {
    throw new Error(`Expected fifteen picks, got ${picks.length}. Refusing a partial squad.`)
  }

  const players = [...picks]
    .sort((a, b) => a.position - b.position)
    .map((p) => {
      const isStarter = p.position < FIRST_BENCH_POSITION
      return {
        playerId: p.element,
        isStarter,
        benchOrder: isStarter ? null : ((p.position - FIRST_BENCH_POSITION) as 0 | 1 | 2 | 3),
        isCaptain: p.is_captain,
        isVice: p.is_vice_captain,
      }
    })

  if (!players.some((p) => p.isCaptain)) {
    throw new Error('No captain in the squad. Refusing a read that cannot be advised on.')
  }

  return players
}

/** The four chips, by FPL's own names. */
export const CHIP_NAMES = ['wildcard', 'freehit', 'bboost', '3xc'] as const
export type ChipName = (typeof CHIP_NAMES)[number]

type History = {
  chips: { name: string; event: number }[]
  current: { event: number; event_transfers: number }[]
}

/**
 * Each chip as available or spent (F1-AC-08).
 *
 * Spent means it appears in the history. Absence is the only signal available and
 * it is sufficient: FPL lists a chip once it has been played.
 */
export function chipsRemaining(history: History): Record<ChipName, 'available' | 'spent'> {
  const played = new Set(history.chips.map((c) => c.name))
  return Object.fromEntries(
    CHIP_NAMES.map((name) => [name, played.has(name) ? 'spent' : 'available']),
  ) as Record<ChipName, 'available' | 'spent'>
}

/** One free transfer earned per gameweek, carried over, capped. */
const FREE_TRANSFER_CAP = 5

/** Chips that grant unlimited transfers, so the gameweek's transfers cost nothing. */
const UNLIMITED_TRANSFER_CHIPS = new Set(['wildcard', 'freehit'])

/**
 * How many free transfers the manager has going into `gameweek` (F1-AC-07).
 *
 * **This is derived, not read.** No public FPL endpoint reports the remaining
 * balance — `picks` and `history` both give transfers *made* per gameweek and
 * never the balance. So it is reconstructed: one earned each gameweek after the
 * first, minus those used, carried over, capped at five.
 *
 * **That makes it wrong quietly if FPL changes the rule**, which they have: the
 * cap was two until 2024/25. A figure that is silently stale is exactly the class
 * of failure this project keeps designing against, so the honest reading is that
 * this is a best effort until it can be corrected from a source that states it —
 * the F2 screenshot displays it, and that arrives in slice 9.
 *
 * A wildcard or free hit gameweek grants unlimited transfers, so its transfers are
 * not deducted. Reading them as spent would show fewer transfers than the manager
 * has, every week after a wildcard.
 */
export function freeTransfersRemaining(history: History, gameweek: number): number {
  const unlimited = new Set(
    history.chips.filter((c) => UNLIMITED_TRANSFER_CHIPS.has(c.name)).map((c) => c.event),
  )

  let balance = 0
  for (const week of history.current.filter((w) => w.event < gameweek)) {
    // Earned at the start of every gameweek after the first — the opening squad
    // is free, so nothing accrues before gameweek two.
    if (week.event > 1) balance += 1
    if (!unlimited.has(week.event)) balance -= week.event_transfers
    balance = Math.min(FREE_TRANSFER_CAP, Math.max(0, balance))
  }

  // The gameweek being advised on earns its own transfer too.
  if (gameweek > 1) balance += 1
  return Math.min(FREE_TRANSFER_CAP, Math.max(0, balance))
}

/** One row of FPL's public `entry/{id}/transfers/`, narrowed to what is read. */
export type TransferRecord = {
  element_in: number
  element_in_cost: number
  event: number
}

/** What bootstrap-static says about a player's price now and since gameweek 1. */
export type PriceNow = { nowCostTenths: number; costChangeStartTenths: number }

/**
 * What the manager paid for each player (F3-AC-26), ruled on STE-87.
 *
 * The latest `element_in_cost` from `entry/{id}/transfers/` wins — a player sold
 * and bought back was bought at the second price. A player with no transfer has
 * been held since gameweek 1, and paid `now_cost − cost_change_start`.
 *
 * **Free Hit gameweeks are skipped.** The squad reverts afterwards, so the
 * transfers recorded against one were never really made and name prices for
 * players no longer held at them. A Wildcard's transfers are real and count.
 *
 * Null where the feed does not price the player at all: an unknown is shown as
 * one, never guessed at, because the selling price derived from it moves money.
 */
export function purchasePrices(
  playerIds: number[],
  transfers: TransferRecord[],
  chips: { name: string; event: number }[],
  prices: Map<number, PriceNow>,
): Map<number, number | null> {
  const freeHits = new Set(chips.filter((c) => c.name === 'freehit').map((c) => c.event))

  const paid = new Map<number, { event: number; cost: number }>()
  for (const t of transfers) {
    if (freeHits.has(t.event)) continue
    const previous = paid.get(t.element_in)
    if (!previous || t.event >= previous.event) paid.set(t.element_in, { event: t.event, cost: t.element_in_cost })
  }

  return new Map(
    playerIds.map((id) => {
      const bought = paid.get(id)
      if (bought) return [id, bought.cost]
      const price = prices.get(id)
      return [id, price ? price.nowCostTenths - price.costChangeStartTenths : null]
    }),
  )
}
