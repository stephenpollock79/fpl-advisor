/**
 * The Assistant Overview — the week in one read (F8).
 *
 * **This screen holds no logic.** Every figure on it comes from `calls/week.ts`
 * and `calls/scenario.ts`, which is what makes `F8-AC-06` true: the tally, the
 * headline count and the flagged summary are three readings of one pair of
 * lists, so no two of them can disagree. A component that recomputed any of
 * them would pass every test and put two answers on one card
 * (`tests/client/surface-rules.test.ts` asserts the rule on the source).
 *
 * **The Chips section (F8-AC-34) is deliberately absent** — F5 is below the cut
 * line, so a preview row would open a tab that does not exist. Ruled on
 * 2026-09-15; the criterion is owned by STE-70 and ships with F5.
 */

import { useState } from 'react'
import type { DecisionState, World, WorldCall, WorldPlayer } from '../../api'
import { type Filter, type Scenario, scenarioFor } from '../../calls/scenario'
import { formatMoney, formatNet } from '../../calls/view'
import type { Week } from '../../calls/week'
import { benchInOrder, displaySurname, startersByPosition } from '../../squad/format'
import styles from './Overview.module.css'

/** The four chips, in the criteria's own order (F8-AC-20 – F8-AC-23). */
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'forced', label: 'Forced only' },
  { id: 'recommended', label: 'Forced + rec.' },
  { id: 'selected', label: 'Selected' },
]

/** The three groups, in the criteria's own order (F8-AC-27). */
const GROUPS: { category: WorldCall['category']; label: string }[] = [
  { category: 'transfer', label: 'Transfers' },
  { category: 'substitution', label: 'Substitutions' },
  { category: 'captaincy', label: 'Captain' },
]

type Props = {
  world: World
  week: Week
  decisions: Record<string, DecisionState>
  nameOf: (playerId: number) => string
  onOpen: (call: WorldCall) => void
  onDecide: (call: WorldCall, state: DecisionState | 'pending') => void
  onShowAll: () => void
}

/** Eleven and bench, at a size that fits two side by side (F8-AC-09). */
function MiniPitch({ label, players }: { label: string; players: WorldPlayer[] }) {
  const lines = startersByPosition(players)
  return (
    <div className={styles.mini}>
      <div className={styles.miniLabel}>{label}</div>
      <div className={styles.miniPitch}>
        {(['GKP', 'DEF', 'MID', 'FWD'] as const).map((row) => (
          <div key={row} className={styles.miniRow}>
            {lines[row].map((p) => (
              <span key={p.playerId} className={styles.miniSlot} title={p.surname}>
                {displaySurname(p.surname)}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className={styles.miniBench}>
        {benchInOrder(players).map((p) => (
          <span key={p.playerId} className={styles.miniBenchSlot}>
            {displaySurname(p.surname)}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * The fixture chip beside a call's flag (F8-AC-31), so an exceptional week is
 * visible without opening the call. **Read off the fixture list, never off a
 * projection** — the count is the FPL feed's and the projection is the other
 * feed's, and inferring one from the other is the data rule this build most
 * needs to get right.
 */
function FixtureChip({ world, call, nameOf }: { world: World; call: WorldCall; nameOf: (id: number) => string }) {
  void nameOf
  const sides = [call.outPlayerId, call.inPlayerId]
    .map((id) => [...world.players, ...world.candidates].find((p) => p.playerId === id))
    .filter((p): p is WorldPlayer => p !== undefined)

  if (sides.some((p) => p.fixtures.length === 0)) return <span className={styles.blankChip}>BLANK</span>
  if (sides.some((p) => p.fixtures.length > 1)) return <span className={styles.doubleChip}>×2</span>
  return null
}

export function Overview({ world, week, decisions, nameOf, onOpen, onDecide, onShowAll }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState(false)

  const scenario: Scenario = scenarioFor(world, week.live, filter, decisions)
  const visible = new Set(scenario.calls.map((c) => c.key))

  return (
    <div className={styles.column} data-testid="overview">
      {/* ── The editorial card ─────────────────────────────────────────── */}
      <section className={styles.editorial} aria-label="The week in one read">
        <div className={styles.editorialHead}>
          <span>THE WEEK IN ONE READ</span>
          <span className={styles.editorialCount} data-testid="decided">
            {week.decidedLine}
          </span>
        </div>

        <div className={styles.editorialBody}>
          {/* Code's sentence, not the model's: a criterion saying the editorial
              *must* lead with a blank or a double cannot be met by a prompt. */}
          {week.exceptionLead ? (
            <p className={styles.lead} data-testid="exception-lead">
              {week.exceptionLead}
            </p>
          ) : null}

          <p className={expanded ? styles.prose : styles.proseClamped} data-testid="editorial">
            {world.editorial ?? 'Your week is below.'}
          </p>
          <button className={styles.more} onClick={() => setExpanded((e) => !e)} type="button">
            {expanded ? 'LESS' : 'MORE'}
          </button>

          {/* Forced first, then the bands in their ramp colours (F8-AC-03). */}
          <div className={styles.tally} data-testid="tally">
            {week.tally.forced > 0 ? (
              <span className={styles.forcedPill}>{week.tally.forced} forced</span>
            ) : null}
            {week.tally.bands.map((b) => (
              <span key={b.band} className={`${styles.bandPill} ${styles[b.band] ?? ''}`}>
                {b.count} {b.band}
              </span>
            ))}
            {week.tally.forced === 0 && week.tally.bands.length === 0 ? (
              <span className={styles.tallyEmpty}>nothing outstanding</span>
            ) : null}
          </div>

          {/* The line that makes the freshness claim true (F8-AC-04). */}
          <p className={styles.squadState} data-testid="squad-state">
            {week.squadStateLine}
          </p>

          {week.flaggedLine ? (
            <p className={styles.flagged} data-testid="flagged-summary">
              {week.flaggedLine}
            </p>
          ) : null}
        </div>
      </section>

      {/* ── The squad widget ───────────────────────────────────────────── */}
      <section className={styles.widget} aria-label="Before and after">
        <div className={styles.pitches}>
          <MiniPitch label="BEFORE" players={scenario.before} />
          <MiniPitch label="AFTER" players={scenario.after} />
        </div>

        <div className={styles.totals}>
          <span>
            <span className={styles.eyebrow}>xPTS</span>
            <span className={styles.figure} data-testid="scenario-xpts">
              {scenario.projected.toFixed(1)}
            </span>
          </span>
          <span>
            <span className={styles.eyebrow}>NBAL</span>
            <span
              className={`${styles.figure} ${scenario.nbalTenths < 0 ? styles.negative : ''}`}
              data-testid="scenario-nbal"
            >
              {formatMoney(scenario.nbalTenths)}
            </span>
          </span>
          <span>
            <span className={styles.eyebrow}>FT</span>
            {/* Red, with the deduction stated in plain terms (F8-AC-11, F3-UP-02). */}
            <span
              className={`${styles.figure} ${scenario.hit > 0 ? styles.negative : ''}`}
              data-testid="scenario-ft"
            >
              {scenario.transfersUsed}/{scenario.transfersAllowed}
              {scenario.hit > 0 ? ` · −${scenario.hit} pts` : ''}
            </span>
          </span>
        </div>

        {/* Stated at plan level, never silently drawn and never blocked
            (F3-UP-01, F3-UP-02, F3-UP-03). */}
        {scenario.breaches.length > 0 ? (
          <div className={styles.breaches} role="status" data-testid="breaches">
            {scenario.breaches.map((b) => (
              <p key={b.message}>{b.message}</p>
            ))}
          </div>
        ) : null}
      </section>

      {/* ── Filter chips ───────────────────────────────────────────────── */}
      <nav className={styles.chips} aria-label="Filter">
        {FILTERS.map((f) => {
          const breached =
            scenarioFor(world, week.live, f.id, decisions).breaches.length > 0
          return (
            <button
              key={f.id}
              className={filter === f.id ? styles.chipOn : styles.chip}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              data-testid={`chip-${f.id}`}
              type="button"
            >
              {f.label}
              {/* Every chip carries the marker for its own scenario, so an
                  unimplementable plan is visible without switching to it
                  (F3-UP-03). */}
              {breached ? <span className={styles.chipMark}>!</span> : null}
            </button>
          )
        })}
      </nav>

      {/* **Stated, not inferred** (F8-AC-25). The counter-intuitive half: under a
          band filter the After squad is the advice as given, rejections
          included. */}
      {filter !== 'selected' && filter !== 'all' ? (
        <p className={styles.filterNote} data-testid="filter-note">
          Showing the advice as given — calls you rejected are still counted in After.
        </p>
      ) : null}

      {/* ── Call cards ─────────────────────────────────────────────────── */}
      {GROUPS.map((group) => {
        const all = week.live.filter((c) => c.category === group.category)
        const here = all.filter((c) => visible.has(c.key))
        const hidden = all.length - here.length
        if (all.length === 0) return null

        return (
          <section key={group.category} className={styles.group} aria-label={group.label}>
            <header className={styles.groupHead}>
              <span>{group.label}</span>
              <span className={styles.groupMeta}>{metaFor(group.category, all, world)}</span>
            </header>

            {here.map((call) => {
              const decided = decisions[call.key]
              return (
                <article
                  key={call.key}
                  className={decided === 'rejected' ? `${styles.card} ${styles.rejected}` : styles.card}
                  data-testid={`card-${call.key}`}
                >
                  {/* Two adjacent panels with a visible seam, so a decision
                      button never sits inside a fully tappable card
                      (F8-AC-28). */}
                  <button className={styles.cardContent} onClick={() => onOpen(call)} type="button">
                    <span className={styles.cardTitle}>
                      {nameOf(call.outPlayerId)} → {nameOf(call.inPlayerId)}
                    </span>
                    <span className={styles.cardMeta}>
                      <span className={styles.cardNet}>{formatNet(call.net)}</span>
                      {call.isForced ? (
                        <span className={styles.forcedFlag}>FORCED</span>
                      ) : call.watch ? (
                        <span className={styles.watchFlag}>WATCH</span>
                      ) : null}
                      <FixtureChip world={world} call={call} nameOf={nameOf} />
                      {call.conviction !== null && call.band !== null ? (
                        <span className={`${styles.cardBand} ${styles[call.band] ?? ''}`}>
                          {call.conviction} · {call.band}
                        </span>
                      ) : null}
                    </span>
                  </button>

                  <div className={styles.cardDecision}>
                    {decided !== undefined ? (
                      /* Already decided: a status pill and a Change control that
                         reopens the panel in place (F8-AC-29, F3-AC-10). */
                      <>
                        <span className={styles.pill}>{decided}</span>
                        <button
                          className={styles.change}
                          onClick={() => onDecide(call, 'pending')}
                          type="button"
                        >
                          Change
                        </button>
                      </>
                    ) : (
                      /* **Undecided: the same three actions as F3's gestures**,
                         and this is also where *Change* lands (F8-AC-29) — the
                         control reopens the decision panel in place.

                         **Not the two-way reopen/restore of Category cleared**
                         (F3-AC-14). That screen is a list of decisions already
                         made, where tapping twice means *put it back*; here the
                         card is the call itself, and a reopened one is simply
                         undecided again. Building the two-way control here made
                         *Change* offer only *Put back*, which is the opposite of
                         reopening the panel. */
                      <>
                        <button className={styles.action} onClick={() => onDecide(call, 'selected')} type="button">
                          Select
                        </button>
                        <button className={styles.action} onClick={() => onDecide(call, 'rejected')} type="button">
                          Reject
                        </button>
                        <button className={styles.action} onClick={() => onOpen(call)} type="button">
                          Later
                        </button>
                      </>
                    )}
                  </div>
                </article>
              )
            })}

            {/* A filter hides; it never recolours (F8-AC-32, F8-AC-33). */}
            {hidden > 0 ? (
              <p className={styles.hidden} data-testid={`hidden-${group.category}`}>
                {hidden} hidden by filter ·{' '}
                <button className={styles.showAll} onClick={() => { setFilter('all'); onShowAll() }} type="button">
                  Show all
                </button>
              </p>
            ) : null}
          </section>
        )
      })}

      <p className={styles.hint}>Tap a call for the full evaluation.</p>
    </div>
  )
}

/**
 * The group meta (F8-AC-27, F4-AC-03).
 *
 * Captaincy is the one that is not a count: the armband and the vice share this
 * group rather than splitting into a fourth, and a held armband is *held*, not a
 * pick. This is the sentence slice 6 deliberately left here rather than building
 * a second version in the tab strip.
 */
function metaFor(category: WorldCall['category'], all: WorldCall[], world: World): string {
  if (category !== 'captaincy') return `${all.length} suggested`

  const readings = world.calls.filter((c) => c.category === 'captaincy' && c.isReading).length
  const picks = all.length
  if (readings > 0 && picks > 0) return `${picks} pick${picks === 1 ? '' : 's'} · ${readings} held`
  if (readings > 0) return `${readings} held`
  return `${picks} pick${picks === 1 ? '' : 's'}`
}
