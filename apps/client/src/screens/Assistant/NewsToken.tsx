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

import { useEffect, useRef, useState } from 'react'
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
  const wrap = useRef<HTMLDivElement>(null)

  /**
   * **A transient surface has to be leavable** (STE-182). Until this, the panel
   * closed only by finding the badge again — a small target beside the wordmark
   * — while tapping the page, scrolling or switching tabs all left it sitting
   * there. Every other transient surface in the app can be left.
   *
   * **The dismissing tap dismisses and nothing else.** It is caught on the
   * document in the capture phase and stopped there, so a tap that lands on a
   * call card closes the panel without also opening that card. The opposite is
   * defensible, but underneath this panel is a list of cards that navigate, and
   * opening one by accident while reaching to dismiss is the worse failure.
   *
   * **`click`, not `pointerdown`, on purpose.** `click` is what activates a
   * control, so stopping it is what prevents the accidental navigation —
   * and, unlike swallowing a pointer event, it leaves scrolling untouched.
   *
   * **The listeners exist only while the panel does.** A document listener left
   * behind runs on every subsequent tap in the app for a panel that is not
   * there — the sort of thing no test catches and that slowly makes a screen
   * feel heavy.
   *
   * It starts no run (F8-AC-19): dismissing is not the action inside the panel.
   */
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrap.current?.contains(e.target as Node) === true) return
      e.stopPropagation()
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (flagged.length === 0) return null
  void since

  return (
    <div className={styles.wrap} ref={wrap}>
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
