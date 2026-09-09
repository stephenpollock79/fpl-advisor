/**
 * Link FPL team — the whole of onboarding (F7-AC-15). One screen, first log in
 * only, no wizard and no second onboarding state.
 *
 * Two states in one screen, and the split between them is the criterion.
 * **Entry** takes the identifier; **confirm** shows the team back and waits for a
 * yes (F7-AC-14). The reason is in the criterion itself: a mistyped identifier is
 * usually still a valid one belonging to a stranger, so without this step the app
 * would link silently and every call afterwards would be built on someone else's
 * squad with nothing on screen to say so.
 *
 * No FPL credentials are asked for here, and there is no field that could carry
 * one (F7-AC-13). The app reads a public team; it never signs in as anyone.
 */

import { type FormEvent, useState } from 'react'
import { ApiError, type LinkedTeam, confirmTeam, resolveTeam } from '../../api'
import styles from './LinkTeam.module.css'
import avatar from '../../assets/gaffer-avatar.png'

type Props = { onLinked: () => void }

export function LinkTeam({ onLinked }: Props) {
  const [entered, setEntered] = useState('')
  const [found, setFound] = useState<LinkedTeam | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function find(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      setFound(await resolveTeam(Number(entered)))
    } catch (cause) {
      setFound(null)
      setError(describe(cause))
    } finally {
      setBusy(false)
    }
  }

  async function accept() {
    if (!found) return
    setError(null)
    setBusy(true)
    try {
      await confirmTeam(found.fplTeamId)
      onLinked()
    } catch (cause) {
      setError(describe(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <img className={styles.avatar} src={avatar} alt="" />
        <span className={styles.wordmark}>The Gaffer</span>
      </header>

      <div>
        <div className={styles.eyebrow}>One-off setup · First log in</div>
        <h1 className={styles.title}>Which team is yours?</h1>
      </div>

      <p className={styles.body}>
        Your FPL team ID lets the Gaffer read your squad. He only ever reads it — he never signs in
        as you and never makes a move on your behalf.
      </p>

      <div className={styles.where}>
        <div className={styles.eyebrow}>Where to find it</div>
        <div className={styles.wherePath}>
          fantasy.premierleague.com/entry/<span className={styles.whereId}>1234567</span>/event/4
        </div>
        <div className={styles.body}>
          In the FPL app: <strong>Points</strong>, then <strong>Gameweek history</strong> — the
          number in the address is your team ID.
        </div>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          <span className={styles.errorDisc} aria-hidden="true">
            !
          </span>
          <span className={styles.errorText}>{error}</span>
        </div>
      ) : null}

      {found ? (
        <>
          <div className={styles.found}>
            <div className={styles.foundLabel}>✓ FOUND · IS THIS YOU?</div>
            <div className={styles.teamName}>{found.teamName}</div>
            <div className={styles.grid}>
              <div>
                <div className={styles.gridLabel}>Manager</div>
                <div className={styles.gridValue}>{found.managerName}</div>
              </div>
              <div>
                <div className={styles.gridLabel}>Overall rank</div>
                <div className={styles.gridValue}>
                  {found.overallRank === null
                    ? 'Not ranked yet'
                    : found.overallRank.toLocaleString('en-GB')}
                </div>
              </div>
            </div>
            <div className={styles.footerRow}>
              <span className={styles.gridLabel}>Team ID</span>
              <span className={styles.idValue}>{found.fplTeamId}</span>
            </div>
          </div>

          <button className={styles.primarySolid} onClick={accept} disabled={busy} type="button">
            Yes — that&rsquo;s my team
          </button>
          <button
            className={styles.secondary}
            onClick={() => {
              setFound(null)
              setEntered('')
            }}
            type="button"
          >
            Not mine — try another ID
          </button>
        </>
      ) : (
        <form onSubmit={find}>
          <input
            className={styles.field}
            value={entered}
            onChange={(e) => setEntered(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="1234567"
            aria-label="Your FPL team ID"
          />
          <div className={styles.spacer} />
          <button className={styles.primary} type="submit" disabled={busy || entered.trim() === ''}>
            {busy ? 'Looking…' : 'Find my team'}
          </button>
        </form>
      )}

      <p className={styles.footNote}>
        The Gaffer only reads your team. He never makes a move — every transfer stays yours to make
        in the FPL app.
      </p>
    </main>
  )
}

/**
 * A wrong identifier and a broken app must not read as the same sentence. Only
 * the first is the manager's to fix, and telling them to check their ID when the
 * server fell over sends them looking in the wrong place.
 */
function describe(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === 'team_not_found') {
      return 'No team with that ID. Check the number and try again.'
    }
    if (cause.code === 'invalid_team_id') {
      return 'A team ID is a whole number, like 1234567.'
    }
  }
  return 'Something went wrong at our end. Try again in a moment.'
}
