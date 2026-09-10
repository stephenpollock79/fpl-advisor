/**
 * The deterministic key a decision belongs to (architecture.md §5).
 *
 * A `call` row is thrown away and rewritten by the next run, so a decision
 * cannot belong to one. It belongs to this string, which is built from whatever
 * makes a call *the same call*. Both consumers compute it from the same input,
 * which is why it lives in the engine rather than in either of them.
 */
import type { CallIdentity } from './types.js'

export const callKey = (identity: CallIdentity): string => {
  switch (identity.type) {
    case 'transfer':
      return `transfer:out=${String(identity.outPlayerId)}:in=${String(identity.inPlayerId)}`

    case 'substitution':
      return `substitution:${identity.variant}:out=${String(identity.outPlayerId)}:in=${String(
        identity.inPlayerId,
      )}`

    case 'bench_order': {
      // Ordered, because reordering two slots is one call however it is phrased.
      const low = Math.min(identity.slotA, identity.slotB)
      const high = Math.max(identity.slotA, identity.slotB)
      return `substitution:bench_order:slots=${String(low)},${String(high)}`
    }

    case 'captain':
      return `captaincy:captain:from=${String(identity.fromPlayerId)}:to=${String(
        identity.toPlayerId,
      )}`

    case 'vice':
      return `captaincy:vice:from=${String(identity.fromPlayerId)}:to=${String(
        identity.toPlayerId,
      )}`
  }
}
