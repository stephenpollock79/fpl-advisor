/**
 * The Landing screen (F7-AC-16 – F7-AC-20, F7-UP-02, F7-UP-04).
 *
 * **The only screen reachable without an account, and the only one without the
 * app header.** One card, two tabs: *What he does* by default — sales rather
 * than function, five one-line claims, no feature list, no pricing, no scroll —
 * and *Log in*.
 *
 * **There is no sign-up path here, and its absence is the security model**
 * (F7-AC-01, F7-AC-18). Nobody can create an account; the owner creates them at
 * the provider. So: no register link, no password field, no forgotten-password
 * line — and nothing on this screen may be added later that implies otherwise.
 *
 * **Nothing distinguishes an authorised address from an unauthorised one**
 * (F7-AC-05, F7-UP-01). The server guarantees it; this screen must not undo the
 * guarantee by saying something different, which is why both paths reach the
 * same next step and the same words.
 */

import { type FormEvent, useEffect, useState } from 'react'
import { requestCode, verifyCode } from '../../api'
import avatar from '../../assets/gaffer-avatar.png'
import styles from './Landing.module.css'

/**
 * `F7-AC-08`: the control carries a visible cooldown once used. Long enough to
 * match the server's own one-code-per-minute limit, so the screen never offers
 * a send that would be silently swallowed.
 */
const COOLDOWN_SECONDS = 60

/** Five claims, each expanding to a sentence and driving the mock (F7-AC-16). */
const CLAIMS: { claim: string; detail: string; mock: string }[] = [
  {
    claim: 'He tells you what to do before every deadline.',
    detail: 'A short list of calls — transfers, subs, captain — each with the points it gains or costs.',
    mock: '3 of 7 calls decided',
  },
  {
    claim: 'Every call says how strong it is.',
    detail: 'A figure and a word, worked out from published data alone, so the same inputs give the same answer.',
    mock: '84 · strong',
  },
  {
    claim: 'He shows his working.',
    detail: 'Projections, fixtures and the availability verdict for both sides, on one table you can check by hand.',
    mock: 'Haaland 8.0 · Semenyo 6.2',
  },
  {
    claim: 'He tells you when the world has moved.',
    detail: 'Injuries, prices and team news are watched between runs, and he says who changed rather than leaving you to guess.',
    mock: '3 players flagged since',
  },
  {
    claim: 'He says when there is nothing worth doing.',
    detail: 'A quiet week is an answer, not an empty screen — no advice is manufactured to fill it.',
    mock: 'no calls this week',
  },
]

type Tab = 'about' | 'login'

export function Landing({ onSignedIn, startOn = 'about' }: { onSignedIn: () => void; startOn?: Tab }) {
  const [tab, setTab] = useState<Tab>(startOn)
  const [open, setOpen] = useState(0)

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function send(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await requestCode(email.trim())
      // Always the same next step: an address with no access reaches here too,
      // and must not be able to tell (F7-AC-02, F7-AC-05).
      setSent(true)
      setCooldown(COOLDOWN_SECONDS)
    } catch {
      setError('Could not reach the app. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    if (cooldown > 0) return
    setError(null)
    try {
      await requestCode(email.trim())
    } catch {
      /* Same silence as above: a failure here must not describe the address. */
    }
    setCooldown(COOLDOWN_SECONDS)
  }

  async function logIn(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await verifyCode(email.trim(), code.trim())
      onSignedIn()
    } catch {
      // Wrong, expired, already used and spent-after-five all read alike, as the
      // server intends (F7-UP-02) — and inline, never a toast (F7-AC-20).
      setError('That code did not work. It may have expired or already been used. Request another and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.head}>
        <img className={styles.avatar} src={avatar} alt="" />
        <h1 className={styles.wordmark}>The Gaffer</h1>
        {/* Stated up front, so a visitor learns before typing anything that an
            unrecognised address gets them nowhere (F7-AC-17). */}
        <span className={styles.badge} data-testid="invite-only">
          Invite only
        </span>
      </div>

      <section className={styles.card}>
        <nav className={styles.tabs} role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'about'}
            className={tab === 'about' ? styles.tabOn : styles.tab}
            onClick={() => setTab('about')}
            type="button"
          >
            What he does
          </button>
          <button
            role="tab"
            aria-selected={tab === 'login'}
            className={tab === 'login' ? styles.tabOn : styles.tab}
            onClick={() => setTab('login')}
            data-testid="tab-login"
            type="button"
          >
            Log in
          </button>
        </nav>

        {tab === 'about' ? (
          <div className={styles.about} data-testid="about">
            <ul className={styles.claims}>
              {CLAIMS.map((c, index) => (
                <li key={c.claim}>
                  <button
                    className={styles.claim}
                    aria-expanded={open === index}
                    onClick={() => setOpen(index)}
                    type="button"
                  >
                    {c.claim}
                  </button>
                  {open === index ? <p className={styles.detail}>{c.detail}</p> : null}
                </li>
              ))}
            </ul>
            {/* The device mock beside the claims, driven by whichever is open. */}
            <div className={styles.mock} aria-hidden="true">
              <div className={styles.mockScreen}>
                <span className={styles.mockBrand}>The Gaffer</span>
                <span className={styles.mockLine}>{CLAIMS[open]?.mock}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.login}>
            {/* Inline, in a red card inside the login card — never a transient
                toast (F7-AC-20, F7-UP-02). */}
            {error ? (
              <div className={styles.error} role="alert" data-testid="login-error">
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

                {/* F7-AC-08: the cooldown is visible, so a tap that would do
                    nothing is never offered as one that would. */}
                <button
                  className={styles.quiet}
                  type="button"
                  onClick={() => void resend()}
                  disabled={cooldown > 0}
                  data-testid="send-another"
                >
                  {cooldown > 0 ? `Send another code in ${String(cooldown)}s` : 'Send another code'}
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
          </div>
        )}
      </section>

      {/* The standing disclaimer (F7-AC-19), with the attribution the licence
          requires beside it (STE-53). */}
      <footer className={styles.disclaimer}>
        <p>
          Not affiliated with the Premier League or Fantasy Premier League. Advice only — you make
          every move yourself in the FPL app.
        </p>
        <p>
          Projections by{' '}
          <a href="https://fantasyfootballiq.app" target="_blank" rel="noreferrer">
            Fantasy Football IQ
          </a>
          .
        </p>
      </footer>
    </main>
  )
}
