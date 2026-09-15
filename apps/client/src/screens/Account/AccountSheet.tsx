/**
 * The account sheet (F7-AC-21 – F7-AC-26).
 *
 * **It belongs to the screen it was opened from** (F7-AC-23), which is why it is
 * rendered by that screen rather than by the app shell: cancelling returns there
 * untouched because nothing ever left.
 *
 * **Nothing is listed before it works** (F7-AC-22). No disabled rows, no
 * "coming later", and **no settings** — settings are deliberately absent until
 * they do something (F7-AC-26). The only thing here is the one route out of the
 * session, which is a rare and destructive action and therefore belongs here
 * rather than in the Squad screen's thumb-reachable strip.
 *
 * **Log out confirms on a second page of this sheet** (F7-AC-24), never a
 * stacked overlay — and it states what is kept, because the manager should not
 * have to guess whether signing out throws the week away.
 */

import { useState } from 'react'
import { logout } from '../../api'
import avatar from '../../assets/gaffer-avatar.png'
import styles from './AccountSheet.module.css'

/** What the account sheet needs, and the route out of the session (F7-AC-21). */
export type Account = {
  teamName: string | null
  managerName: string | null
  onLoggedOut: () => void
}

type Props = {
  teamName: string | null
  managerName: string | null
  gameweekId: number
  /** Returns to the screen this was opened from, untouched (F7-AC-23). */
  onCancel: () => void
  /** Leaves the session and lands on Landing's Log in tab (F7-AC-25). */
  onLoggedOut: () => void
}

export function AccountSheet({ teamName, managerName, gameweekId, onCancel, onLoggedOut }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setBusy(true)
    setError(null)
    try {
      await logout()
      onLoggedOut()
    } catch {
      setError('Could not sign you out. Try again in a moment.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.scrim} role="dialog" aria-label="Account" data-testid="account-sheet">
      <div className={styles.sheet}>
        <header className={styles.head}>
          <img className={styles.portrait} src={avatar} alt="" />
          <div className={styles.who}>
            <span className={styles.team}>{teamName ?? 'Your team'}</span>
            <span className={styles.manager}>
              {managerName ?? 'Manager'} · GW{gameweekId}
            </span>
          </div>
        </header>

        {!confirming ? (
          <div className={styles.body}>
            <button className={styles.destructive} onClick={() => setConfirming(true)} data-testid="log-out" type="button">
              Log out
            </button>
            <button className={styles.quiet} onClick={onCancel} type="button">
              Cancel
            </button>
          </div>
        ) : (
          /* The second page of the same sheet, not a stacked overlay (F7-AC-24). */
          <div className={styles.body} data-testid="log-out-confirm">
            <p className={styles.confirmText}>
              <strong>Log out of The Gaffer?</strong> Your squad and this week&rsquo;s decisions are
              kept. You will need a new six-digit code by email to come back.
            </p>
            {error ? (
              <div className={styles.error} role="alert">
                {error}
              </div>
            ) : null}
            <button className={styles.destructive} onClick={() => void go()} disabled={busy} data-testid="log-out-confirmed" type="button">
              {busy ? 'Signing out…' : 'Yes, log out'}
            </button>
            <button className={styles.quiet} onClick={() => setConfirming(false)} disabled={busy} type="button">
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
