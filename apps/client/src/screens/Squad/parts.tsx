/**
 * The pieces the pitch and the stat table share.
 *
 * The handoff is authoritative for how these look — colour, anatomy, type. The
 * criteria are authoritative for what they say, and where the two disagree the
 * criteria win.
 */

import type { WorldFixture, WorldPlayer } from '../../api'
import { displaySurname } from '../../squad/format'
import styles from './parts.module.css'

/** 1–2 green, 3 amber, 4–5 red (F1-AC-11). Named, so the scale exists once. */
export function difficultyClass(difficulty: number): string {
  if (difficulty <= 2) return styles.kind ?? ''
  if (difficulty === 3) return styles.even ?? ''
  return styles.tough ?? ''
}

/**
 * The fixture pill (F1-AC-11, F1-UP-01, F1-UP-02).
 *
 * Three states, and the blank is the one worth reading carefully: **NO GAME in
 * grey with a dashed border**, and the player's marker is *not* dimmed. Dimming
 * means rejected or spent elsewhere in this product, so dimming a blank would
 * borrow a meaning it does not have.
 */
export function FixturePill({ fixtures }: { fixtures: WorldFixture[] }) {
  if (fixtures.length === 0) {
    return <span className={`${styles.pill} ${styles.blank}`}>NO GAME</span>
  }

  const first = fixtures[0] as WorldFixture
  return (
    <span className={`${styles.pill} ${difficultyClass(first.difficulty)}`}>
      {first.opponentShortName}
      <span className={styles.venue}>{first.isHome ? 'H' : 'A'}</span>
      {fixtures.length > 1 ? <span className={styles.double}>×{fixtures.length}</span> : null}
    </span>
  )
}

/**
 * Three hairline bars, one per gameweek (F1-AC-19).
 *
 * **The stat table only, never a pitch slot** (F1-AC-21). A blank is an empty
 * dashed track rather than a bar of difficulty zero — zero would render as the
 * easiest fixture there is, which is the opposite of what a blank means. A double
 * splits its bar in two.
 */
export function DifficultyBars({ next }: { next: (number | number[] | null)[] }) {
  return (
    <span className={styles.bars} aria-hidden="true">
      {next.map((entry, i) => {
        if (entry === null) return <span key={i} className={`${styles.bar} ${styles.barBlank}`} />
        if (Array.isArray(entry)) {
          return (
            <span key={i} className={styles.bar}>
              {entry.map((d, j) => (
                <span key={j} className={`${styles.barHalf} ${difficultyClass(d)}`} />
              ))}
            </span>
          )
        }
        return <span key={i} className={`${styles.bar} ${difficultyClass(entry)}`} />
      })}
    </span>
  )
}

/**
 * Injury or doubt (F1-AC-12).
 *
 * Red for unavailable, amber for a doubt carrying its percentage. Both carry a
 * title as well as a colour, because state must never be conveyed by colour alone
 * (NFR Accessibility 3).
 */
export function AvailabilityMarker({ player }: { player: WorldPlayer }) {
  if (player.status === 'a') return null

  const chance = player.chanceOfPlayingNextRound
  if (chance !== null && chance > 0) {
    return (
      <span className={`${styles.marker} ${styles.doubt}`} title={`${chance}% chance of playing`}>
        {chance}%
      </span>
    )
  }
  return (
    <span className={`${styles.marker} ${styles.injured}`} title="Not expected to play">
      INJ
    </span>
  )
}

/** Captain and vice badges (F1-AC-13). */
export function Armband({ player }: { player: WorldPlayer }) {
  if (!player.isCaptain && !player.isVice) return null
  return (
    <span
      className={`${styles.armband} ${player.isCaptain ? styles.captain : ''}`}
      title={player.isCaptain ? 'Captain' : 'Vice-captain'}
    >
      {player.isCaptain ? 'C' : 'V'}
    </span>
  )
}

/**
 * One player on the pitch (F1-AC-10, F1-AC-14).
 *
 * Kit, shirt number and surname, with the fixture pill, availability marker and
 * armband. **No price** — the component is not given one, so it cannot show one
 * by accident.
 */
export function PlayerSlot({ player, benchBadge }: { player: WorldPlayer; benchBadge?: string }) {
  return (
    <div className={styles.slot}>
      <div className={styles.kit}>
        <span className={styles.shirtNumber}>{player.shirtNumber ?? ''}</span>
        <AvailabilityMarker player={player} />
        <Armband player={player} />
        {benchBadge ? <span className={styles.benchBadge}>{benchBadge}</span> : null}
      </div>
      <div className={styles.surname}>{displaySurname(player.surname)}</div>
      <FixturePill fixtures={player.fixtures} />
    </div>
  )
}
