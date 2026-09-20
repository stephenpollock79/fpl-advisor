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
import { ArmbandTable } from './ArmbandTable'
import styles from './Assistant.module.css'
import type { Shown } from './AssistantScreen'

/** How far a drag has to travel before it is a decision rather than a wobble. */
const SWIPE = 70

type Picker = { outs: WorldPlayer[]; ins: WorldPlayer[]; onSwap: (side: 'out' | 'in', playerId: number) => void }

export function HeadToHead({
  shown,
  gameweekId,
  players,
  onDecide,
  picker,
  decided,
}: {
  shown: Shown
  gameweekId: number
  /** The squad, for the armband table's rows (STE-151). */
  players: ReadonlyMap<number, WorldPlayer>
  onDecide: (state: 'selected' | 'rejected' | 'pending') => void
  picker?: Picker | undefined
  /**
   * **This call has already been decided, and was opened from the Overview to
   * be read** (F3-AC-13: browsing back to a decided call "happens from the
   * overview"). Undefined on every card reached by the arrows, which walk
   * undecided calls only.
   */
  decided?: 'selected' | 'rejected'
}) {
  const { call, out, into, figures } = shown
  /**
   * **The armband is a ranking, so it renders as one** (STE-151). No versus
   * band, no evaluation rows, no arrow — a sorted list with the top two marked.
   * Everything else about the card is unchanged: same strip, same reasoning,
   * same three tiles, same swipe.
   */
  const armband = call.breakdown.armband ?? null

  /**
   * **One block, two positions.** On a swap card the reasoning closes the
   * argument the table above it made, so it comes last. On the armband it is
   * joined to the header instead, reading as the verdict and its explanation
   * before the ranking that supports them.
   */
  /**
   * **The conviction chip lives in the editorial box on the armband, not in the
   * green bar** (2026-09-20). On the bar it had to be legible against a green
   * gradient, which is the one thing the band palette cannot do — `strong` is
   * pale green on dark green text. Sitting above the reasoning it is back on a
   * pale ground, so it can be a solid chip in its own colour, and it reads as
   * what it is: how strongly the recommendation is held, stated just before the
   * sentence that argues for it.
   */
  const bandChip =
    figures.reading === 'call' ? (
      <span data-testid="strength" className={`${styles.strength} ${styles.armbandChip} ${styles[figures.band] ?? ''}`}>
        {figures.conviction} · {figures.band}
      </span>
    ) : (
      <span data-testid="strength" className={`${styles.strength} ${styles.armbandChip} ${styles.armbandNoChange}`}>
        no change
      </span>
    )

  const reasoningBlock = (
    <div className={`${styles.reasoning} ${armband ? styles.reasoningJoined : ''}`}>
      <img className={styles.gaffer} src={avatar} alt="" />
      <div className={`${styles.reasoningBody} ${armband ? styles.reasoningBodyRuled : ''}`}>
        {armband ? <span className={styles.armbandChipRow}>{bandChip}</span> : null}
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
  )
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
  /**
   * **Reading a decision must not cost it.** A decided card opens read-only —
   * both routes into a decision are closed, the tiles *and* the swipe, and
   * *Change* is the one control that reopens it. The alternative considered and
   * rejected on 2026-09-15 was a confirmation asking to move the call back to
   * undecided before showing it, which makes looking destructive and puts a
   * dialog on a common tap.
   */
  const decidable = figures.reading === 'call' && decided === undefined
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
        className={`${styles.card} ${armband ? styles.cardSplit : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform: `translate(${drag.dx}px, ${Math.min(0, drag.dy)}px) rotate(${drag.dx / 30}deg)` }}
      >
        {armband ? (
          /**
           * **Header and editorial are one element, the table is another.**
           * The gap between them shows the page, not a white bar inside a
           * single card — two things joined by a seam read as one thing
           * interrupted.
           *
           * **The header carries the impact, not the names.** It stated the two
           * picks, and the table three inches below says the same thing with its
           * own top two rows — so the header was spending the card's most
           * prominent line repeating what the reader was about to see anyway.
           */
          <div className={styles.panel}>
            <div className={styles.armbandHead} data-testid="armband-head">
              <span className={styles.armbandTitle}>Armband</span>
              {/**
                * **One row, one size.** The bar states the figure and nothing
                * else: the label and the number are the same size, so it reads
                * as a line rather than as four competing things.
                */}
              <span className={styles.armbandFigures}>
                {/* `xPTS`, which F4-AC-15 names: the app's own word for a
                    projected-points difference on every other surface — the
                    Overview's rows, the card strip, the squad table. Never
                    *strength*, because beside a ranked table that reads as
                    confidence in the pick, and the conviction chip below is
                    what measures that. */}
                <span className={styles.armbandFigLabel}>xPTS</span>
                <span className={styles.armbandNet} data-testid="net">
                  {formatNet(figures.net)}
                </span>
              </span>
            </div>
            {reasoningBlock}
          </div>
        ) : (
          <div className={styles.versus}>
            <Side player={out} direction="out" onChange={picker ? () => setPickerSide('out') : undefined} />
            <span className={styles.vs}>VS</span>
            <Side player={into} direction="in" onChange={picker ? () => setPickerSide('in') : undefined} />
          </div>
        )}

        {/* The armband's figures live in its header, so the strip would be a
            second copy of them (2026-09-20). */}
        {armband ? null : (
        <div className={styles.strip}>
          <span className={styles.stripCell}>
            <span className={styles.cardFigLabel}>NET</span>
            <span data-testid="net" className={styles.stripValue}>
              {formatNet(figures.net)}
            </span>
          </span>
          {/* **No cost row on the armband** (STE-151). The £0.00 only ever
              existed because the swap framing forced a money column onto
              something that never had one. */}
          {armband ? null : (
            <span className={styles.stripCell}>
              <span className={styles.cardFigLabel}>COST</span>
              <span data-testid="cost" className={styles.stripValue}>
                {formatCost(figures.costTenths)}
              </span>
            </span>
          )}
          <span className={`${styles.stripCell} ${armband ? styles.stripEnd : ''}`}>
            {/* **Named for what it is on this card.** Beside a swap, STRENGTH
                reads as *how sure are we about this change*. Beside a ranked
                table the same figure would read as *how sure are we this is the
                right captain* — question it does not answer. The table answers
                that, by being a sorted list. */}
            <span className={styles.cardFigLabel}>{armband ? 'WORTH CHANGING' : 'STRENGTH'}</span>
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
          {/* **A disc, not a word.** The pill wrapped onto its own line on a
              390-wide card and pushed the whole strip taller; the letter fits
              beside the figures. The accessible name stays the full word — "F"
              alone is meaningless read aloud. */}
          {isForced ? (
            <span className={styles.flagForced} title="Forced" aria-label="Forced">
              F
            </span>
          ) : null}
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
        )}

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
                  <span className={styles.pickerName}>{p.name}</span>
                  <span className={styles.pickerMeta}>
                    {p.clubShortName} · {formatMoney(p.nowCostTenths)} · xPts {p.projectedPoints.toFixed(1)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : armband ? (
          <div className={`${styles.armbandWrap} ${styles.panel}`} data-scrolls>
            <ArmbandTable rows={armband.rows} players={players} />
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
        {armband ? null : reasoningBlock}
      </div>

      {decided !== undefined ? (
        /* It says which it is, so the card answers the question that brought
           the manager here — *why did this not change?* (F6-AC-02). */
        <div className={styles.decidedPanel} data-testid="decided-panel">
          <span className={styles.decidedState}>
            {decided === 'selected' ? 'SELECTED · LOCKED' : 'REJECTED'}
          </span>
          <button className={styles.decidedChange} onClick={() => onDecide('pending')} data-testid="reopen" type="button">
            Change
          </button>
        </div>
      ) : figures.reading !== 'call' ? (
        <div data-testid="reading-panel" className={styles.readingPanel}>
          <span className={styles.readingTitle}>No change · nothing to do</span>
          <span className={styles.readingWhy}>{readingLine(figures.because)}</span>
        </div>
      ) : (
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
        <span className={styles.keepName}>{out.name}</span>
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
 * Four reasons, and they are genuinely different things to say. Two come from
 * the engine — the holder is ahead, or the two are too close to separate. The
 * third is the manager's own doing and the engine cannot know it: he turned down
 * the captain change, so the pair would otherwise contradict itself (F4-UP-02).
 * The fourth is not a reason for keeping at all: the call cannot be carried out,
 * and saying so is the opposite of the first two rather than a weaker form of
 * them (STE-142).
 */
function keepVerdict(figures: Shown['figures'], role: 'captaincy' | 'vice-captaincy'): string {
  const band = role === 'vice-captaincy' ? 'vice armband' : 'armband'
  if (figures.reading !== 'no_change') return `He keeps the ${band}.`

  if (figures.because === 'unexecutable') {
    return `This one can no longer be carried out with your squad as it now stands, so the ${band} is unchanged.`
  }
  if (figures.because === 'captain_kept') {
    return `You kept your captain, so the ${band} stays where it is too — moving it now would leave the pair contradicting each other.`
  }
  if (figures.because === 'below_floor') {
    return `Nobody in your eleven is far enough clear of him to justify moving the ${band}.`
  }
  return `Nobody in your eleven projects higher. He keeps the ${band}.`
}

/**
 * The short badges beside the direction label.
 *
 * Everything here is *conditional* — the things that appear on some players and
 * not others, which is exactly why they cannot live on the meta line. Kept short
 * because this row shares its width with the direction label.
 */
function extras(player: WorldPlayer): string[] {
  const badges: string[] = []
  if (player.benchOrder !== null && player.benchOrder > 0) badges.push(`BENCH ${String(player.benchOrder)}`)
  return badges
}

function Side({ player, direction, onChange }: { player: WorldPlayer; direction: 'out' | 'in'; onChange?: (() => void) | undefined }) {
  return (
    <div className={direction === 'out' ? styles.side : styles.sideRight}>
      {/**
        * **The extras ride on the direction row, not the meta line** (STE-125).
        *
        * `MCI · DEF · £5.6m` is about as much as a side gets at 390px. Adding
        * `· bench 3` wrapped it onto a second line, so the header grew taller on
        * some cards and not others: the card jumped as you stepped between
        * calls, and the two sides stopped lining up — the incoming player sat
        * higher than the outgoing one.
        *
        * The direction row is on every card, is four characters long, and has
        * the rest of the width doing nothing. Putting the variable items there
        * costs no height at all, which the alternatives did: a second row would
        * have added a line to every card whether or not it had anything to say,
        * and shortening `bench 3` to `B3` only buys room until the next extra
        * arrives — injury and doubt markers and a second fixture in a double
        * gameweek all belong here too.
        */}
      <span className={styles.dirRow}>
        <span className={styles.dir}>{direction === 'out' ? '▼ OUT' : 'IN ▲'}</span>
        {extras(player).map((extra) => (
          <span key={extra} className={styles.extra} data-testid={`${direction}-extra`}>
            {extra}
          </span>
        ))}
      </span>
      <span data-testid={`${direction}-name`} className={styles.name}>
        {player.name}
      </span>
      <span className={styles.meta}>
        {player.clubShortName} · {player.position} · {formatMoney(player.nowCostTenths)}
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
      {side('Out', shown.out.name, b.out)}
      {side('In', shown.into.name, b.in)}
      <span>Weights: {b.weights.map((w) => w.toFixed(2)).join(' / ')}</span>
      <span>
        Net {formatNet(b.net)} · points hit {String(b.pointsHit)} · k {b.k.toFixed(1)} ({b.kLabel})
      </span>
      {b.byCeiling ? <span>Within the noise floor on projected points, so the ceiling tie-break chose this side.</span> : null}
      <span>Projections from Fantasy Football IQ; availability from FPL.</span>
    </div>
  )
}
