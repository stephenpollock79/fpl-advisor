/**
 * The news-alert token (F8-AC-13 – F8-AC-19).
 *
 * **The only thing in the product that tells the manager the world has moved**
 * (F8-AC-14). Without it the second customer job depends on him guessing when
 * to refresh, which is the failure that job exists to remove.
 *
 * Three rules it would be easy to break and hard to notice:
 *
 * - **It never fires a run on its own** (F8-AC-19). It is a count and a tooltip;
 *   the only thing that starts a run is the manager tapping the action inside it.
 * - **That action always runs at every scope** (F8-AC-16, F6-AC-09), because new
 *   team news is squad-wide and a scoped run would half-clear the token.
 * - **It clears only when a run consumes the news** (F8-AC-17) — which is not
 *   this component's doing. The count is derived server-side from the gap
 *   between the newest feed read and the read the last run saw, so a finished
 *   run closes the gap and the token disappears on the next read. Nothing here
 *   dismisses it, and nothing should.
 */

import { useState } from 'react'
import type { Flagged } from '../../calls/week'
import styles from './NewsToken.module.css'

type Props = {
  flagged: Flagged[]
  /** When the last successful run finished. */
  since: string | null
  /** Always an all-scope run (F8-AC-16). */
  onRefreshAll: () => void
  disabled: boolean
}

export function NewsToken({ flagged, since, onRefreshAll, disabled }: Props) {
  const [open, setOpen] = useState(false)
  if (flagged.length === 0) return null
  void since

  return (
    <div className={styles.wrap}>
      <button
        className={styles.token}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${String(flagged.length)} players flagged since the last run`}
        data-testid="news-token"
        type="button"
      >
        {flagged.length}
      </button>

      {open ? (
        <div className={styles.tip} role="dialog" aria-label="Squad news" data-testid="news-tooltip">
          {flagged.map((f) => (
            <p key={f.playerId} className={styles.verdict}>
              {f.verdict}
            </p>
          ))}
          <button
            className={styles.refreshAll}
            onClick={() => {
              setOpen(false)
              onRefreshAll()
            }}
            disabled={disabled}
            data-testid="news-refresh"
            type="button"
          >
            Refresh everything
          </button>
        </div>
      ) : null}
    </div>
  )
}
