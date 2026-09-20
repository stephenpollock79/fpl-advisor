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
import { benchBadge, displaySurname } from '../../squad/format'
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
    /* No wrapper: the scrolling ancestor is the card's own scroll area, and a
       wrapper here would take that role and stop the header sticking. */
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.head}>Player</th>
          <th className={styles.head}>Form</th>
          <th className={styles.head}>xPts</th>
          <th className={styles.head}>This GW</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const player = players.get(row.playerId)
          if (!player) return null
          const barred = row.because !== null
          const picked = row.isCaptainPick || row.isVicePick

          return (
            <tr
              key={row.playerId}
              className={[picked ? styles.picked : '', barred ? styles.barred : ''].filter(Boolean).join(' ')}
              data-testid={`armband-row-${String(row.playerId)}`}
            >
              <td className={styles.player}>
                <div className={styles.nameLine}>
                  <span className={`${styles.name} ${picked ? styles.pickedName : ''}`}>
                    {displaySurname(player.name)}
                  </span>
                  {/* Who wears it *today*. The recommendation is the row's own
                      styling — two marks competing to say the same thing was
                      the first version's mistake. */}
                  {player.isCaptain ? (
                    <span className={`${styles.badge} ${styles.badgeC}`} title="Your captain">
                      C
                    </span>
                  ) : null}
                  {player.isVice ? (
                    <span className={`${styles.badge} ${styles.badgeV}`} title="Your vice-captain">
                      V
                    </span>
                  ) : null}
                  {/* **The bench slot as a badge, not a second line.** Spelling
                      it out under the name gave half the table a two-line row
                      and buried the figures; the same letters the Squad table
                      already uses say it in the width of a word (F1-AC-18). */}
                  {benchBadge(player.benchOrder) === null ? null : (
                    <span className={styles.bench} title="On your bench">
                      {benchBadge(player.benchOrder)}
                    </span>
                  )}
                </div>
                {barred ? <div className={styles.note}>{row.because}</div> : null}
                {row.byCeiling ? <div className={styles.note}>chosen on ceiling, not the raw figure</div> : null}
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
  )
}
