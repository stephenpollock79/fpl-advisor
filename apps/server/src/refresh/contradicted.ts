/**
 * The one thing only a squad correction can do: break a lock outright
 * (`F2-AC-07`, `F6-RS-07`).
 *
 * **Pure: the new fifteen and the selected calls in, the keys to break out.**
 *
 * Everywhere else a selected call is a constraint the next run plans around
 * (`F6-AC-01`). A screenshot is the exception, because it is not new evidence
 * about the world — it is what is *true* about the squad. Where the picture
 * contradicts a call the manager selected, the picture wins: the lock is broken
 * and dropped rather than force-kept, and it is reported through the same
 * refresh diff rather than silently vanishing.
 *
 * **Two shapes of contradiction, and only these two.** A call brings a player
 * in and the new squad does not have him; or it takes a player out and the new
 * squad still does. Anything else — a price that moved, a fixture that changed
 * — is ordinary evidence and goes through the ordinary gate.
 */

export type SelectedCall = {
  key: string
  outPlayerId: number
  inPlayerId: number
  /** A captaincy or bench-order call moves nobody in or out of the fifteen. */
  movesSquad: boolean
}

export function contradictedBy(squad: readonly number[], selected: readonly SelectedCall[]): string[] {
  const inSquad = new Set(squad)
  return selected
    .filter((call) => call.movesSquad && (!inSquad.has(call.inPlayerId) || inSquad.has(call.outPlayerId)))
    .map((call) => call.key)
}
