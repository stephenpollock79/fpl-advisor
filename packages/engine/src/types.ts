/**
 * The engine's vocabulary.
 *
 * Nothing in this package may import a runtime type surface — `lib` is ES2022
 * and `types` is empty, so `window`, `document`, `process` and `fs` are compile
 * errors here (ADR 0006). That is what makes the engine testable before any
 * consumer exists, which is the whole reason it is a package and not a folder.
 */

/** The five things a call can be. Bench order sits inside the substitution
 *  category for display (F3-AC-05) but is its own shape in the arithmetic. */
export type CallType = 'transfer' | 'substitution' | 'bench_order' | 'captain' | 'vice'

/** The conviction band. Always shown with the figure, never instead of it, and
 *  never labelled as a probability (ENGINE-AC-05). */
export type Band = 'certain' | 'strong' | 'lean' | 'thin'

export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD'

/** FPL's own status letter, carried through unchanged. */
export type FplStatus = 'a' | 'd' | 'i' | 's' | 'u' | 'n'

export type ExclusionReason =
  | 'injured'
  | 'suspended'
  | 'unavailable'
  | 'not_in_squad'
  | 'serious_doubt'

export type AvailabilityInput = {
  readonly status: FplStatus
  /** FPL's percentage, or null where it publishes none. */
  readonly chanceOfPlayingNextRound: number | null
}

/** The gate's verdict. It carries no number, deliberately: eligibility is a
 *  precedence rule, and a precedence rule needs no knowledge of what the other
 *  source's figure already contains (ENGINE-AC-02). */
export type AvailabilityVerdict =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: ExclusionReason }

/** What makes a call *the same call* across runs. A decision belongs to this,
 *  not to a call row, because the call row is rewritten every run
 *  (architecture.md §5). */
export type CallIdentity =
  | { readonly type: 'transfer'; readonly outPlayerId: number; readonly inPlayerId: number }
  | {
      readonly type: 'substitution'
      /** `upgrade` is a fit starter for a better bench player — neither forced
       *  nor doubt, and GW4's biggest substitution (ruled 2026-09-11, STE-116). */
      readonly variant: 'forced' | 'doubt' | 'upgrade'
      readonly outPlayerId: number
      readonly inPlayerId: number
    }
  | { readonly type: 'bench_order'; readonly slotA: number; readonly slotB: number }
  | { readonly type: 'captain'; readonly fromPlayerId: number; readonly toPlayerId: number }
  | { readonly type: 'vice'; readonly fromPlayerId: number; readonly toPlayerId: number }

/** One side of a call. `projections` are the feed's own figures, one per
 *  gameweek in the horizon, and a club with no fixture contributes zero — the
 *  caller resolves that from the fixture table, never from the projection. */
export type Side = {
  readonly playerId: number
  readonly projections: readonly number[]
  readonly availability: AvailabilityVerdict
}

export type Money = {
  readonly incomingPriceTenths: number
  readonly outgoingSellingPriceTenths: number
}

export type CallInput = {
  readonly identity: CallIdentity
  readonly incumbent: Side
  readonly challenger: Side
  /** Subtracts directly from net, on the call that incurs it. */
  readonly pointsHit?: number
  /** Triple Captain moves two extra copies rather than one, so the net doubles. */
  readonly tripleCaptain?: boolean
  /** Required on a transfer, meaningless on everything else. */
  readonly money?: Money
  /**
   * The incumbent cannot score this week for a reason the availability gate
   * does not see — his club has no fixture. The caller states it from the
   * fixture table, never from the projection, and it makes the call forced
   * exactly as a gate exclusion does (F3-AC-03, "an unplayable starter").
   */
  readonly incumbentUnplayable?: boolean
}

type Totals = {
  readonly type: CallType
  readonly key: string
  readonly net: number
  readonly incumbentTotal: number
  readonly challengerTotal: number
}

/** The two cases that resolve to keeping what is there. Neither carries a
 *  percentage, so neither can be rendered as a weak change (F4-AC-02). */
export type NoChangeReading = Totals & {
  readonly reading: 'no_change'
  readonly reason: 'incumbent_wins' | 'below_floor'
}

export type CallReading = Totals & {
  readonly reading: 'call'
  readonly conviction: number
  readonly band: Band
  readonly k: number
  readonly pointsHit: number
  readonly costTenths: number
  readonly isForced: boolean
  readonly recommendsPlayerId: number
}

export type CallOutcome = NoChangeReading | CallReading

export type ArmbandCandidate = {
  readonly playerId: number
  readonly projection: number
  readonly availability: AvailabilityVerdict
  readonly takesPenalties: boolean
  readonly position: Position
}

export type Armband = {
  readonly captainId: number
  readonly viceId: number
  readonly captainByCeiling: boolean
  readonly viceByCeiling: boolean
}

export type BenchCandidate = {
  readonly playerId: number
  readonly projection: number
  readonly availability: AvailabilityVerdict
}
