/**
 * The week, computed once (F8-AC-01 – F8-AC-07).
 *
 * **One list of live calls and one list of flagged players, and everything the
 * editorial states is read off them.** `F8-AC-06` is not a preference: the
 * tally, the headline count and the flagged summary must be *incapable* of
 * disagreeing, and they are only if there is nothing for them to disagree
 * about. So this module returns the lists as well as the lines derived from
 * them, and the card renders what it is given.
 *
 * **Every figure here is code's. Only the prose is the model's** (`F8-AC-08`,
 * architecture §7). That includes the blank-and-double lead: a criterion saying
 * the editorial *must* lead with it (`F8-AC-07`) cannot be satisfied by a
 * prompt, so the sentence is written here and the model's paragraph sits under
 * it.
 */

import type { DecisionState, World, WorldCall, WorldPlayer } from '../api'
import { availabilityFor } from './view'

/** The conviction bands, coldest to hottest — the ramp order the tally reads in. */
const RAMP = ['certain', 'strong', 'lean', 'thin'] as const
export type ConvictionBand = (typeof RAMP)[number]

export type Flagged = {
  playerId: number
  surname: string
  /** The tooltip's one-line verdict (F8-AC-15), built from FPL's own fields. */
  verdict: string
  /** The short form the editorial's summary strings together (F8-AC-05). */
  short: string
}

export type Tally = {
  /**
   * **Read from the call's `isForced`, never from a conviction threshold**
   * (F8-AC-03). Forced is a property of the call and not a strength: the
   * prototype deliberately carries a forced call at 94% and another at 59%.
   */
  forced: number
  /** The remaining calls by band, ramp order, empty bands omitted. */
  bands: { band: ConvictionBand; count: number }[]
}

export type Week = {
  /**
   * Every outstanding call the week actually contains. **A keep reading is not
   * one** (F4-AC-03): it is the app answering *nothing to do*, carries no
   * conviction and no band, and is excluded from the editorial and every tally.
   */
  live: WorldCall[]
  decided: number
  /** "3 of 7 calls decided", or the quiet week's own reading (F8-AC-02, F3-UP-05). */
  decidedLine: string
  tally: Tally
  flagged: Flagged[]
  /** "3 · flagged: Muñoz out, Semenyo 50%, Isak 75%" (F8-AC-05). Null with none. */
  flaggedLine: string | null
  /** Where the week's calls were built from (F8-AC-04). */
  squadStateLine: string
  /** The blank or double lead, stated before anything else (F8-AC-07). */
  exceptionLead: string | null
}

/**
 * **The tally partitions rather than overlaps.** A forced call is counted once,
 * under forced, and not again under its band. Overlapping would let the tally
 * sum past the headline call count on the same card — which is exactly the
 * disagreement `F8-AC-06` exists to make impossible.
 */
function tallyOf(live: WorldCall[]): Tally {
  const forced = live.filter((c) => c.isForced)
  const rest = live.filter((c) => !c.isForced)
  return {
    forced: forced.length,
    bands: RAMP.map((band) => ({ band, count: rest.filter((c) => c.band === band).length })).filter(
      (b) => b.count > 0,
    ),
  }
}

/**
 * What FPL says about a player, said back plainly.
 *
 * **Not written by the model** (ruled 2026-09-15, STE-66). The token fires
 * exactly when team news has landed and no run has consumed it, so prose written
 * during a run would be missing at the only moment the token matters, and
 * writing it on tap would spend outside the gate `F6-RS-08` protects.
 */
function verdictFor(player: WorldPlayer, movedPrice: boolean): { verdict: string; short: string } {
  const gate = availabilityFor(player)
  // The full surname, never the slot-truncated form: this is prose, not a pitch slot.
  const name = player.surname
  const percent = player.chanceOfPlayingNextRound

  if (!gate.eligible) {
    const reason =
      gate.reason === 'injured'
        ? 'out injured'
        : gate.reason === 'suspended'
          ? 'suspended'
          : gate.reason === 'not_in_squad'
            ? 'not in the squad'
            : gate.reason === 'serious_doubt'
              ? `expected to start at ${String(percent ?? 0)}%`
              : 'unavailable'
    return {
      verdict: `${name} — ${reason}, so he is out of the reckoning this week`,
      short: `${name} out`,
    }
  }

  if (percent !== null && percent < 100) {
    return {
      verdict: `${name} — expected to start at ${String(percent)}%, keep him in the team`,
      short: `${name} ${String(percent)}%`,
    }
  }

  if (movedPrice) {
    return {
      verdict: `${name} — his price moved, and nothing about his availability did`,
      short: `${name} price`,
    }
  }

  return { verdict: `${name} — back available, and picked as normal`, short: `${name} fit` }
}

/**
 * Where this week's calls were built from (F8-AC-04).
 *
 * **This line is what makes the freshness differentiator true**, so it names the
 * source rather than describing it in general terms — and it reads the snapshot
 * rather than deriving a gameweek of its own, because a derived one could
 * disagree with the squad it is describing.
 */
function squadStateLineOf(snapshot: World['snapshot']): string {
  // **Singular, as `squad_snapshot`'s check constraint has it.** This read
  // `screenshots` from 2026-09-15 until the same evening, so the branch could
  // never fire and the editorial went on naming the deadline after an upload.
  if (snapshot.source === 'screenshot') {
    const at = new Date(snapshot.capturedAt)
    const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    return `built from the squad screenshots you uploaded at ${time}`
  }
  // **`?? null`, not `=== null`.** A snapshot written before slice 7 carries no
  // gameweek at all, and reading `undefined` through `String()` put
  // "GW undefined" on the entry screen — visible to nobody writing the code and
  // to everybody using it.
  const week = snapshot.picksFrom ?? null
  return week === null
    ? 'built from your squad as at the last deadline'
    : `built from your squad as at the GW${String(week)} deadline`
}

/**
 * The blank or double lead (F8-AC-07), with its consequence stated rather than
 * left to be inferred from where a call sits in a list (F3-AC-06).
 */
function exceptionLeadOf(world: World): string | null {
  if (world.blanks > 0) {
    return world.blanks === 1
      ? 'One of your clubs has no fixture this week. Your bench order is now the most important substitution you make — an auto-substitution is the only cover a blanking starter has.'
      : `${String(world.blanks)} of your clubs have no fixture this week. Your bench order is now the most important substitution you make — an auto-substitution is the only cover a blanking starter has, and if the bench blanks too there is nothing to cover with.`
  }
  if (world.doubles > 0) {
    return world.doubles === 1
      ? 'One of your clubs plays twice this week. A double is when your chip plan earns the most, so it is worth looking at before you spend a transfer.'
      : `${String(world.doubles)} of your clubs play twice this week. A double is when your chip plan earns the most, so it is worth looking at before you spend a transfer.`
  }
  return null
}

export function weekOf(world: World, decisions: Record<string, DecisionState>): Week {
  const live = world.calls.filter((c) => !c.isReading)
  const decided = live.filter((c) => decisions[c.key] !== undefined).length

  const byId = new Map(world.players.map((p) => [p.playerId, p]))
  const flagged: Flagged[] = (world.news?.flagged ?? []).flatMap((f) => {
    const player = byId.get(f.playerId)
    if (!player) return []
    const { verdict, short } = verdictFor(player, f.fields.length === 1 && f.fields[0] === 'price')
    return [{ playerId: f.playerId, surname: player.surname, verdict, short }]
  })

  return {
    live,
    decided,
    decidedLine:
      live.length === 0
        ? 'no calls this week'
        : `${String(decided)} of ${String(live.length)} call${live.length === 1 ? '' : 's'} decided`,
    tally: tallyOf(live),
    flagged,
    flaggedLine:
      flagged.length === 0 ? null : `${String(flagged.length)} · flagged: ${flagged.map((f) => f.short).join(', ')}`,
    squadStateLine: squadStateLineOf(world.snapshot),
    exceptionLead: exceptionLeadOf(world),
  }
}
