/**
 * F6-UP-02: FPL is not answering.
 *
 * One strip, on every screen that shows the world. It lived on the Assistant
 * alone until STE-198 made a failed gameweek turnover answer with last week's
 * squad — on the Squad screen the app opens on, where nothing said so.
 */

import type { World } from '../../api'
import { dataAge } from '../../calls/view'
import styles from './FrozenStrip.module.css'

export function FrozenStrip({ world }: { world: World }) {
  if (world.feedsReachable !== false) return null
  return (
    <div className={styles.frozen} data-testid="frozen">
      <span className={styles.frozenAge}>{dataAge(world.dataReadAt, Date.now()) ?? 'showing stored data'}</span>
      <p>
        <strong>FPL is not answering.</strong> Frozen until it is: new calls, refresh, and chip
        re-planning. Not frozen: your squad, your prices and every decision you have made.
      </p>
      <p className={styles.frozenRisk}>
        What you cannot see is team news. If someone picks up a knock in the next hour, this
        screen will not know.
      </p>
    </div>
  )
}
