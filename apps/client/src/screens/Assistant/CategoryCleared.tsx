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

const CHIP: Record<ClearedRow['state'], string> = {
  selected: 'SELECTED ▾',
  rejected: 'REJECTED ▾',
  reopened: 'PENDING REVIEW ▾',
}

export function CategoryCleared({
  noun,
  rows,
  reopened,
  onToggle,
  onReview,
}: {
  noun: string
  rows: ClearedRow[]
  reopened: number
  onToggle: (key: string) => void
  onReview: () => void
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
    </div>
  )
}
