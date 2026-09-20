/**
 * The armband, as the ranking it actually is (STE-151).
 *
 * **This replaced two head-to-head cards**, one for the captain and one for the
 * vice. The engine never worked that way: it ranks the eligible starters and
 * takes the top two. Everything downstream translated that back into a pair of
 * swaps, and the translation is where it went wrong every time — five editorials
 * describing the armbands wrongly, a vice call outscoring its own captain call
 * and sorting above it, and a figure on the vice that read as points banked when
 * it is collectable only in a week the captain does not play.
 *
 * A sorted list cannot be misdescribed. That is the whole argument.
 *
 * **Every squad member is here, pickable or not.** A high projection sitting on
 * the bench is the answer to "why isn't he captain?", and a table that hid him
 * would leave the question open — which would put back exactly the thing this
 * screen exists to remove.
 *
 * Nothing here is computed. The order, the two picks and the reason against
 * anyone barred all arrive on the call's breakdown, decided by the plan.
 */

import type { ArmbandRow, WorldPlayer } from '../../api'
import { displaySurname } from '../../squad/format'
import { FixturePill } from '../Squad/parts'
import styles from './ArmbandTable.module.css'

export function ArmbandTable({
  rows,
  players,
}: {
  rows: readonly ArmbandRow[]
  players: ReadonlyMap<number, WorldPlayer>
}) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.player}>Player</th>
            <th>Form</th>
            <th>xPts</th>
            <th className={styles.fixture}>This GW</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const player = players.get(row.playerId)
            if (!player) return null
            const barred = row.because !== null

            return (
              <tr
                key={row.playerId}
                className={barred ? styles.barred : undefined}
                data-testid={`armband-row-${String(row.playerId)}`}
              >
                <td className={styles.player}>
                  <div className={styles.nameLine}>
                    {/* The recommendation, and the only mark that carries a
                        decision. A row can be both the pick and the current
                        holder, in which case nothing is moving on that line. */}
                    {row.isCaptainPick ? <span className={styles.pickC}>C</span> : null}
                    {row.isVicePick ? <span className={styles.pickV}>V</span> : null}
                    <span className={styles.name}>{displaySurname(player.name)}</span>
                    {/* What he wears today, so "does anything move?" is answered
                        by looking rather than by remembering. */}
                    {player.isCaptain ? <span className={styles.held}>now C</span> : null}
                    {player.isVice ? <span className={styles.held}>now V</span> : null}
                  </div>
                  {barred ? <div className={styles.because}>{row.because}</div> : null}
                  {row.byCeiling ? <div className={styles.because}>chosen on ceiling, not the raw figure</div> : null}
                </td>
                <td className={styles.figure}>{player.form === null ? '—' : player.form.toFixed(1)}</td>
                <td className={styles.figure}>{row.projection.toFixed(1)}</td>
                <td className={styles.fixture}>
                  {player.fixtures.length === 0 ? (
                    <span className={styles.blank}>none</span>
                  ) : (
                    <FixturePill fixtures={player.fixtures} />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
