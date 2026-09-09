/**
 * Squad state — what the manager actually has.
 *
 * Two modes behind one toggle: the pitch and the stat table. Portrait phone at
 * 390×844, and **no screen scrolls as a whole** — only the stat table scrolls, on
 * both axes (handoff, *Hard constraints*).
 *
 * Everything shown is derived from the world on every render. No total is stored,
 * no formation is stored, so nothing here can disagree with the players it
 * describes (F1-AC-03, F1-AC-22).
 */

import { useState } from 'react'
import type { World, WorldPlayer } from '../../api'
import { benchInOrder, formationOf, startersByPosition, totalProjected } from '../../squad/format'
import { PlayerSlot } from './parts'
import { StatTable } from './StatTable'
import styles from './SquadScreen.module.css'

/** The bench badges, in the fixed order F1-AC-18 names. */
const BENCH_BADGES = ['S', 'S1', 'S2', 'S3']

export function SquadScreen({ world }: { world: World }) {
  const [mode, setMode] = useState<'pitch' | 'stats'>('pitch')

  return (
    <main className={styles.screen}>
      <Header world={world} />

      <div className={styles.toggle} role="tablist">
        {(['pitch', 'stats'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? styles.toggleOn : styles.toggleOff}
            onClick={() => setMode(m)}
            type="button"
          >
            {m === 'pitch' ? 'Pitch' : 'Stats'}
          </button>
        ))}
      </div>

      {mode === 'pitch' ? <Pitch world={world} /> : <StatTable players={world.players} />}

      <Attribution world={world} />
    </main>
  )
}

/**
 * The header (F1-AC-06 to F1-AC-09).
 *
 * Deadline, Balance, free transfers, the four chips, and the *Update* control at
 * the end of the chip row. What Update opens is F2 and arrives in slice 9, so it
 * says so rather than pretending to work.
 */
function Header({ world }: { world: World }) {
  const { snapshot, gameweek } = world

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <div>
          <div className={styles.eyebrow}>{gameweek.name} deadline</div>
          <div className={styles.deadline}>{formatDeadline(gameweek.deadlineTime)}</div>
        </div>
        <div className={styles.money}>
          <div>
            <div className={styles.eyebrow}>Balance</div>
            <div className={styles.figure}>{formatMoney(snapshot.bankTenths)}</div>
          </div>
          <div>
            <div className={styles.eyebrow}>Free transfers</div>
            <div className={styles.figure}>{snapshot.freeTransfers}</div>
          </div>
        </div>
      </div>

      <div className={styles.chips}>
        {Object.entries(snapshot.chipsRemaining).map(([name, state]) => (
          <span
            key={name}
            className={`${styles.chip} ${state === 'spent' ? styles.chipSpent : ''}`}
            title={`${chipLabel(name)} — ${state}`}
          >
            {chipLabel(name)}
            {/* State is never carried by colour alone (NFR Accessibility 3): a
                spent chip is struck through as well as greyed. */}
            {state === 'spent' ? <span className={styles.chipStrike} aria-hidden="true" /> : null}
          </span>
        ))}
        <button className={styles.update} type="button" title="Correct the squad from screenshots — slice 9">
          Update
        </button>
      </div>
    </header>
  )
}

/**
 * The pitch (F1-AC-04, F1-AC-05, F1-AC-10 to F1-AC-14).
 *
 * Goal at the top, keeper in the penalty area, forwards nearest the halfway line
 * at the bottom. All eleven starters and the four-player bench card are visible
 * without scrolling.
 *
 * **The pitch carries the fixture pill alone and no difficulty bars** (F1-AC-21),
 * and **no prices** (F1-AC-14) — neither component is given one.
 */
function Pitch({ world }: { world: World }) {
  const rows = startersByPosition(world.players)
  const bench = benchInOrder(world.players)

  return (
    <>
      <div className={styles.pitch}>
        <div className={styles.pitchMeta}>
          <span className={styles.formation}>{formationOf(world.players)}</span>
          <span className={styles.projected}>
            {totalProjected(world.players, { starters: true }).toFixed(1)} xPts
          </span>
        </div>

        {/* The corner figure counting blanks and doubles (F1-UP-01, F1-UP-02). */}
        {world.blanks > 0 || world.doubles > 0 ? (
          <div className={styles.corner}>
            {world.blanks > 0 ? <span>{world.blanks} blank{world.blanks > 1 ? 's' : ''}</span> : null}
            {world.doubles > 0 ? <span>{world.doubles} double{world.doubles > 1 ? 's' : ''}</span> : null}
          </div>
        ) : null}

        {(['GKP', 'DEF', 'MID', 'FWD'] as const).map((position) => (
          <div key={position} className={styles.row}>
            {rows[position].map((p) => (
              <PlayerSlot key={p.playerId} player={p as WorldPlayer} />
            ))}
          </div>
        ))}
      </div>

      <div className={styles.bench}>
        <div className={styles.benchLabel}>
          Bench
          <span className={styles.benchPoints}>
            {totalProjected(world.players, { starters: false }).toFixed(1)} xPts
          </span>
        </div>
        <div className={styles.benchRow}>
          {bench.map((p, i) => (
            <PlayerSlot key={p.playerId} player={p as WorldPlayer} benchBadge={BENCH_BADGES[i]} />
          ))}
        </div>
      </div>
    </>
  )
}

/** A licence condition, not a courtesy (STE-53). */
function Attribution({ world }: { world: World }) {
  return (
    <footer className={styles.attribution}>
      Projections by{' '}
      <a href={world.attribution.href} target="_blank" rel="noreferrer">
        {world.attribution.name}
      </a>
    </footer>
  )
}

/** Money is an integer in tenths of £1m everywhere below the display layer. */
function formatMoney(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`
}

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function chipLabel(name: string): string {
  return { wildcard: 'WC', freehit: 'FH', bboost: 'BB', '3xc': 'TC' }[name] ?? name.toUpperCase()
}
