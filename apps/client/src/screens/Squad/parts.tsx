/**
 * The pieces the pitch and the stat table share.
 *
 * The handoff is authoritative for how these look — colour, anatomy, type. The
 * criteria are authoritative for what they say, and where the two disagree the
 * criteria win.
 */

import type { WorldFixture, WorldPlayer } from '../../api'
import { displaySurname } from '../../squad/format'
import { kitFor } from '../../squad/kits'
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
 * **Two grounds, because it sits on two.** In the stat table it takes a tint of
 * its own difficulty colour, as the design draws it. On the pitch that tint sits
 * over grass and leaves almost no contrast, so there it takes a solid card ground
 * and carries the difficulty in its border and ink instead. Same information,
 * legible on both.
 *
 * The blank is the state worth reading carefully: NO GAME in grey on a dashed
 * border, with the player's marker *not* dimmed. Dimming means rejected or spent
 * elsewhere in this product, so dimming a blank would borrow a meaning it does
 * not have.
 */
export function FixturePill({
  fixtures,
  onPitch = false,
}: {
  fixtures: WorldFixture[]
  onPitch?: boolean
}) {
  const ground = onPitch ? styles.onPitch : styles.tinted

  if (fixtures.length === 0) {
    return <span className={`${styles.pill} ${ground} ${styles.blank}`}>NO GAME</span>
  }

  const first = fixtures[0] as WorldFixture
  return (
    <span className={`${styles.pill} ${ground} ${difficultyClass(first.difficulty)}`}>
      {first.opponentShortName} ({first.isHome ? 'H' : 'A'})
      {fixtures.length > 1 ? <span className={styles.double}>×{fixtures.length}</span> : null}
    </span>
  )
}

/**
 * Three bars, one per gameweek (F1-AC-19).
 *
 * **The stat table only, never a pitch slot** (F1-AC-21). A blank is an empty
 * dashed track rather than a bar of difficulty zero — zero would render as the
 * easiest fixture there is, the opposite of what a blank means. A double splits
 * its bar in two.
 */
export function DifficultyBars({ next }: { next: (number | number[] | null)[] }) {
  return (
    <span className={styles.bars} aria-hidden="true">
      {next.map((entry, i) => {
        if (entry === null) return <span key={i} className={`${styles.bar} ${styles.barBlank}`} />
        if (Array.isArray(entry)) {
          return (
            <span key={i} className={styles.barSplit}>
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
 * word or a number as well as a colour, because state must never be conveyed by
 * colour alone (NFR Accessibility 3).
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
 * A drawn shirt, never a photograph (handoff, *Hard constraints* 4).
 *
 * Body in the club's first colour, sleeves in its second, so clubs that share a
 * body colour still read apart — Arsenal and Nottingham Forest are both red, and
 * the sleeves are what separates them at 34 pixels.
 */
function Shirt({ shortName, number }: { shortName: string; number: number | null }) {
  const kit = kitFor(shortName)

  return (
    <svg className={styles.shirt} viewBox="0 0 44 40" aria-hidden="true">
      {/* Sleeves first, so the body overlaps them at the shoulder seam. */}
      <path
        d="M2 11 L12 3 L17 7 L9 15 Z M42 11 L32 3 L27 7 L35 15 Z"
        fill={kit.secondary}
        stroke="rgba(0,0,0,.28)"
        strokeWidth="1"
      />
      <path
        d="M12 3 L17 7 Q22 10 27 7 L32 3 L36 8 L34 38 Q22 40 10 38 L8 8 Z"
        fill={kit.primary}
        stroke="rgba(0,0,0,.28)"
        strokeWidth="1"
      />
      {/* Collar. */}
      <path d="M17 7 Q22 12 27 7" fill="none" stroke={kit.secondary} strokeWidth="2.5" />
      {number !== null ? (
        <text x="22" y="28" textAnchor="middle" className={styles.shirtNumber} fill={kit.ink}>
          {number}
        </text>
      ) : null}
    </svg>
  )
}

/**
 * One player (F1-AC-10, F1-AC-14).
 *
 * Shirt in the club's colours with the number on it, surname beneath, fixture
 * pill under that. **No price** — the component is not given one, so it cannot
 * show one by accident.
 *
 * **No bench badge here.** A bench player's position is obvious from being in the
 * bench card; the S / S1 / S2 / S3 badges belong in the stat table, where the
 * fifteen are one list and nothing else says who is on the bench (F1-AC-18).
 */
export function PlayerSlot({ player }: { player: WorldPlayer }) {
  return (
    <div className={styles.slot}>
      <div className={styles.kit}>
        <Shirt shortName={player.clubShortName} number={player.shirtNumber} />
        <AvailabilityMarker player={player} />
        <Armband player={player} />
      </div>
      <div className={styles.surname}>{displaySurname(player.surname)}</div>
      <FixturePill fixtures={player.fixtures} onPitch />
    </div>
  )
}
