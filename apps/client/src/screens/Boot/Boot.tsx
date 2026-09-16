import avatar from '../../assets/gaffer-avatar.png'
import styles from './Boot.module.css'

/**
 * The screen the app opens on, and the one it stops on when it cannot.
 *
 * **Waiting and stopped are one component with one difference.** They are the
 * same page — brand, a disc, a sentence — and the only thing that changes is
 * whether the disc is turning. Keeping them apart is how the failure states
 * ended up as bare inline-styled text while the loading one got looked at:
 * nobody sees them often enough to notice they were never designed.
 *
 * `waiting` is the whole API on purpose. There is no progress to report on a
 * first open — it is two fetches, not a streamed pipeline — so the component
 * has nothing it could honestly be told beyond whether something is still
 * coming.
 */
export function Boot({ children, waiting = true }: { children: React.ReactNode; waiting?: boolean }) {
  return (
    <main className={`${styles.boot} ${waiting ? '' : styles.stopped}`} data-testid="boot">
      <div className={styles.brand}>
        <img className={styles.avatar} src={avatar} alt="" />
        <span className={styles.wordmark}>The Gaffer</span>
      </div>

      {waiting ? (
        <span className={styles.spinner} aria-hidden="true">
          <span className={styles.pulse} />
        </span>
      ) : (
        <span className={styles.disc} aria-hidden="true">
          !
        </span>
      )}

      {/* **Announced, not just drawn.** The sentence is the only thing on the
          screen that says what is happening, so a reader that cannot see the
          spinner has to be told it changed. */}
      <p className={styles.line} role="status">
        {children}
      </p>

      {waiting ? (
        <span className={styles.sweep} aria-hidden="true">
          <span className={styles.sweepBar} />
        </span>
      ) : null}
    </main>
  )
}
