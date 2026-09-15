/**
 * Head to head — one call, as a card that fills the screen (F3-AC-21).
 *
 * Versus band, summary strip, one flag, the evaluation table, the reasoning, and
 * three tiles that draw the three gestures (F3-AC-07, F3-AC-08). The table is the
 * only region that scrolls. A bench-order call and a substitution use exactly the
 * same card and the same master rows as a transfer (F3-AC-05, F3-AC-16).
 *
 * **Every figure is a value handed in.** Conviction is labelled *strength*
 * everywhere — it states how strong the call is, never how probable it is to be
 * right (ENGINE-AC-05).
 */

import { type PointerEvent, useRef, useState } from 'react'
import type { WorldPlayer } from '../../api'
import avatar from '../../assets/gaffer-avatar.png'
import { armbandNotes, formatCost, formatMoney, formatNet, formatRowValue, readingLine } from '../../calls/view'
import { DifficultyBars, FixturePill } from '../Squad/parts'
import styles from './Assistant.module.css'
import type { Shown } from './AssistantScreen'

/** How far a drag has to travel before it is a decision rather than a wobble. */
const SWIPE = 70

type Picker = { outs: WorldPlayer[]; ins: WorldPlayer[]; onSwap: (side: 'out' | 'in', playerId: number) => void }

export function HeadToHead({
  shown,
  gameweekId,
  onDecide,
  picker,
}: {
  shown: Shown
  gameweekId: number
  onDecide: (state: 'selected' | 'rejected' | 'pending') => void
  picker?: Picker | undefined
}) {
  const { call, out, into, figures } = shown
  const [pickerSide, setPickerSide] = useState<'out' | 'in' | null>(null)
  const [explained, setExplained] = useState(false)
  const [whyWatch, setWhyWatch] = useState(false)
  const [drag, setDrag] = useState({ dx: 0, dy: 0 })
  const start = useRef<{ x: number; y: number } | null>(null)

  /**
   * A keep reading: the app has an answer and the answer is *nothing to do*
   * (F4-AC-02). It is not decidable, and that has to be true of both routes into
   * a decision — the three tiles below, and the swipe. Suppressing only the tiles
   * would leave a swipe that files a decision on a card with no decision in it.
   */
  const decidable = figures.reading === 'call'
  const isForced = figures.reading === 'call' && figures.isForced
  // At most one flag, and FORCED outranks WATCH (F3-AC-17). WATCH reads WATCH with
  // no qualifier; its reason is one tap away (F3-AC-18).
  const watchReason = isForced ? null : figures.watchReason

  // Swipes start anywhere on the card except the table, which scrolls.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!decidable) return
    if ((e.target as HTMLElement).closest('[data-scrolls]')) return
    start.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    setDrag({ dx: e.clientX - start.current.x, dy: e.clientY - start.current.y })
  }
  const onPointerUp = () => {
    if (!start.current) return
    const { dx, dy } = drag
    start.current = null
    setDrag({ dx: 0, dy: 0 })
    if (Math.abs(dx) > Math.abs(dy) && dx > SWIPE) onDecide('selected')
    else if (Math.abs(dx) > Math.abs(dy) && dx < -SWIPE) onDecide('rejected')
    else if (dy < -SWIPE) onDecide('pending')
  }

  // **A captaincy keep is not a comparison** (F4 happy path, amended 2026-09-14).
  // Shown as a head-to-head it puts two players and a decision panel in front of
  // the manager and then tells him not to act, which reads as a choice he is
  // expected to resolve. A transfer that recomputes to no change keeps the
  // head-to-head, because there the manager asked for the comparison himself.
  if (!decidable && call.category === 'captaincy') {
    return (
      <Keep shown={shown} />
    )
  }

  return (
    <div className={styles.h2h}>
      <div
        className={styles.card}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform: `translate(${drag.dx}px, ${Math.min(0, drag.dy)}px) rotate(${drag.dx / 30}deg)` }}
      >
        <div className={styles.versus}>
          <Side player={out} direction="out" onChange={picker ? () => setPickerSide('out') : undefined} />
          <span className={styles.vs}>VS</span>
          <Side player={into} direction="in" onChange={picker ? () => setPickerSide('in') : undefined} />
        </div>

        <div className={styles.strip}>
          <span className={styles.stripCell}>
            <span className={styles.stripLabel}>NET</span>
            <span data-testid="net" className={styles.stripValue}>
              {formatNet(figures.net)}
            </span>
          </span>
          <span className={styles.stripCell}>
            <span className={styles.stripLabel}>COST</span>
            <span data-testid="cost" className={styles.stripValue}>
              {formatCost(figures.costTenths)}
            </span>
          </span>
          <span className={styles.stripCell}>
            <span className={styles.stripLabel}>STRENGTH</span>
            {figures.reading === 'call' ? (
              <span data-testid="strength" className={`${styles.strength} ${styles[figures.band] ?? ''}`}>
                {figures.conviction} · {figures.band}
              </span>
            ) : (
              <span data-testid="strength" className={styles.noChange}>
                no change
              </span>
            )}
          </span>
          {isForced ? <span className={styles.flagForced}>FORCED</span> : null}
        {/* What the last refresh did to this call, until the card has been seen
            (F6-AC-13). Truncates before the title does, because the title is
            what tells the manager which call he is looking at. */}
        {/* `!= null` on purpose, covering undefined as well as null: a call row
            written before these columns existed carries neither, and a strict
            null check would let `undefined` through and then read a property off
            it — taking the whole screen down over a field nobody can see. */}
        {call.diffTag != null ? (
          <span data-testid="diff-tag" className={styles.diffTag}>
            {call.diffTag === 'band_move' && call.previousConviction != null
              ? `WAS ${String(call.previousConviction)}`
              : call.diffTag.toUpperCase()}
          </span>
        ) : null}
          {watchReason ? (
            <button
              className={styles.flagWatch}
              onClick={() => setWhyWatch((v) => !v)}
              aria-expanded={whyWatch}
              type="button"
            >
              WATCH
            </button>
          ) : null}
        </div>

        {watchReason && whyWatch ? (
          <p data-testid="watch-reason" className={styles.watchNote}>
            {watchReason}
          </p>
        ) : null}

        {pickerSide && picker ? (
          <div className={styles.picker}>
            <div className={styles.pickerHead}>
              <span>{pickerSide === 'out' ? 'REPLACE THE PLAYER GOING OUT' : 'CHOOSE A DIFFERENT PLAYER COMING IN'}</span>
              <button className={styles.linkButton} onClick={() => setPickerSide(null)} type="button">
                close ✕
              </button>
            </div>
            <div className={styles.pickerList} data-scrolls>
              {(pickerSide === 'out' ? picker.outs : picker.ins).map((p) => (
                <button
                  key={p.playerId}
                  className={styles.pickerItem}
                  onClick={() => {
                    picker.onSwap(pickerSide, p.playerId)
                    setPickerSide(null)
                  }}
                  type="button"
                >
                  <span className={styles.pickerName}>{p.surname}</span>
                  <span className={styles.pickerMeta}>
                    {p.clubShortName} · {formatMoney(p.nowCostTenths)} · xPts {p.projectedPoints.toFixed(1)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.table} data-scrolls>
            {figures.rows.map((row) => (
              <div key={row.key} className={styles.row}>
                <Cell win={row.winner === 'out'} align="left">
                  {row.key === 'fixtures' ? <Fixtures player={out} /> : formatRowValue(row.key, row.out)}
                </Cell>
                <span className={styles.mark} aria-hidden="true">
                  {row.winner === 'tie' ? '=' : row.winner === 'out' ? '◀' : ''}
                </span>
                <span className={styles.rowLabel}>{row.label}</span>
                <span className={styles.mark} aria-hidden="true">
                  {row.winner === 'in' ? '▶' : ''}
                </span>
                <Cell win={row.winner === 'in'} align="right">
                  {row.key === 'fixtures' ? <Fixtures player={into} /> : formatRowValue(row.key, row.in)}
                </Cell>
              </div>
            ))}

            <button className={styles.explainToggle} onClick={() => setExplained((v) => !v)} type="button">
              {explained ? 'Hide how this was calculated' : 'How this was calculated'}
            </button>
            {explained ? <Explained shown={shown} gameweekId={gameweekId} /> : null}
          </div>
        )}

        {/* The model's line is clamped to four lines and capped at 180
            characters, which is what makes that clamp safe (F3-AC-21, F3-AC-22).
            **The armband notes are not the model's and must not share its
            budget**: concatenated into the same paragraph they pushed the vice
            premise off the bottom of the card with no way to reach it, which
            F4-AC-05 requires to be readable. They sit on their own line. */}
        <div className={styles.reasoning}>
          <img className={styles.gaffer} src={avatar} alt="" />
          <div className={styles.reasoningBody}>
            <p data-testid="reasoning" className={styles.reasoningText}>
              {figures.reasoning}
            </p>
            {armbandNotes(call).map((note) => (
              <p key={note} data-testid="armband-note" className={styles.reasoningNote}>
                {note}
              </p>
            ))}
          </div>
        </div>
      </div>

      {decidable ? (
        <div className={styles.tiles}>
          <button className={styles.tileReject} onClick={() => onDecide('rejected')} type="button">
            <span aria-hidden="true">←</span>
            Reject
          </button>
          <button className={styles.tileLater} onClick={() => onDecide('pending')} type="button">
            <span aria-hidden="true">↑</span>
            Later
          </button>
          <button className={styles.tileSelect} onClick={() => onDecide('selected')} type="button">
            <span aria-hidden="true">→</span>
            Select
          </button>
        </div>
      ) : (
        <div data-testid="reading-panel" className={styles.readingPanel}>
          <span className={styles.readingTitle}>No change · nothing to do</span>
          <span className={styles.readingWhy}>{readingLine(figures.because)}</span>
        </div>
      )}
    </div>
  )
}

/**
 * The armband is already on the right player, so the card says that and stops.
 *
 * One player, his projected points, and why. **No versus, no second player, no
 * evaluation table and no decision panel** — there is no decision here to make,
 * and every one of those elements implies there is.
 */
function Keep({
  shown,
}: {
  shown: Shown
}) {
  const { call, out, figures } = shown
  const role = call.shape === 'vice' ? 'vice-captaincy' : 'captaincy'

  return (
    <div className={styles.h2h}>
      <div className={`${styles.card} ${styles.keepCard}`} data-testid="keep-card">
        <span className={styles.keepEyebrow}>No change · nothing to do</span>
        <span className={styles.keepName}>{out.surname}</span>
        <span className={styles.keepMeta}>
          {out.clubShortName} · {out.position}
        </span>
        <span data-testid="keep-points" className={styles.keepPoints}>
          {out.projectedPoints.toFixed(1)}
          <span className={styles.keepPointsLabel}> xPts this gameweek</span>
        </span>
        {/* **The verdict has to be true of *this* keep.** "Nobody projects
            higher" is right when the figures produced the keep, and false when
            the rejection did (F4-UP-02): there the armband stays because the
            captain change was turned down, and claiming he is the strongest
            option asserts something the app has not concluded. */}
        <p className={styles.keepVerdict}>{keepVerdict(figures, role)}</p>

        <div className={styles.reasoning}>
          <img className={styles.gaffer} src={avatar} alt="" />
          <div className={styles.reasoningBody}>
            <p data-testid="reasoning" className={styles.reasoningText}>
              {figures.reasoning}
            </p>
            {armbandNotes(call).map((note) => (
              <p key={note} data-testid="armband-note" className={styles.reasoningNote}>
                {note}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Why this armband is staying where it is, in the manager's terms.
 *
 * Three reasons, and they are genuinely different things to say. Two come from
 * the engine — the holder is ahead, or the two are too close to separate. The
 * third is the manager's own doing and the engine cannot know it: he turned down
 * the captain change, so the pair would otherwise contradict itself (F4-UP-02).
 */
function keepVerdict(figures: Shown['figures'], role: 'captaincy' | 'vice-captaincy'): string {
  const band = role === 'vice-captaincy' ? 'vice armband' : 'armband'
  if (figures.reading !== 'no_change') return `He keeps the ${band}.`

  if (figures.because === 'captain_kept') {
    return `You kept your captain, so the ${band} stays where it is too — moving it now would leave the pair contradicting each other.`
  }
  if (figures.because === 'below_floor') {
    return `Nobody in your eleven is far enough clear of him to justify moving the ${band}.`
  }
  return `Nobody in your eleven projects higher. He keeps the ${band}.`
}

function Side({ player, direction, onChange }: { player: WorldPlayer; direction: 'out' | 'in'; onChange?: (() => void) | undefined }) {
  return (
    <div className={direction === 'out' ? styles.side : styles.sideRight}>
      <span className={styles.dir}>{direction === 'out' ? '▼ OUT' : 'IN ▲'}</span>
      <span data-testid={`${direction}-name`} className={styles.name}>
        {player.surname}
      </span>
      <span className={styles.meta}>
        {player.clubShortName} · {player.position} · {formatMoney(player.nowCostTenths)}
        {player.benchOrder !== null && player.benchOrder > 0 ? ` · bench ${String(player.benchOrder)}` : ''}
      </span>
      {onChange ? (
        <button className={styles.change} onClick={onChange} type="button" aria-label={`Change ${direction}`}>
          CHANGE ⇄
        </button>
      ) : null}
    </div>
  )
}

/** The winning value in a green pill; the losing value plain; a tie neither (F3-AC-19, F3-AC-20). */
function Cell({ win, align, children }: { win: boolean; align: 'left' | 'right'; children: React.ReactNode }) {
  return (
    <span className={align === 'left' ? styles.cellLeft : styles.cellRight}>
      <span className={win ? styles.win : styles.plain}>{children}</span>
    </span>
  )
}

/** This week's fixture pill, then a bar for each of the next two (F3-AC-32, F3-AC-33). */
function Fixtures({ player }: { player: WorldPlayer }) {
  return (
    <span className={styles.fixtures}>
      <FixturePill fixtures={player.fixtures} />
      <DifficultyBars next={player.nextThree} />
    </span>
  )
}

/**
 * How this was calculated (F3-AC-30, F3-AC-31): each side's projections exactly
 * as the feed publishes them, the gate's verdict and its source, the weighted
 * horizon totals, the net, any points hit and the k used. Every value is
 * published or already computed — nothing is calculated here.
 */
function Explained({ shown, gameweekId }: { shown: Shown; gameweekId: number }) {
  const b = shown.figures.breakdown
  const side = (label: string, name: string, s: typeof b.out) => (
    <div className={styles.explainSide}>
      <span className={styles.explainName}>
        {label} — {name}
      </span>
      <span>
        {s.projections.map((p, i) => `GW${String(gameweekId + i)} ${p.toFixed(2)}`).join(' · ')}
      </span>
      <span>
        Availability: {s.gate.eligible ? 'passes the gate' : `excluded — ${s.gate.reason ?? 'unavailable'}`} (FPL)
      </span>
      <span>Weighted total: {s.total.toFixed(2)}</span>
    </div>
  )

  return (
    <div className={styles.explain}>
      {side('Out', shown.out.surname, b.out)}
      {side('In', shown.into.surname, b.in)}
      <span>Weights: {b.weights.map((w) => w.toFixed(2)).join(' / ')}</span>
      <span>
        Net {formatNet(b.net)} · points hit {String(b.pointsHit)} · k {b.k.toFixed(1)} ({b.kLabel})
      </span>
      {b.byCeiling ? <span>Within the noise floor on projected points, so the ceiling tie-break chose this side.</span> : null}
      <span>Projections from Fantasy Football IQ; availability from FPL.</span>
    </div>
  )
}
