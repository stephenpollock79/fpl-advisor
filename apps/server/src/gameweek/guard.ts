/**
 * Is the gameweek we are about to advise on still ahead of us?
 *
 * **A stop, not a prompt** (ruled 2026-09-10, STE-65). A refresh prompt says
 * *there is newer data, want it?* and can reasonably be declined. This says *the
 * week I am advising on has already been played.* There is nothing to weigh, and
 * putting the two in the same dismissible sheet teaches the manager to click past
 * a broken state the same way as a routine one.
 *
 * **This is the failure the whole guard exists for, and it is invisible.** The
 * feed marks a gameweek *current* until the following one locks, so keying off
 * the wrong flag produces confident advice about a week already played, every
 * week, with nothing on screen looking wrong. `is_next` is the one to advise on.
 *
 * A clock comparison and nothing fetched. The engine has no clock (ADR 0006), so
 * `now` is passed in and the check is pure.
 */

export type GameweekGuard =
  | { ok: true }
  | { ok: false; reason: 'deadline_passed'; gameweek: number; deadline: string }
  | { ok: false; reason: 'projections_disagree'; gameweek: number; covered: readonly number[] }

export function checkGameweek(input: {
  gameweek: number
  deadlineTime: string
  /** Which gameweeks the projections file states it covers. Empty means unknown. */
  projectionsCover: readonly number[]
  nowMs: number
}): GameweekGuard {
  const deadline = Date.parse(input.deadlineTime)
  if (Number.isFinite(deadline) && deadline <= input.nowMs) {
    return { ok: false, reason: 'deadline_passed', gameweek: input.gameweek, deadline: input.deadlineTime }
  }

  // The cheaper second form, and a genuinely independent one: the projections
  // file states which gameweeks it covers, so a disagreement means the two data
  // sources contradict each other rather than merely being old. Unknown coverage
  // is not a disagreement — an absent claim proves nothing either way.
  if (input.projectionsCover.length > 0 && !input.projectionsCover.includes(input.gameweek)) {
    return {
      ok: false,
      reason: 'projections_disagree',
      gameweek: input.gameweek,
      covered: [...input.projectionsCover].sort((a, b) => a - b),
    }
  }

  return { ok: true }
}
