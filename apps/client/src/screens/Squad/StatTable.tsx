/**
 * The stat table (F1-AC-15 to F1-AC-19).
 *
 * The same fifteen grouped by position, with the master column list. **The player
 * column is frozen and the header row is sticky**, so a figure never loses either
 * its row or its column — the whole point of both criteria, and the part of this
 * screen that has to be checked by hand on a real phone.
 *
 * This is also the only place the three difficulty bars appear (F1-AC-19,
 * F1-AC-21) and the only place the bench badges appear (F1-AC-18). On the pitch a
 * bench player is obviously on the bench, because they are in the bench card;
 * here the fifteen are one list and nothing else says who is on it.
 */

import { Fragment } from 'react'
import type { WorldPlayer } from '../../api'
import { displaySurname } from '../../squad/format'
import { DifficultyBars, FixturePill } from './parts'
import styles from './StatTable.module.css'

const GROUPS = [
  ['GKP', 'Goalkeepers'],
  ['DEF', 'Defenders'],
  ['MID', 'Midfielders'],
  ['FWD', 'Forwards'],
] as const

/** S for the substitute goalkeeper, then S1, S2, S3 outfield (F1-AC-18). */
const BENCH_BADGES = ['S', 'S1', 'S2', 'S3']

export function StatTable({ players }: { players: WorldPlayer[] }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.scroller}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={`${styles.player} ${styles.head}`}>Player</th>
              <th className={styles.head}>Avail</th>
              <th className={styles.head}>Form</th>
              <th className={styles.head}>xPts</th>
              <th className={styles.head}>This GW</th>
              <th className={styles.head}>Price</th>
              <th className={styles.head}>Sel %</th>
              <th className={styles.head}>Pts</th>
              <th className={styles.head}>In</th>
              <th className={styles.head}>Out</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map(([position, label]) => {
              const group = players.filter((p) => p.position === position)
              if (group.length === 0) return null
              return (
                <Fragment key={position}>
                  <tr className={styles.groupRow}>
                    <th className={styles.group} colSpan={10}>
                      {/* Pinned inside the cell, not by pinning the cell. The cell
                          spans the full table width, so sticky on it does nothing;
                          sticky on the text keeps the label on screen while the
                          row scrolls sideways underneath it. */}
                      <span className={styles.groupLabel}>{label}</span>
                    </th>
                  </tr>
                  {group.map((p) => (
                    <tr key={p.playerId}>
                      <th className={`${styles.player} ${styles.name}`} scope="row">
                        <span className={styles.nameRow}>
                          {displaySurname(p.surname)}
                          {!p.isStarter && p.benchOrder !== null ? (
                            <span className={styles.benchBadge}>{BENCH_BADGES[p.benchOrder]}</span>
                          ) : null}
                        </span>
                        <span className={styles.club}>{p.clubShortName}</span>
                      </th>
                      <td className={availabilityClass(p)}>{availability(p)}</td>
                      <td className={styles.mono}>{p.form?.toFixed(1) ?? '—'}</td>
                      <td className={`${styles.mono} ${styles.xpts}`}>{p.projectedPoints.toFixed(1)}</td>
                      <td>
                        <FixturePill fixtures={p.fixtures} />
                        <DifficultyBars next={p.nextThree} />
                      </td>
                      <td className={styles.mono}>£{(p.nowCostTenths / 10).toFixed(1)}</td>
                      <td className={styles.mono}>{p.selectedByPercent?.toFixed(1) ?? '—'}%</td>
                      <td className={styles.mono}>{p.seasonPoints ?? '—'}</td>
                      <td className={styles.mono}>{compact(p.transfersIn)}</td>
                      <td className={styles.mono}>{compact(p.transfersOut)}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.hint}>
        scroll ↔ for more · bars = difficulty of next 3
      </div>
    </div>
  )
}

/** Fit, a doubt with its percentage, or out. Never colour alone (F1-AC-12). */
function availability(p: WorldPlayer): string {
  if (p.status === 'a') return 'FIT'
  if (p.chanceOfPlayingNextRound !== null && p.chanceOfPlayingNextRound > 0) {
    return `${p.chanceOfPlayingNextRound}%`
  }
  return 'INJ'
}

function availabilityClass(p: WorldPlayer): string {
  const base = styles.mono ?? ''
  if (p.status === 'a') return `${base} ${styles.fit}`
  if (p.chanceOfPlayingNextRound !== null && p.chanceOfPlayingNextRound > 0) {
    return `${base} ${styles.doubtful}`
  }
  return `${base} ${styles.out}`
}

/** Transfer counts run to millions; the column is narrow. */
function compact(value: number | null): string {
  if (value === null) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(value)
}
