/**
 * F3-AC-17, F3-AC-18 — the price half of the WATCH flag.
 *
 * WATCH is set by code when an input a call rests on is about to move. Here the
 * input is money: FPL forecasts each player's price change for tonight with a
 * likelihood from −5 to +5, and at the strongest level the price is expected to
 * move before the manager's next chance to act. A transfer's cost depends on it,
 * so acting today or waiting until tomorrow changes what the transfer costs.
 *
 * **Transfers only.** A substitution or an armband call moves no money.
 * **Never from conviction, and it never changes the figure** (F3-AC-18) — nothing
 * here sees net, conviction or band.
 * **No clock in the engine** (ADR 0006): whether FPL has locked a player's price is
 * decided by the caller, who has one, and handed in.
 *
 * The reason avoids the word "likely": the card keeps probability vocabulary away
 * from the strength figure beside it (ENGINE-AC-05).
 */

export type PriceSignal = {
  /** FPL's likelihood of a change tonight, −5 to +5. Null where FPL publishes none. */
  readonly likelihoodTonight: number | null
  /** FPL has locked this player's price after a recent change. */
  readonly locked: boolean
}

/** The strongest level FPL publishes — its "very likely". Below it, no flag. */
export const WATCH_LIKELIHOOD = 5

/** FPL's price changes are one tenth of £1m. */
const STEP = '£0.1m'

const moving = (s: PriceSignal): 'rise' | 'fall' | null => {
  if (s.locked || s.likelihoodTonight === null) return null
  if (s.likelihoodTonight >= WATCH_LIKELIHOOD) return 'rise'
  if (s.likelihoodTonight <= -WATCH_LIKELIHOOD) return 'fall'
  return null
}

/**
 * The reason WATCH is set on a transfer, or null when it is not. The incoming
 * player is read first: what the manager is about to pay is the figure most
 * directly moved.
 */
export const priceWatch = (
  out: PriceSignal & { readonly name: string },
  into: PriceSignal & { readonly name: string },
): string | null => {
  const buying = moving(into)
  if (buying === 'rise') return `FPL expects ${into.name}'s price to rise tonight — buying today avoids paying ${STEP} more.`
  if (buying === 'fall') return `FPL expects ${into.name}'s price to fall tonight — buying tomorrow would cost ${STEP} less.`

  const selling = moving(out)
  if (selling === 'fall') return `FPL expects ${out.name}'s price to fall tonight — selling today avoids losing ${STEP}.`
  if (selling === 'rise') return `FPL expects ${out.name}'s price to rise tonight — selling tomorrow may return more.`

  return null
}
