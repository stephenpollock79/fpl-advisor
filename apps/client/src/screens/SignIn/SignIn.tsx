/**
 * A stand-in sign-in, so the app can be opened on a phone.
 *
 * **This is not the Landing screen and does not satisfy any of its criteria.**
 * F7-AC-16 to F7-AC-20 describe a two-tab card with a wordmark, an invite-only
 * badge, five one-line claims, a device mock and a standing disclaimer. None of
 * that is here, and slice 8 (STE-66) replaces this file wholesale.
 *
 * It exists because of a gap nobody planned: the log-in screen is slice 8, and
 * until it lands there is **no way to sign in on a phone at all** — the desktop
 * workaround was pasting into the browser console, and Chrome on iOS has none.
 * That would have blocked the manual visual check on every slice between here and
 * slice 8, which is most of the build.
 *
 * Two things it does honour, because they are cheap and because getting them
 * wrong here would teach the wrong shape:
 *
 * - **The response is identical whether or not an address has access.** The
 *   server already guarantees this; the screen must not undo it by saying
 *   anything different (F7-AC-02, F7-AC-05, F7-UP-01).
 * - **Errors are stated inline, never as a toast** (F7-AC-20).
 */

import { type FormEvent, useState } from 'react'
import { requestCode, verifyCode } from '../../api'
import styles from './SignIn.module.css'

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await requestCode(email.trim())
      // Always the same next step. An address without access reaches here too,
      // and must not be able to tell.
      setSent(true)
    } catch {
      setError('Could not reach the app. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  async function logIn(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await verifyCode(email.trim(), code.trim())
      onSignedIn()
    } catch {
      // Wrong, expired and already-used all read the same, as the server intends.
      setError('That code did not work. Request another and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={styles.screen}>
      <h1 className={styles.wordmark}>The Gaffer</h1>
      <p className={styles.stand}>
        Temporary sign-in. The real Landing screen arrives with slice 8.
      </p>

      {error ? (
        <div className={styles.error} role="alert">
          <span className={styles.errorDisc} aria-hidden="true">
            !
          </span>
          <span>{error}</span>
        </div>
      ) : null}

      {!sent ? (
        <form onSubmit={send} className={styles.form}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className={styles.field}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <button className={styles.button} type="submit" disabled={busy || email.trim() === ''}>
            {busy ? 'Sending…' : 'Send me a code'}
          </button>
        </form>
      ) : (
        <form onSubmit={logIn} className={styles.form}>
          <div className={styles.sentTo}>Code sent to {email}</div>
          <label className={styles.label} htmlFor="code">
            Six-digit code
          </label>
          <input
            id="code"
            className={`${styles.field} ${styles.codeField}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
          <button className={styles.button} type="submit" disabled={busy || code.trim() === ''}>
            {busy ? 'Checking…' : 'Log in'}
          </button>
          <button
            className={styles.quiet}
            type="button"
            onClick={() => {
              setSent(false)
              setCode('')
              setError(null)
            }}
          >
            Use a different address
          </button>
        </form>
      )}
    </main>
  )
}
