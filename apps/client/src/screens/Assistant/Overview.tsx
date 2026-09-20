/**
 * The Assistant Overview — the week in one read (F8).
 *
 * **This screen holds no logic.** Every figure comes from `calls/week.ts` and
 * `calls/scenario.ts`, which is what makes `F8-AC-06` true: the tally, the
 * headline count and the flagged summary are three readings of one pair of
 * lists, so no two of them can disagree. `tests/client/surface-rules.test.ts`
 * asserts the rule on the source.
 *
 * **Anatomy follows the handoff, behaviour follows the criteria** (`docs/design`).
 * So the squad widget wears a green header carrying the plan's figures, players
 * are kit-coloured squares with a three-letter surname, and a call row collapses
 * its decision into one status control rather than splaying three buttons — all
 * of which are *how*, not *what*.
 *
 * **The Chips section (F8-AC-34) is deliberately absent** — F5 is below the cut
 * line, so a preview row would open a tab that does not exist. Ruled
 * 2026-09-15; the criterion is owned by STE-70 and ships with F5.
 */

import { useState } from 'react'
import type { DecisionState, World, WorldCall, WorldPlayer } from '../../api'
import { type Filter, type Scenario, scenarioFor } from '../../calls/scenario'
import { armbandLabel, availabilityFor, formatCost, formatMoney, formatNet, thisWeekNet } from '../../calls/view'
import type { Week } from '../../calls/week'
import { benchInOrder, displaySurname, startersByPosition } from '../../squad/format'
import { kitFor } from '../../squad/kits'
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

/** Three letters, as the design's markers carry them. */
const short = (surname: string): string => surname.slice(0, 3).toUpperCase()

/** What changed about a player between the two sides, for the marker's border. */
type Move = 'in' | 'out' | 'moved' | null

function movesIn(before: readonly WorldPlayer[], after: readonly WorldPlayer[]): Map<number, Move> {
  const wasById = new Map(before.map((p) => [p.playerId, p]))
  const nowById = new Map(after.map((p) => [p.playerId, p]))
  const moves = new Map<number, Move>()

  for (const p of after) {
    const was = wasById.get(p.playerId)
    if (!was) moves.set(p.playerId, 'in')
    else if (was.isStarter !== p.isStarter || was.benchOrder !== p.benchOrder) moves.set(p.playerId, 'moved')
  }
  for (const p of before) if (!nowById.has(p.playerId)) moves.set(p.playerId, 'out')
  return moves
}

/** Only the departures, for the BEFORE side. */
const leaving = (moves: Map<number, Move>): Map<number, Move> =>
  new Map([...moves].filter(([, move]) => move === 'out'))

function Marker({ player, move }: { player: WorldPlayer; move: Move }) {
  const kit = kitFor(player.clubShortName)
  return (
    <span className={styles.marker}>
      <span
        className={`${styles.chip} ${move ? (styles[move] ?? '') : ''}`}
        style={{ background: kit.primary, color: kit.ink }}
      >
        {/* **Both armbands, because the advice moves both** (STE-147). The
            vice was invisible here while the AFTER pitch was the one place a
            manager could see the whole recommendation at a glance — so the half
            that changed silently was the half he could not check. Filled for the
            captain, outlined for the vice, exactly as the Captain tab draws
            them, and both on the same corner so the pair reads as one kind of
            mark. */}
        {player.isCaptain ? <span className={styles.armband}>C</span> : null}
        {player.isVice ? <span className={`${styles.armband} ${styles.armbandVice}`}>V</span> : null}
      </span>
      <span className={styles.markerName}>{short(player.name)}</span>
    </span>
  )
}

/** Eleven and bench, small enough for two side by side at 390 (F8-AC-09). */
function MiniPitch({ label, players, moves }: { label: string; players: WorldPlayer[]; moves: Map<number, Move> }) {
  const lines = startersByPosition(players)
  return (
    <div className={styles.mini}>
      <div className={styles.miniLabel}>{label}</div>
      <div className={styles.miniPitch}>
        {(['GKP', 'DEF', 'MID', 'FWD'] as const).map((row) => (
          <div key={row} className={styles.miniRow}>
            {lines[row].map((p) => (
              <Marker key={p.playerId} player={p} move={moves.get(p.playerId) ?? null} />
            ))}
          </div>
        ))}
      </div>
      <div className={styles.miniBench}>
        {benchInOrder(players).map((p) => (
          <Marker key={p.playerId} player={p} move={moves.get(p.playerId) ?? null} />
        ))}
      </div>
    </div>
  )
}

/**
 * The fixture chip beside a call's flag (F8-AC-31). **Read off the fixture list,
 * never off a projection** — the count is the FPL feed's and the projection is
 * the other feed's, and inferring one from the other is the data rule this build
 * most needs to get right.
 */
function FixtureChip({ world, call }: { world: World; call: WorldCall }) {
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
  /** Which card has its decision panel open. One at a time, so rows stay level. */
  const [deciding, setDeciding] = useState<string | null>(null)

  const playerById = new Map([...world.players, ...world.candidates].map((p) => [p.playerId, p]))
  const scenario: Scenario = scenarioFor(world, week.live, filter, decisions)
  const visible = new Set(scenario.calls.map((c) => c.key))
  const moves = movesIn(scenario.before, scenario.after)

  /**
   * Title and sub-line, in the design's own shapes.
   *
   * **Both names are shortened.** A row is one line and the same height as every
   * other, so a long pair silently cut the incoming player off the end —
   * "Junqueira de Jesus → Calvert-Lewin" showed the player being dropped and not
   * the one arriving, which is the half that matters (found 2026-09-15).
   */
  function titleOf(call: WorldCall): string {
    const out = displaySurname(nameOf(call.outPlayerId))
    const into = displaySurname(nameOf(call.inPlayerId))
    // **A result, not a move.** One definition, in `calls/view.ts`, because
    // this screen and the card drifted apart the first day they both named it.
    const armband = armbandLabel(call, (id) => displaySurname(nameOf(id)))
    if (armband !== null) return armband
    // Rows written before 2026-09-20. Readable, never produced again.
    if (call.shape === 'captain') return `Armband: ${out} → ${into}`
    if (call.shape === 'vice') return `Vice armband: ${out} → ${into}`
    if (call.shape === 'bench_order') return `Bench order: ${into} to 1`
    return `${out} → ${into}`
  }

  function sublineOf(call: WorldCall): string {
    const out = playerById.get(call.outPlayerId)
    const into = playerById.get(call.inPlayerId)
    if (call.shape === 'bench_order') return 'auto-sub cover'
    /**
     * **The armband's sub-line is about the captain pick, not a swap.** Every
     * other line here reads `out → in`, and the armband borrowed it — so the
     * row said "MID · FUL → MUN", which is the outgoing holder's club pointing
     * at the incoming pick's club as though one were replacing the other. It is
     * one call stating a result (STE-151), so the line describes the player the
     * armband is going on: his position and who he plays.
     */
    const captainPick = call.breakdown.armband?.rows.find((r) => r.isCaptainPick)
    if (captainPick) {
      const pick = playerById.get(captainPick.playerId)
      if (!pick) return ''
      const first = pick.fixtures[0]
      const fixture = first === undefined ? 'no fixture' : `${first.opponentShortName} (${first.isHome ? 'H' : 'A'})`
      return `${pick.position} · ${fixture}`
    }
    if (!out) return ''
    if (call.category === 'transfer') {
      return `${out.position} · ${out.clubShortName} → ${into?.clubShortName ?? '—'}`
    }
    if (call.shape === 'forced_swap') {
      const gate = availabilityFor(out)
      const why = gate.eligible ? 'no fixture' : gate.reason.replace(/_/g, ' ')
      return `${out.position} · ${why}`
    }
    if (call.shape === 'doubt_swap') {
      const chance = out.chanceOfPlayingNextRound
      return `${out.position} · ${chance === null ? 'flagged' : `${String(chance)}% doubt`}`
    }
    return `${out.position} · ${out.clubShortName} → ${into?.clubShortName ?? '—'}`
  }

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
            {world.editorial ?? 'Your calls are below. The Gaffer writes his read of the week on the next run.'}
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
        {/* The plan's three figures, on the card they describe (F8-AC-10). */}
        <div className={styles.widgetHead}>
          <span className={styles.widgetTitle}>SQUAD</span>
          <span className={styles.widgetFigures}>
            <span data-testid="scenario-xpts">
              {/* **The change, not the total.** Two squads side by side are
                  asking whether the plan is an improvement, and an absolute
                  total answers a different question (ruled 2026-09-15). Net of
                  any points hit, so the cost of an extra transfer is inside the
                  figure being judged (F8-AC-10). */}
              xPTS <strong>{scenario.delta >= 0 ? '+' : '−'}{Math.abs(scenario.delta).toFixed(1)}</strong>
            </span>
            <span data-testid="scenario-nbal">
              NBAL <strong className={scenario.nbalTenths < 0 ? styles.over : ''}>{formatMoney(scenario.nbalTenths)}</strong>
            </span>
          </span>
          {/* Red with the deduction stated in plain terms (F8-AC-11, F3-UP-02). */}
          <span className={scenario.hit > 0 ? styles.ftOver : styles.ft} data-testid="scenario-ft">
            FT {scenario.transfersUsed}/{scenario.transfersAllowed}
            {scenario.hit > 0 ? ` · −${scenario.hit} PTS` : ''}
          </span>
        </div>

        {/* **Each side carries the half it can show.** BEFORE marks who is
            leaving, AFTER who is arriving or moving — marking an incoming player
            on the squad he is not in yet would be drawing the future on the
            present. */}
        <div className={styles.pitches}>
          <MiniPitch label="BEFORE" players={scenario.before} moves={leaving(moves)} />
          <MiniPitch label="AFTER" players={scenario.after} moves={moves} />
        </div>

        <div className={styles.legend} aria-hidden="true">
          <span><i className={`${styles.key} ${styles.keyIn}`} /> IN</span>
          <span><i className={`${styles.key} ${styles.keyOut}`} /> OUT</span>
          <span><i className={`${styles.key} ${styles.keyMoved}`} /> MOVED</span>
        </div>

        {/* ── Filter chips, inside the widget they change ───────────────── */}
        <nav className={styles.chips} aria-label="Filter">
          {FILTERS.map((f) => {
            const breached = scenarioFor(world, week.live, f.id, decisions).breaches.length > 0
            return (
              <button
                key={f.id}
                className={filter === f.id ? styles.chipOn : styles.chipOff}
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

      {/* **Stated, not inferred** (F8-AC-25). The counter-intuitive half: under a
          band filter the After squad is the advice as given, rejections
          included. */}
      {filter === 'forced' || filter === 'recommended' ? (
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
              <span>{group.label.toUpperCase()}</span>
              <span className={styles.groupMeta}>{metaFor(group.category, all)}</span>
            </header>

            {here.map((call) => {
              const decided = decisions[call.key]
              const open = deciding === call.key
              return (
                <article
                  key={call.key}
                  className={[
                    styles.card,
                    call.isForced ? styles.cardForced : '',
                    decided === 'rejected' ? styles.rejected : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-testid={`card-${call.key}`}
                >
                  {/* Two adjacent panels with a visible seam, so a decision
                      control never sits inside a fully tappable card
                      (F8-AC-28). */}
                  <button className={styles.cardContent} onClick={() => onOpen(call)} type="button">
                    <span className={styles.cardTop}>
                      <span className={styles.cardTitle}>{titleOf(call)}</span>
                      {call.isForced ? (
                        <span className={styles.forcedFlag}>FORCED</span>
                      ) : call.watch ? (
                        <span className={styles.watchFlag}>WATCH</span>
                      ) : null}
                      <FixtureChip world={world} call={call} />
                      <span className={styles.chevron} aria-hidden="true">
                        ›
                      </span>
                    </span>

                    <span className={styles.cardSub}>{sublineOf(call)}</span>

                    {/* Labels above values, as every figure column in the
                        handoff does. */}
                    <span className={styles.cardFigures}>
                      <span>
                        {/* This gameweek's difference, not the three-week net
                            the conviction is built from — the detail card shows
                            that one, where the horizon is on screen to explain
                            it (ruled 2026-09-15). */}
                        <span className={styles.eyebrow}>xPTS</span>
                        <span className={styles.figureGood}>{formatNet(thisWeekNet(call))}</span>
                      </span>
                      <span>
                        <span className={styles.eyebrow}>COST</span>
                        <span className={styles.figure}>{formatCost(call.costTenths)}</span>
                      </span>
                      <span className={styles.convictionCell}>
                        <span className={styles.eyebrow}>CONVICTION</span>
                        {call.conviction !== null && call.band !== null ? (
                          <span className={`${styles.conviction} ${styles[call.band] ?? ''}`}>{call.conviction}%</span>
                        ) : (
                          <span className={styles.figure}>—</span>
                        )}
                      </span>
                    </span>
                  </button>

                  {/* **One status control, not three splayed buttons.** The
                      three actions are one tap away, which is what keeps every
                      row the same height (F8-AC-29, handoff §5). */}
                  <div className={styles.cardDecision}>
                    <span className={decided === undefined ? styles.state : styles.stateDecided}>
                      {decided === undefined ? 'PENDING\nREVIEW' : decided.toUpperCase()}
                    </span>
                    {open ? (
                      <span className={styles.actions}>
                        <button
                          className={styles.action}
                          onClick={() => {
                            onDecide(call, 'selected')
                            setDeciding(null)
                          }}
                          type="button"
                        >
                          Select
                        </button>
                        <button
                          className={styles.action}
                          onClick={() => {
                            onDecide(call, 'rejected')
                            setDeciding(null)
                          }}
                          type="button"
                        >
                          Reject
                        </button>
                        <button
                          className={styles.action}
                          onClick={() => {
                            if (decided !== undefined) onDecide(call, 'pending')
                            setDeciding(null)
                          }}
                          type="button"
                        >
                          Later
                        </button>
                      </span>
                    ) : (
                      <button
                        className={styles.change}
                        onClick={() => setDeciding(call.key)}
                        data-testid={`change-${call.key}`}
                        type="button"
                      >
                        CHANGE ▾
                      </button>
                    )}
                  </div>
                </article>
              )
            })}

            {/* A filter hides; it never recolours (F8-AC-32, F8-AC-33). */}
            {hidden > 0 ? (
              <p className={styles.hidden} data-testid={`hidden-${group.category}`}>
                {hidden} hidden by filter ·{' '}
                <button
                  className={styles.showAll}
                  onClick={() => {
                    setFilter('all')
                    onShowAll()
                  }}
                  type="button"
                >
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
 * The group meta (F8-AC-27).
 *
 * **A count, like the other two** (rewritten 2026-09-20). It used to read
 * *"1 pick · 1 held"* or *"2 picks"*, a format whose whole job was counting two
 * armband calls against each other. There is one now, so the count says what it
 * says everywhere else and the category stops being the odd one out.
 *
 * It still never splits into a fourth category — that part of F8-AC-27 survives
 * the rewrite, because the armband is one decision however it is drawn.
 */
function metaFor(category: WorldCall['category'], all: WorldCall[]): string {
  return `${all.length} suggested`
}
