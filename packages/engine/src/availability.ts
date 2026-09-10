/**
 * ENGINE-AC-02 — FPL availability is an exclusion gate applied before scoring,
 * never a coefficient.
 *
 * FPL decides who is eligible; the feed decides what the eligible are worth.
 * The gate exists not because the feed fails to price availability — it prices
 * it fine — but because FPL sometimes knows sooner: thirteen players FPL flagged
 * as injured were projected at full strength on the day this was measured, one
 * of them at his highest figure across six gameweeks while carrying a thigh
 * injury. It is a freshness correction, not a modelling one.
 *
 * Nothing here returns a number, and nothing here sees a projection. Those two
 * facts are the design.
 */
import type { AvailabilityInput, AvailabilityVerdict } from './types.js'

/**
 * The line, ruled 2026-09-10: out, injured, suspended or not in the squad is
 * excluded, and so is a doubt FPL prices at 25% or less.
 *
 * A 50% or 75% doubt stays eligible with the flag shown. Excluding that band
 * would re-create the double-count in gate form — the projection has already
 * discounted the doubt — and it would bar returning players, who are precisely
 * the transfer candidates worth having.
 */
const SERIOUS_DOUBT_AT_OR_BELOW = 25

export const availabilityOf = (input: AvailabilityInput): AvailabilityVerdict => {
  // The hard states are read first, so the reason shown on the card is the real
  // one. An injured player usually carries 0% as well, and "injured" is what the
  // manager needs to see, not "serious doubt".
  switch (input.status) {
    case 'i':
      return { eligible: false, reason: 'injured' }
    case 's':
      return { eligible: false, reason: 'suspended' }
    case 'u':
      return { eligible: false, reason: 'unavailable' }
    case 'n':
      return { eligible: false, reason: 'not_in_squad' }
    default:
      break
  }

  const chance = input.chanceOfPlayingNextRound
  if (chance !== null && chance <= SERIOUS_DOUBT_AT_OR_BELOW) {
    return { eligible: false, reason: 'serious_doubt' }
  }

  // A flag with no percentage against it stays eligible. FPL has not priced the
  // doubt, the feed has already discounted whatever it knows, and the flag
  // itself is shown on the card either way.
  return { eligible: true }
}
