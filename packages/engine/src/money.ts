/**
 * F3-AC-25, F3-AC-28 — what a call costs.
 *
 * Money is an integer in tenths of £1m throughout, matching FPL's own
 * `now_cost`. No float ever holds money, so these functions refuse one rather
 * than rounding it out of sight.
 */
const requireTenths = (value: number, label: string): void => {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of tenths, not ${String(value)}`)
  }
}

/**
 * FPL's selling price: the purchase price plus half of any profit since,
 * rounded down — which can be below the current price, and usually is.
 *
 * A fall is borne in full: a player who has dropped sells for what he is worth
 * now, not for what was paid.
 */
export const sellingPriceTenths = (purchaseTenths: number, currentTenths: number): number => {
  requireTenths(purchaseTenths, 'purchase price')
  requireTenths(currentTenths, 'current price')

  if (currentTenths <= purchaseTenths) return currentTenths

  return purchaseTenths + Math.floor((currentTenths - purchaseTenths) / 2)
}

/** Negative where the change frees cash. A downgrade has a cost, and it is a
 *  credit — never zero, and never an absolute value. */
export const transferCostTenths = (
  incomingPriceTenths: number,
  outgoingSellingPriceTenths: number,
): number => {
  requireTenths(incomingPriceTenths, 'incoming price')
  requireTenths(outgoingSellingPriceTenths, 'outgoing selling price')

  return incomingPriceTenths - outgoingSellingPriceTenths
}
