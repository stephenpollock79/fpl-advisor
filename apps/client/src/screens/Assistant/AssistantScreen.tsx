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

import { useEffect, useMemo, useState } from 'react'
import { type World, type WorldCall, type WorldPlayer, decide as saveDecision, startRun } from '../../api'
import avatar from '../../assets/gaffer-avatar.png'
import { type Decisions, decide, initialDecisions, reopen, restore } from '../../calls/decisions'
import {
  type CardFigures,
  availabilityFor,
  formatMoney,
  nbal,
  playerIndex,
  recomputeTransfer,
  shortlistCount,
  storedFigures,
  transferKey,
} from '../../calls/view'
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
  const [swaps, setSwaps] = useState<Record<string, { outId: number; inId: number }>>({})
  const [cursor, setCursor] = useState(0)
  const [holdCleared, setHoldCleared] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDecisions(initialDecisions(world.decisions)), [world.decisions])

  const shown = useMemo(
    () =>
      world.calls.flatMap((call): Shown[] => {
        const storedOut = players.get(call.outPlayerId)
        const storedIn = players.get(call.inPlayerId)
        if (!storedOut || !storedIn) return []
        const stored: Shown = { call, key: call.key, out: storedOut, into: storedIn, figures: storedFigures(call, storedOut, storedIn), swapped: false }

        const swap = swaps[call.key]
        if (!swap) return [stored]
        const out = players.get(swap.outId)
        const into = players.get(swap.inId)
        const figures = out && into ? recomputeTransfer(call, out, into) : null
        if (!out || !into || !figures) return [stored]
        return [{ call, key: transferKey(out.playerId, into.playerId), out, into, figures, swapped: true }]
      }),
    [world.calls, swaps, players],
  )

  const inCategory = (category: Category) => shown.filter((s) => s.call.category === category)
  const pendingIn = (category: Category) => inCategory(category).filter((s) => decisions.decisions[s.key] === undefined)

  const here = inCategory(tab)
  const pending = pendingIn(tab)
  const reopenedHere = here.filter((s) => decisions.reopened[s.key] !== undefined).length

  // Category cleared takes over when nothing is left pending, and stays while
  // rows are reopened and restored on it — until the manager asks to review them.
  useEffect(() => {
    if (here.length > 0 && pending.length === 0) setHoldCleared(true)
  }, [here.length, pending.length])
  const showCleared = here.length > 0 && (pending.length === 0 || holdCleared)

  const current = pending.length > 0 ? pending[cursor % pending.length] : undefined

  async function record(key: string, state: 'selected' | 'rejected' | 'pending', apply: (d: Decisions) => Decisions) {
    const before = decisions
    setDecisions(apply(decisions))
    setError(null)
    try {
      await saveDecision(key, state)
    } catch {
      setDecisions(before)
      setError('That decision did not save. Try it again.')
    }
  }

  function onDecide(state: 'selected' | 'rejected' | 'pending') {
    if (!current) return
    if (state === 'pending') {
      // Later: it stays pending and the next undecided call comes up (F3-AC-07).
      setCursor((c) => c + 1)
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
          const total = inCategory(t.category).length
          const left = pendingIn(t.category).length
          const meta = noRunYet ? '—' : total === 0 ? 'Clear' : left === 0 ? 'Done' : String(left)
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
            {shortlistCount(decisions.decisions)}
          </span>
        </span>
      </section>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <section className={styles.content}>
        {noRunYet ? (
          <div className={styles.empty}>
            <p>No calls yet this gameweek.</p>
            <button className={styles.primary} onClick={() => void onRun()} disabled={running} type="button">
              {running ? 'Reading the feeds and working out the week…' : "Get this week's calls"}
            </button>
          </div>
        ) : here.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.clearTitle}>{TABS.find((t) => t.category === tab)?.noun} · clear</p>
            <p>{TABS.find((t) => t.category === tab)?.clear}</p>
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
      </section>
    </main>
  )
}
