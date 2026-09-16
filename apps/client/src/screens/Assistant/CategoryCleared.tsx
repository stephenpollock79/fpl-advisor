/**
 * Category cleared (F3-AC-12, F3-AC-14, F3-AC-15).
 *
 * Shown when nothing in the category is left pending. **Every decided row is a
 * two-way control**: one tap returns the call to pending review, a second
 * restores the decision it had. The line beneath the list reports the live
 * state rather than describing the gesture — a label that promises an
 * interaction has to perform one.
 */

import { clearedLine } from '../../calls/view'
import styles from './Assistant.module.css'

export type ClearedRow = { key: string; title: string; state: 'selected' | 'rejected' | 'reopened' }

/**
 * **A selected call reads *selected · locked*** (F6-AC-02), so it is clear why it
 * did not change when everything around it did. A refresh keeps it and plans
 * around it; without the word the manager would read an unchanged call as one
 * the refresh overlooked.
 */
const CHIP: Record<ClearedRow['state'], string> = {
  selected: 'SELECTED · LOCKED ▾',
  rejected: 'REJECTED ▾',
  reopened: 'PENDING REVIEW ▾',
}

export function CategoryCleared({
  noun,
  rows,
  reopened,
  outstanding,
  onToggle,
  onReview,
  onOverview,
  onGo,
}: {
  noun: string
  rows: ClearedRow[]
  reopened: number
  /**
   * **What is left everywhere else** (STE-165). The screen used to stop after
   * the decided rows, leaving about 55% of the phone blank — and emptiness on a
   * phone reads as a page that failed to load rather than a job finished. It is
   * also the screen reached by *succeeding*, which is a poor moment to look
   * broken.
   */
  outstanding: { category: string; noun: string; count: number }[]
  onToggle: (key: string) => void
  onReview: () => void
  onOverview: () => void
  onGo: (category: string) => void
}) {
  const decided = rows.filter((r) => r.state !== 'reopened').length

  return (
    <div className={styles.cleared}>
      <div className={styles.clearedHead}>
        <span className={styles.clearedTitle}>{noun} decided</span>
        <span className={styles.clearedSub}>
          {decided} {decided === 1 ? 'CALL' : 'CALLS'} DECIDED · {reopened === 0 ? 'NOTHING PENDING' : `${String(reopened)} REOPENED`}
        </span>
      </div>

      <div className={styles.clearedRows}>
        {rows.map((row) => (
          <button
            key={row.key}
            className={`${styles.clearedRow} ${row.state === 'rejected' ? styles.dimmed : ''}`}
            onClick={() => onToggle(row.key)}
            type="button"
          >
            <span className={styles.clearedRowTitle}>{row.title}</span>
            <span className={styles[`chip_${row.state}`]}>{CHIP[row.state]}</span>
          </button>
        ))}
      </div>

      <p data-testid="cleared-line" className={styles.clearedLine}>
        {clearedLine(reopened)}
      </p>

      {reopened > 0 ? (
        <button className={styles.primary} onClick={onReview} type="button">
          Review {reopened} reopened
        </button>
      ) : null}

      {/**
        * **The space carries work, or a route to work** — never a congratulation
        * and never an illustration. Both of these are things the screen already
        * knew and was not saying: the counts are on the tab strip a few pixels
        * above, and the Overview is where a decided week is read whole.
        */}
      <div className={styles.onward}>
        {outstanding.length > 0 ? (
          <>
            <span className={styles.onwardLabel}>Still to decide</span>
            {outstanding.map((o) => (
              <button
                key={o.category}
                className={styles.onwardRow}
                onClick={() => onGo(o.category)}
                type="button"
              >
                <span>{o.noun}</span>
                <span className={styles.onwardCount}>
                  {o.count} {o.count === 1 ? 'call' : 'calls'} →
                </span>
              </button>
            ))}
          </>
        ) : (
          <p className={styles.onwardDone} data-testid="all-decided">
            Every call this week is decided.
          </p>
        )}

        <button className={styles.onwardBack} onClick={onOverview} type="button">
          ← Back to the overview
        </button>
      </div>
    </div>
  )
}
