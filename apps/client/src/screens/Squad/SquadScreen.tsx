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
import type { World } from '../../api'
import avatar from '../../assets/gaffer-avatar.png'
import { benchInOrder, formationOf, startersByPosition, totalProjected } from '../../squad/format'
import { PlayerSlot } from './parts'
import { StatTable } from './StatTable'
import styles from './SquadScreen.module.css'

/**
 * The four chips in the order the design lays them out, with the labels it uses.
 * Ordered here rather than taken from the payload, because object key order is
 * not a promise and the row would silently reshuffle.
 */
const CHIPS: [string, string][] = [
  ['wildcard', 'WC'],
  ['freehit', 'FH'],
  ['bboost', 'BB'],
  ['3xc', 'TC'],
]

/** Bench slot labels: the substitute keeper, then outfield one, two, three. */
const BENCH_SLOTS = ['GK', '1', '2', '3']

export function SquadScreen({ world }: { world: World }) {
  const [mode, setMode] = useState<'pitch' | 'stat'>('pitch')

  return (
    <main className={styles.screen}>
      <Header world={world} />

      <div className={styles.modes} role="tablist">
        {(['pitch', 'stat'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? styles.modeOn : styles.modeOff}
            onClick={() => setMode(m)}
            type="button"
          >
            {m === 'pitch' ? 'Pitch' : 'Stat'}
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
 * Wordmark and avatar, the Squad / Assistant switch, then the deadline, Balance
 * and free transfers, then the four chips with *Update* at the end of the row.
 *
 * The Assistant side of the switch is F8 and arrives in slice 8. It is shown
 * because it is the app's primary navigation and its absence misreads the screen,
 * and it is disabled because a control that looks live and is not is worse.
 */
function Header({ world }: { world: World }) {
  const { snapshot, gameweek } = world

  return (
    <header className={styles.header}>
      <div className={styles.brandRow}>
        <img className={styles.avatar} src={avatar} alt="" />
        <span className={styles.wordmark}>The Gaffer</span>
        <div className={styles.sections} role="tablist">
          <span className={styles.sectionOn} role="tab" aria-selected="true">
            Squad
          </span>
          <button
            className={styles.sectionOff}
            role="tab"
            aria-selected="false"
            disabled
            title="The Assistant arrives with slice 8"
            type="button"
          >
            Assistant
          </button>
        </div>
      </div>

      <div className={styles.facts}>
        <div>
          <div className={styles.eyebrow}>Deadline</div>
          <div className={styles.deadline}>{formatDeadline(gameweek.deadlineTime)}</div>
        </div>
        <div className={styles.factRight}>
          <div className={styles.eyebrow}>Balance</div>
          <div className={styles.figure}>{formatMoney(snapshot.bankTenths)}</div>
        </div>
        <div className={styles.factRight}>
          <div className={styles.eyebrow}>Free transfers</div>
          <div className={styles.figure}>{snapshot.freeTransfers}</div>
        </div>
      </div>

      <div className={styles.chips}>
        {CHIPS.map(([key, label]) => {
          const spent = snapshot.chipsRemaining[key] === 'spent'
          return (
            <span
              key={key}
              className={`${styles.chip} ${spent ? styles.chipSpent : ''}`}
              title={`${label} — ${spent ? 'spent' : 'available'}`}
            >
              {label}
              {/* Struck through as well as greyed: state is never carried by
                  colour alone (NFR Accessibility 3). */}
              {spent ? <span className={styles.chipStrike} aria-hidden="true" /> : null}
            </span>
          )
        })}
        <button
          className={styles.update}
          type="button"
          title="Correct the squad from screenshots — arrives with slice 9"
        >
          <span className={styles.updateArrow} aria-hidden="true">
            ↑
          </span>
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
 * at the bottom. All eleven starters and the four-player bench card visible
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
        <PitchLines />
        <span className={styles.gwBadge}>GW{world.gameweek.id}</span>
        <span className={styles.xpts}>
          xPts {totalProjected(world.players, { starters: true }).toFixed(1)}
        </span>

        {/* The corner figure counting blanks and doubles (F1-UP-01, F1-UP-02). */}
        {world.blanks > 0 || world.doubles > 0 ? (
          <div className={styles.corner}>
            {world.blanks > 0 ? <span>{world.blanks} blank</span> : null}
            {world.doubles > 0 ? <span>{world.doubles} double</span> : null}
          </div>
        ) : null}

        {(['GKP', 'DEF', 'MID', 'FWD'] as const).map((position) => (
          <div key={position} className={styles.row}>
            {rows[position].map((p) => (
              <PlayerSlot key={p.playerId} player={p} />
            ))}
          </div>
        ))}

        <span className={styles.formation}>{formationOf(world.players).split('-').join(' - ')}</span>
      </div>

      <div className={styles.bench}>
        <div className={styles.benchLabel}>
          Bench
          <span className={styles.benchPoints}>
            xPts {totalProjected(world.players, { starters: false }).toFixed(1)}
          </span>
        </div>
        <div className={styles.benchRow}>
          {bench.map((p, i) => (
            <div key={p.playerId} className={styles.benchCard}>
              <div className={styles.benchSlot}>
                {BENCH_SLOTS[i]} · {p.position}
              </div>
              <PlayerSlot player={p} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/**
 * The markings.
 *
 * Drawn rather than implied by a border, so the penalty area, the six-yard box,
 * the spot, the halfway line and the centre circle all sit where a pitch puts
 * them. Goal at the top; the halfway line is the bottom edge, which is why the
 * forwards stand against it.
 */
function PitchLines() {
  const stroke = { fill: 'none', stroke: 'rgba(255,255,255,.30)', strokeWidth: 1 }
  return (
    <svg className={styles.lines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x="1" y="1" width="98" height="98" {...stroke} />
      <rect x="26" y="1" width="48" height="17" {...stroke} />
      <rect x="38" y="1" width="24" height="7" {...stroke} />
      <circle cx="50" cy="14" r="0.8" fill="rgba(255,255,255,.30)" />
      <path d="M34 18 A 20 9 0 0 0 66 18" {...stroke} />
      <line x1="1" y1="99" x2="99" y2="99" {...stroke} />
      <circle cx="50" cy="99" r="13" {...stroke} />
    </svg>
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
