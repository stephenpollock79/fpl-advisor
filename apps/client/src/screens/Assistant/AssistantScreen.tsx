/**
 * The Assistant's Transfer and Sub tabs (F3).
 *
 * Head to head shows only undecided calls (F3-AC-13); deciding one advances to
 * the next (F3-AC-12); when none are left the tab reads *Done* and Category
 * cleared takes over, where every decided row is a two-way control (F3-AC-14).
 *
 * **This screen computes no figure.** Net, conviction, band and cost arrive from
 * `calls/` — stored by the run, or recomputed through the engine when a candidate
 * is swapped. ENGINE-AC-04's second half is this file and its children holding
 * no arithmetic over them, and a test reads the source to keep it so.
 *
 * The Overview is F8 and arrives with slice 8, so this opens on Transfer.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { type RunStep, type World, type WorldCall, type WorldPlayer, decide as saveDecision, startRun, streamRun } from '../../api'
import avatar from '../../assets/gaffer-avatar.png'
import { type Decisions, decide, initialDecisions, reopen, restore } from '../../calls/decisions'
import {
  type CardFigures,
  availabilityFor,
  formatMoney,
  nbal,
  playerIndex,
  recomputeTransfer,
  restoredSwaps,
  shortlistCount,
  dataAge,
  diffRows,
  storedFigures,
  viceHeldByCaptain,
  watchFreshness,
  transferKey,
} from '../../calls/view'
import { DiffSheet, RefreshInterstitial, Thinking } from './Refresh'
import styles from './Assistant.module.css'
import { CategoryCleared, type ClearedRow } from './CategoryCleared'
import { HeadToHead } from './HeadToHead'

type Category = WorldCall['category']

const TABS: { category: Category; label: string; noun: string; clear: string }[] = [
  {
    category: 'transfer',
    label: 'Transfer',
    noun: 'Transfers',
    clear: 'No transfer is worth making this week. Hold the free transfer.',
  },
  {
    category: 'substitution',
    label: 'Sub',
    noun: 'Substitutions',
    clear: 'Your eleven is already the strongest legal side, and the bench is in order.',
  },
  // Last, deliberately. *Later* on the final undecided call hops to the next tab
  // holding work, in this order — putting captaincy ahead of substitutions would
  // change where the manager lands (F3-AC-07).
  {
    category: 'captaincy',
    label: 'Captain',
    noun: 'Captaincy',
    clear: 'Both armbands are already on the right players.',
  },
]

/** A call as the card shows it — the stored one, or a transfer with a candidate swapped in. */
export type Shown = {
  call: WorldCall
  key: string
  out: WorldPlayer
  into: WorldPlayer
  figures: CardFigures
  swapped: boolean
}

const SHAPE_TITLE: Record<WorldCall['shape'], string> = {
  transfer: 'Transfer',
  forced_swap: 'Forced swap',
  doubt_swap: 'Doubt swap',
  upgrade_swap: 'Swap',
  bench_order: 'Bench order',
  captain: 'Captain',
  vice: 'Vice',
}

export function AssistantScreen({
  world,
  onSquad,
  onReload,
}: {
  world: World
  onSquad: () => void
  onReload: () => void
}) {
  const players = useMemo(() => playerIndex(world), [world])
  const [tab, setTab] = useState<Category>('transfer')
  const [decisions, setDecisions] = useState<Decisions>(() => initialDecisions(world.decisions))
  const [swaps, setSwaps] = useState<Record<string, { outId: number; inId: number }>>(() =>
    restoredSwaps(world.calls, world.decisions),
  )
  const [cursor, setCursor] = useState(0)
  const [holdCleared, setHoldCleared] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    setDecisions(initialDecisions(world.decisions))
    setSwaps(restoredSwaps(world.calls, world.decisions))
  }, [world.calls, world.decisions])

  // The refresh, in its three states: asking, running, reporting. Nothing ever
  // starts on its own (F6-AC-15), and none of these can appear mid-decision
  // because each replaces the card rather than sitting over it.
  const [asking, setAsking] = useState(false)
  const [step, setStep] = useState<RunStep | null>(null)
  const [scale, setScale] = useState<{ players: number; squad: number } | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const fresh = watchFreshness(world)
  // F4-UP-02: turn the captain change down and the vice call's premise is gone
  // with it, so the vice is held rather than left to contradict the armband.
  const captainRejected = world.calls.some(
    (c) => c.shape === 'captain' && decisions.decisions[c.key] === 'rejected',
  )
  const shown = useMemo(
    () =>
      world.calls.flatMap((call): Shown[] => {
        const storedOut = players.get(call.outPlayerId)
        const storedIn = players.get(call.inPlayerId)
        if (!storedOut || !storedIn) return []
        const figuresNow = viceHeldByCaptain(
          storedFigures(call, storedOut, storedIn, fresh.stored),
          call.shape === 'vice' && captainRejected,
        )
        const stored: Shown = { call, key: call.key, out: storedOut, into: storedIn, figures: figuresNow, swapped: false }

        const swap = swaps[call.key]
        if (!swap) return [stored]
        const out = players.get(swap.outId)
        const into = players.get(swap.inId)
        const figures = out && into ? recomputeTransfer(call, out, into, fresh.swapped) : null
        if (!out || !into || !figures) return [stored]
        return [{ call, key: transferKey(out.playerId, into.playerId), out, into, figures, swapped: true }]
      }),
    [world.calls, swaps, players, fresh.stored, fresh.swapped, captainRejected],
  )

  const inCategory = (category: Category) => shown.filter((s) => s.call.category === category)
  const pendingIn = (category: Category) => inCategory(category).filter((s) => decisions.decisions[s.key] === undefined)
  /**
   * Work the manager still has to do. A keep reading is shown and stepped
   * through, but it is not outstanding and never becomes *Done* — it enters no
   * tally at all (F4-AC-03).
   */
  const outstandingIn = (category: Category) => pendingIn(category).filter((s) => s.figures.reading === 'call')

  const here = inCategory(tab)
  const pending = pendingIn(tab)
  const outstanding = outstandingIn(tab)
  const reopenedHere = here.filter((s) => decisions.reopened[s.key] !== undefined).length

  // Category cleared takes over when nothing is left pending, and stays while
  // rows are reopened and restored on it — until the manager asks to review them.
  useEffect(() => {
    if (here.length > 0 && pending.length === 0) setHoldCleared(true)
  }, [here.length, pending.length])
  // Unchanged, and it already does the right thing for a keep reading: a reading
  // is never decided, so a tab holding one never empties `pending`, never sets
  // `holdCleared`, and never has the cleared summary take the card's place. The
  // Captain tab always has something to show, which is F4-AC-01.
  const showCleared = here.length > 0 && (pending.length === 0 || holdCleared)

  const current = pending.length > 0 ? pending[cursor % pending.length] : undefined

  async function record(key: string, state: 'selected' | 'rejected' | 'pending', apply: (d: Decisions) => Decisions) {
    const before = decisions
    setDecisions(apply(decisions))
    setError(null)
    setNotice(null)
    try {
      await saveDecision(key, state)
    } catch {
      setDecisions(before)
      setError('That decision did not save. Try it again.')
    }
  }

  function onDecide(state: 'selected' | 'rejected' | 'pending') {
    if (!current) return
    // A keep reading is not decidable (F4-AC-02). The card renders a label in
    // place of the tiles and does not bind the swipe handlers, so nothing should
    // reach here — this is the second lock, not the first, because a decision
    // filed against a reading would enter tallies it must never be in.
    if (current.figures.reading !== 'call') return
    if (state === 'pending') {
      // Later: it stays pending and the next undecided call comes up (F3-AC-07).
      if (pending.length > 1) {
        setCursor((c) => c + 1)
        return
      }
      // The last undecided card in this tab has nowhere to advance to, and doing
      // nothing reads as a broken control. Until the Overview exists (slice 8,
      // STE-122), go to the other tab if it has calls waiting, or say so.
      const here = TABS.find((t) => t.category === tab)
      const next = TABS.find((t) => t.category !== tab && outstandingIn(t.category).length > 0)
      if (next) {
        setTab(next.category)
        setCursor(0)
        setHoldCleared(false)
        setNotice(`${here?.noun ?? 'That call'} left for later — ${next.noun.toLowerCase()} next.`)
        return
      }
      setNotice('Left for later — it will be here when you come back.')
      return
    }
    // The decided card leaves the pending list, so the same position now holds
    // the next undecided call (F3-AC-12).
    void record(current.key, state, (d) => decide(d, current.key, state))
  }

  function onToggle(key: string) {
    const had = decisions.decisions[key]
    if (had !== undefined) {
      void record(key, 'pending', (d) => reopen(d, key))
      return
    }
    const was = decisions.reopened[key]
    if (was !== undefined) void record(key, was, (d) => restore(d, key))
  }

  function onSwap(side: 'out' | 'in', playerId: number) {
    if (!current) return
    const base = current.call
    setSwaps((all) => {
      const previous = all[base.key] ?? { outId: base.outPlayerId, inId: base.inPlayerId }
      const next = side === 'out' ? { ...previous, outId: playerId } : { ...previous, inId: playerId }
      const rest = { ...all }
      delete rest[base.key]
      return next.outId === base.outPlayerId && next.inId === base.inPlayerId ? rest : { ...rest, [base.key]: next }
    })
  }

  async function onRun() {
    setRunning(true)
    setError(null)
    try {
      await startRun()
      onReload()
    } catch {
      setError('The run did not finish, and nothing has changed. Try again.')
    } finally {
      setRunning(false)
    }
  }

  /**
   * A refresh, watched while it happens (F6-AC-16 to F6-AC-20).
   *
   * **Cancelling is aborting the request.** The server sees the connection close,
   * marks the run cancelled rather than failed, and writes nothing — so this
   * needs no undo and the last-run time cannot move.
   */
  async function onRefresh() {
    setAsking(false)
    setError(null)
    setNotice(null)
    setStep(null)
    setScale(null)

    const controller = new AbortController()
    abort.current = controller
    setRunning(true)

    try {
      for await (const event of streamRun(controller.signal)) {
        if (event.kind === 'step') {
          setStep(event.step)
          if (event.step.scale) setScale(event.step.scale)
        } else if (event.kind === 'done') {
          // Nothing moved that could change a decision, so nothing was spent and
          // the week stands. Said plainly rather than shown as an empty report.
          if (event.reused) setNotice('Nothing has changed since your last run. Your calls stand.')
          else setShowDiff(true)
          onReload()
        } else {
          setError('The run did not finish, and nothing has changed. Try again.')
        }
      }
    } catch (cause) {
      // An abort is the manager's own doing and is not an error to report at him.
      if (!controller.signal.aborted) setError('The run did not finish, and nothing has changed. Try again.')
    } finally {
      abort.current = null
      setRunning(false)
      setStep(null)
    }
  }

  function onCancelRun() {
    abort.current?.abort()
    setNotice('Refresh cancelled. Nothing changed.')
  }

  const balanceLeft = nbal(
    world.snapshot.bankTenths,
    shown.map((s) => ({ key: s.key, costTenths: s.figures.costTenths })),
    decisions.decisions,
  )

  const picker =
    current && current.call.category === 'transfer' && current.call.alternatives
      ? {
          outs: [current.call.outPlayerId, ...current.call.alternatives.out]
            .map((id) => players.get(id))
            .filter((p): p is WorldPlayer => p !== undefined && p.sellingPriceTenths !== null),
          ins: [current.call.inPlayerId, ...current.call.alternatives.in]
            .map((id) => players.get(id))
            .filter((p): p is WorldPlayer => p !== undefined && availabilityFor(p).eligible),
          onSwap,
        }
      : undefined

  const clearedRows: ClearedRow[] = here.flatMap((s): ClearedRow[] => {
    const title = `${SHAPE_TITLE[s.call.shape]}: ${s.out.surname} → ${s.into.surname}`
    const decided = decisions.decisions[s.key]
    if (decided !== undefined) return [{ key: s.key, title, state: decided }]
    if (decisions.reopened[s.key] !== undefined) return [{ key: s.key, title, state: 'reopened' as const }]
    return []
  })

  const noRunYet = world.calls.length === 0 && world.lastRunAt === null

  return (
    <main className={styles.screen}>
      <header className={styles.brandRow}>
        <img className={styles.avatar} src={avatar} alt="" />
        <span className={styles.wordmark}>The Gaffer</span>
        {/* **Symbol only, and left of the toggle.** The label used to be the
            tab's name, so it changed width between tabs and took the header's
            height with it. The scope it would rewrite is named in the
            confirmation, which is the screen that actually needs to say so
            (F6-AC-07, F6-AC-10) — and an accessible name carries it here. */}
        <button
          className={running ? `${styles.refresh} ${styles.refreshOff}` : styles.refresh}
          onClick={() => setAsking(true)}
          disabled={running || noRunYet || world.feedsReachable === false}
          aria-label={`Refresh ${(TABS.find((x) => x.category === tab)?.noun ?? 'everything').toLowerCase()}`}
          data-testid="refresh"
          type="button"
        >
          ↻
        </button>
        <div className={styles.sections} role="tablist">
          <button className={styles.sectionOff} role="tab" aria-selected="false" onClick={onSquad} type="button">
            Squad
          </button>
          <span className={styles.sectionOn} role="tab" aria-selected="true">
            Assistant
          </span>
        </div>
      </header>

      <nav className={styles.tabs} role="tablist">
        {TABS.map((t) => {
          // *Clear* covers a tab with nothing in it and a tab holding only keep
          // readings — in both, the honest answer is that there is nothing to do.
          // *Done* is reserved for work that existed and has been decided
          // (F4-AC-03).
          const decidable = inCategory(t.category).filter((s) => s.figures.reading === 'call').length
          const left = outstandingIn(t.category).length
          const meta = noRunYet ? '—' : decidable === 0 ? 'Clear' : left === 0 ? 'Done' : String(left)
          return (
            <button
              key={t.category}
              role="tab"
              aria-selected={tab === t.category}
              className={tab === t.category ? styles.tabOn : styles.tab}
              onClick={() => {
                setTab(t.category)
                setCursor(0)
                setHoldCleared(false)
                setNotice(null)
              }}
              type="button"
            >
              <span>{t.label}</span>
              <span className={styles.tabMeta}>{meta}</span>
            </button>
          )
        })}
      </nav>

      <section className={styles.status} aria-label="Status">
        <span>
          <span className={styles.eyebrow}>BALANCE</span>
          <span className={styles.figure}>{formatMoney(world.snapshot.bankTenths)}</span>
        </span>
        <span>
          <span className={styles.eyebrow}>NBAL</span>
          {/* Shown negative and red, never blocked (F3-AC-27, F3-UP-01). */}
          <span data-testid="nbal" className={`${styles.figure} ${balanceLeft < 0 ? styles.negative : ''}`}>
            {formatMoney(balanceLeft)}
          </span>
        </span>
        <span>
          <span className={styles.eyebrow}>FREE TR</span>
          <span className={styles.figure}>{world.snapshot.freeTransfers}</span>
        </span>
        <span>
          <span className={styles.eyebrow}>SHORTLIST</span>
          <span data-testid="shortlist" className={styles.figure}>
            {shortlistCount(
              shown.map((s) => s.key),
              decisions.decisions,
            )}
          </span>
        </span>
      </section>


      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      {/* F6-UP-02: the source is gone, so the refresh control reads off rather
          than failing on tap, and the screen timestamps itself. Navigation is
          never dimmed — everything already on file is still true and still
          worth looking at. */}
      {world.feedsReachable === false ? (
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
      ) : null}

      <section className={styles.content}>
        {running ? (
          <Thinking current={step} scale={scale} gameweekId={world.gameweek.id} onCancel={onCancelRun} />
        ) : noRunYet ? (
          <div className={styles.empty}>
            <p>No calls yet this gameweek.</p>
            <button className={styles.primary} onClick={() => void onRun()} disabled={running} type="button">
              {running ? 'Reading the feeds and working out the week…' : "Get this week's calls"}
            </button>
          </div>
        ) : here.length === 0 ? (
          /* **"Nothing worth changing" is a designed answer, not an absence**
             (CLAUDE.md, *Do not*), so it is the Gaffer saying it rather than a
             blank panel — the same green header, cream body and avatar the
             editorial uses, because it is the same kind of statement. */
          <div className={styles.verdict} data-testid="verdict">
            <div className={styles.verdictHead}>
              <span>{TABS.find((t) => t.category === tab)?.label}</span>
              <span>NO CHANGE</span>
            </div>
            <div className={styles.verdictBody}>
              <img className={styles.gaffer} src={avatar} alt="" />
              <p className={styles.verdictText}>{TABS.find((t) => t.category === tab)?.clear}</p>
            </div>
          </div>
        ) : showCleared ? (
          <CategoryCleared
            noun={TABS.find((t) => t.category === tab)?.noun ?? ''}
            rows={clearedRows}
            reopened={reopenedHere}
            onToggle={onToggle}
            onReview={() => {
              setHoldCleared(false)
              setCursor(0)
            }}
          />
        ) : current ? (
          <HeadToHead
            key={current.key}
            shown={current}
            gameweekId={world.gameweek.id}
            index={cursor % pending.length}
            left={pending.length}
            onPrev={() => setCursor((c) => (c + pending.length - 1) % pending.length)}
            onNext={() => setCursor((c) => (c + 1) % pending.length)}
            onDecide={onDecide}
            picker={picker}
          />
        ) : null}

        {/* Asked before it runs, and the question explains the outcome rather
            than being a bare "are you sure?" (F6-AC-10). */}
        {asking ? (
          <RefreshInterstitial
            scope={(TABS.find((x) => x.category === tab)?.noun ?? 'everything').toLowerCase()}
            lastRunAt={world.lastRunAt}
            selected={here.filter((s) => decisions.decisions[s.key] === 'selected').length}
            rejected={here.filter((s) => decisions.decisions[s.key] === 'rejected').length}
            pending={outstanding.length}
            onGo={() => void onRefresh()}
            onCancel={() => setAsking(false)}
          />
        ) : null}

        {/* And a report afterwards, never a silent replace (F6-AC-11) — but no
            sheet at all when nothing moved (F6-AC-12), which `DiffSheet` decides
            for itself from an empty list. */}
        {showDiff ? (
          <DiffSheet
            rows={diffRows(world.calls, (id) => players.get(id)?.surname ?? 'A player')}
            untouched={world.calls.length - diffRows(world.calls, () => '').length}
            onClose={() => setShowDiff(false)}
          />
        ) : null}
      </section>
    </main>
  )
}
