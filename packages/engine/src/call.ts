/**
 * ENGINE-AC-04 — the one function that produces net, conviction and band.
 *
 * Both F3 and F4 call this, and neither recomputes any of the three. If a
 * feature needs a difference it is a parameter here, never a second
 * implementation somewhere else — two implementations is how two surfaces come
 * to disagree about the same call.
 *
 * The order of the four decisions below is the substance, not a style:
 *
 *   1. A challenger the gate excluded cannot be recommended at all, so he never
 *      reaches the arithmetic (ENGINE-AC-02).
 *   2. An incumbent the gate excluded makes the call *forced*, and a forced call
 *      is produced whatever the figure says — suppression does not apply to it
 *      (F6-AC-05), and the flag is never derived from conviction (F3-AC-18).
 *   3. The winning side *is* the recommendation, so a losing challenger resolves
 *      to keeping what is there rather than to a negative net.
 *   4. A win too small to distinguish is a reading, not a weak call.
 */
import { round2 } from './constants.js'
import { bandOf, convictionOf, isBelowFloor, kFor } from './conviction.js'
import { callKey } from './call-key.js'
import { horizonTotal, horizonWeightsFor } from './effective.js'
import { transferCostTenths } from './money.js'
import type { CallInput, CallOutcome, Money } from './types.js'

const costOf = (type: CallInput['identity']['type'], money: Money | undefined): number => {
  // Cost applies to transfers only. A substitution and a captaincy call move no
  // money and no transfer, so each reads £0.00 — never a difference between two
  // prices the manager already owns (F3-AC-28).
  if (type !== 'transfer') return 0

  if (money === undefined) {
    throw new Error('a transfer needs an incoming price and an outgoing selling price')
  }

  return transferCostTenths(money.incomingPriceTenths, money.outgoingSellingPriceTenths)
}

export const evaluateCall = (input: CallInput): CallOutcome => {
  const type = input.identity.type

  if (!input.challenger.availability.eligible) {
    throw new Error(
      `a player excluded by the availability gate (${input.challenger.availability.reason}) can never be recommended`,
    )
  }

  const weights = horizonWeightsFor(type)
  const incumbentTotal = horizonTotal(input.incumbent.projections, weights)
  const challengerTotal = horizonTotal(input.challenger.projections, weights)

  // The armband moves one extra copy of a player's points, so its net is the
  // plain difference; with Triple Captain live it moves two, and the net doubles.
  const armband = type === 'captain' || type === 'vice'
  const copies = armband && input.tripleCaptain === true ? 2 : 1

  const pointsHit = input.pointsHit ?? 0
  const net = round2((challengerTotal - incumbentTotal) * copies - pointsHit)

  const shared = { type, key: callKey(input.identity), incumbentTotal, challengerTotal }
  const k = kFor(type)
  const isForced = !input.incumbent.availability.eligible || input.incumbentUnplayable === true

  const asCall = (settledNet: number): CallOutcome => {
    const conviction = convictionOf(settledNet, k)
    return {
      ...shared,
      net: settledNet,
      reading: 'call',
      conviction,
      band: bandOf(conviction),
      k,
      pointsHit,
      costTenths: costOf(type, input.money),
      isForced,
      recommendsPlayerId: input.challenger.playerId,
    }
  }

  if (isForced) {
    // The incumbent cannot play, so the change has to happen. The figure states
    // how much better the replacement is, which may be not at all — the red
    // Forced flag carries the obligation, and clamping at zero keeps a negative
    // away from the curve without pretending the replacement is an upgrade.
    return asCall(Math.max(0, net))
  }

  // Cost is computed even on a no-change reading, so a transfer built without
  // prices fails here rather than on whichever week it first happens to win.
  costOf(type, input.money)

  if (net <= 0) {
    return { ...shared, net, reading: 'no_change', reason: 'incumbent_wins' }
  }

  if (isBelowFloor(convictionOf(net, k))) {
    return { ...shared, net, reading: 'no_change', reason: 'below_floor' }
  }

  return asCall(net)
}
