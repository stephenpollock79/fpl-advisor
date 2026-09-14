/**
 * Gameweeks, and the two flags that are pure foot-guns.
 *
 * Pure: payload in, rows out. No fetch, no clock, no database — which is what
 * makes the rules below testable against fabricated feeds rather than against
 * whatever the season happens to be doing today.
 */

export type GameweekRow = {
  id: number
  name: string
  deadlineTime: string
  isNext: boolean
  isCurrent: boolean
  finished: boolean
  dataChecked: boolean
}

type EventPayload = {
  id: number
  name: string
  deadline_time: string
  is_next: boolean
  is_current: boolean
  finished: boolean
  data_checked: boolean
}

export function toGameweekRows(bootstrap: { events: EventPayload[] }): GameweekRow[] {
  return bootstrap.events.map((e) => ({
    id: e.id,
    name: e.name,
    deadlineTime: e.deadline_time,
    isNext: e.is_next,
    isCurrent: e.is_current,
    finished: e.finished,
    dataChecked: e.data_checked,
  }))
}

/**
 * The gameweek every piece of advice is about.
 *
 * **`is_next`, never `is_current`.** The feed keeps marking a gameweek current
 * until the following one locks, so while a deadline is unpassed `is_current` is
 * a week already played. Observed live on 2026-09-09: `is_current` 3 and
 * `is_next` 4 at the same moment. Keying off the wrong one produces confident
 * advice about the wrong week, every week, with nothing visibly broken.
 *
 * Throws rather than guessing. Advising on a fallback gameweek is worse than not
 * advising, because it looks identical to advising correctly.
 */
export function gameweekToAdviseOn(rows: GameweekRow[]): GameweekRow {
  const next = rows.find((r) => r.isNext)
  if (!next) {
    throw new Error(
      'No gameweek is flagged is_next. Refusing to fall back to is_current, which is a week already played.',
    )
  }
  return next
}

/**
 * The most recent gameweek whose points have settled.
 *
 * **`data_checked`, not `finished`.** `finished` flips when the last match ends;
 * bonus points and corrections land afterwards. A total read from `finished`
 * changes under the manager a few hours later, which reads as the app being wrong
 * rather than the feed being early.
 *
 * Null when nothing has settled yet — the opening weeks of a season, and the
 * window between the last whistle and the bonus points.
 */
export function lastScoredGameweek(rows: GameweekRow[]): GameweekRow | null {
  const scored = rows.filter((r) => r.dataChecked)
  if (scored.length === 0) return null
  return scored.reduce((latest, r) => (r.id > latest.id ? r : latest))
}

/**
 * The most recent gameweek whose **deadline** has passed — the newest squad FPL
 * will disclose.
 *
 * **A different question from `lastScoredGameweek`, and the two must not share a
 * rule.** Points settle late: bonus and corrections land hours after the last
 * whistle, so a total is read from `data_checked`. **Picks settle early:** they
 * lock the instant the deadline passes and never move again, so the squad is
 * read from the deadline.
 *
 * Until 2026-09-14 this used `data_checked`, and F1's own happy path says *the
 * squad as at the last completed deadline*. **The two agreed every day the app
 * had been alive**, because it had never been open across a deadline — the first
 * time it was, it showed a squad a whole gameweek out of date, with a correct
 * deadline above it and nothing on screen suggesting anything was wrong.
 *
 * Null before the season's first deadline, when there is no squad to read.
 */
export function lastCompletedDeadline(rows: GameweekRow[], nowMs: number): GameweekRow | null {
  const passed = rows.filter((r) => {
    const at = Date.parse(r.deadlineTime)
    return Number.isFinite(at) && at <= nowMs
  })
  if (passed.length === 0) return null
  return passed.reduce((latest, r) => (r.id > latest.id ? r : latest))
}
