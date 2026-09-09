/**
 * The stat table (F1-AC-15 to F1-AC-19).
 *
 * The same fifteen grouped by position, with the master column list. **The player
 * column is frozen and the header row is sticky**, so a figure never loses either
 * its row or its column — which is the whole point of both criteria, and the one
 * part of this screen that has to be checked by hand on a real phone.
 *
 * This is also the only place the three difficulty bars appear (F1-AC-19,
 * F1-AC-21). The pitch carries the pill alone.
 */

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

export function StatTable({ players }: { players: WorldPlayer[] }) {
  return (
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
              <>
                <tr key={position}>
                  <th className={`${styles.player} ${styles.group}`} colSpan={10}>
                    {label}
                  </th>
                </tr>
                {group.map((p) => (
                  <tr key={p.playerId}>
                    <th className={`${styles.player} ${styles.name}`} scope="row">
                      {displaySurname(p.surname)}
                      <span className={styles.club}>{p.clubShortName}</span>
                    </th>
                    <td>{availability(p)}</td>
                    <td>{p.form?.toFixed(1) ?? '—'}</td>
                    <td className={styles.strong}>{p.projectedPoints.toFixed(1)}</td>
                    <td>
                      <FixturePill fixtures={p.fixtures} />
                      <DifficultyBars next={p.nextThree} />
                    </td>
                    <td>£{(p.nowCostTenths / 10).toFixed(1)}</td>
                    <td>{p.selectedByPercent?.toFixed(1) ?? '—'}%</td>
                    <td>{p.seasonPoints ?? '—'}</td>
                    <td>{compact(p.transfersIn)}</td>
                    <td>{compact(p.transfersOut)}</td>
                  </tr>
                ))}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Fit, a doubt with its percentage, or out. Never colour alone. */
function availability(p: WorldPlayer): string {
  if (p.status === 'a') return 'Fit'
  if (p.chanceOfPlayingNextRound !== null && p.chanceOfPlayingNextRound > 0) {
    return `${p.chanceOfPlayingNextRound}%`
  }
  return 'Out'
}

/** Transfer counts run to millions; the column is 40px wide. */
function compact(value: number | null): string {
  if (value === null) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(value)
}
