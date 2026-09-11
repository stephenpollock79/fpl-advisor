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
import { formatCost, formatMoney, formatNet, formatRowValue } from '../../calls/view'
import { DifficultyBars, FixturePill } from '../Squad/parts'
import styles from './Assistant.module.css'
import type { Shown } from './AssistantScreen'

const SHAPE_LABEL: Record<Shown['call']['shape'], string> = {
  transfer: 'TRANSFER',
  forced_swap: 'SUBSTITUTION',
  doubt_swap: 'SUBSTITUTION · DOUBT',
  upgrade_swap: 'SUBSTITUTION',
  bench_order: 'BENCH ORDER',
}

/** How far a drag has to travel before it is a decision rather than a wobble. */
const SWIPE = 70

type Picker = { outs: WorldPlayer[]; ins: WorldPlayer[]; onSwap: (side: 'out' | 'in', playerId: number) => void }

export function HeadToHead({
  shown,
  gameweekId,
  index,
  left,
  onPrev,
  onNext,
  onDecide,
  picker,
}: {
  shown: Shown
  gameweekId: number
  index: number
  left: number
  onPrev: () => void
  onNext: () => void
  onDecide: (state: 'selected' | 'rejected' | 'pending') => void
  picker?: Picker | undefined
}) {
  const { call, out, into, figures } = shown
  const [pickerSide, setPickerSide] = useState<'out' | 'in' | null>(null)
  const [explained, setExplained] = useState(false)
  const [whyWatch, setWhyWatch] = useState(false)
  const [drag, setDrag] = useState({ dx: 0, dy: 0 })
  const start = useRef<{ x: number; y: number } | null>(null)

  const isForced = figures.reading === 'call' && figures.isForced
  // At most one flag, and FORCED outranks WATCH (F3-AC-17). WATCH reads WATCH with
  // no qualifier; its reason is one tap away (F3-AC-18).
  const watchReason = isForced ? null : figures.watchReason

  // Swipes start anywhere on the card except the table, which scrolls.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
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

  return (
    <div className={styles.h2h}>
      <div className={styles.stepper}>
        <span className={styles.stepLabel}>
          {SHAPE_LABEL[call.shape]} · CALL {index + 1} OF {left}
        </span>
        <button className={styles.pager} onClick={onPrev} aria-label="Previous undecided call" type="button">
          ‹
        </button>
        <button className={styles.pager} onClick={onNext} aria-label="Next undecided call" type="button">
          ›
        </button>
        <span className={styles.left}>{left} LEFT</span>
      </div>

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

        <div className={styles.reasoning}>
          <img className={styles.gaffer} src={avatar} alt="" />
          <p data-testid="reasoning" className={styles.reasoningText}>
            {figures.reasoning}
          </p>
        </div>
      </div>

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
    </div>
  )
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
        Net {formatNet(b.net)} · points hit {String(b.pointsHit)} · k {b.k.toFixed(1)}
      </span>
      <span>Projections from Fantasy Football IQ; availability from FPL.</span>
    </div>
  )
}
