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
 * **The Overview is the fourth view here and the one this opens on**, since
 * slice 8. It is also where *Later* on the last undecided call now lands
 * (STE-122), because a deferred call is visible there beside everything else.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type ArmbandRow,
  type RunStep,
  type World,
  type WorldCall,
  type WorldPlayer,
  decide as saveDecision,
  streamRun,
} from '../../api'
import avatar from '../../assets/gaffer-avatar.png'
import { type Decisions, decide, initialDecisions, reopen, restore } from '../../calls/decisions'
import {
  type CardFigures,
  availabilityFor,
  formatMoney,
  nbal,
  playerIndex,
  clearVerdict,
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
import { AccountSheet, type Account } from '../Account/AccountSheet'
import { NewsToken } from './NewsToken'
import { Overview } from './Overview'
import { weekOf } from '../../calls/week'

type Category = WorldCall['category']

/**
 * **The Overview is a fourth view here, not a separate screen** (F8's happy
 * path). It is first and it is the default, because it is the entry screen for
 * the week — the decision tabs are what it leads into.
 *
 * Rendered from a list rather than hard-coded, so F5's Chips tab appends itself
 * if it is ever built and the cut leaves no hole (ruled on STE-59).
 */
type Tab = 'overview' | Category

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
  // Last, matching the Overview's own order. **The reason this comment used to
  // give is gone**: *Later* on the final undecided call went to the next tab
  // holding work, so this order decided where the manager landed. It goes to the
  // Overview now (STE-122), and nothing depends on which category is last.
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
  /** One call carrying the whole ranking (STE-151). */
  armband: 'Armband',
  /** Rows written before 2026-09-20. Nothing produces them now. */
  captain: 'Captain',
  vice: 'Vice',
}

/**
 * **An armband is a result, not a move** (STE-151).
 *
 * Everything else on this screen reads `X → Y`, because everything else is a
 * swap. Rendering the armband that way is the two-swaps framing again, just
 * smaller — and it is what the Captain tab stopped doing. So it states who
 * wears what, and the arrow never appears.
 */
export function armbandTitle(call: WorldCall, players: ReadonlyMap<number, WorldPlayer>): string | null {
  const rows = call.breakdown.armband
  if (!rows) return null
  const named = (pick: (r: ArmbandRow) => boolean): string => {
    const found = rows.rows.find(pick)
    return found ? (players.get(found.playerId)?.name ?? '') : ''
  }
  return `Armband: ${named((r) => r.isCaptainPick)} (C) · ${named((r) => r.isVicePick)} (V)`
}

/**
 * What a failure says when the server did not say anything — the connection
 * dropped, or the run predates STE-187. *Try again* is honest only where there
 * is no reason to think otherwise, which is exactly this case.
 */
const RUN_FAILED = 'The run did not finish, and nothing has changed. Try again.'

/** A wall clock, for the last-run line (F8-AC-18). */
const clockOf = (iso: string): string => {
  const at = new Date(iso)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

export function AssistantScreen({
  world,
  onSquad,
  onReload,
  account,
  startRun = false,
  decisionsCleared = 0,
  onRunStarted,
}: {
  world: World
  onSquad: () => void
  onReload: () => void
  account: Account
  /**
   * **How many decisions the upload cleared.** An uploaded squad is the current
   * state, so every choice made about the old one goes with it — told to the
   * manager rather than left to be noticed (STE-139).
   */
  decisionsCleared?: number
  /** Spends the request, so returning here does not start another run. */
  onRunStarted?: () => void
  /**
   * Something one screen back already asked for a run: a finished team link
   * (F7-AC-15) or a squad correction (F2-AC-05). **Not an exception to
   * F6-AC-15** — nothing refreshes on its own; both are the manager's own
   * action, and nothing else sets this.
   */
  startRun?: boolean
}) {
  // **This screen's own sheet** (F7-AC-23): cancelling returns here untouched
  // because nothing ever left.
  const [accountOpen, setAccountOpen] = useState(false)
  const players = useMemo(() => playerIndex(world), [world])
  const [tab, setTab] = useState<Tab>('overview')
  const [decisions, setDecisions] = useState<Decisions>(() => initialDecisions(world.decisions))
  const [swaps, setSwaps] = useState<Record<string, { outId: number; inId: number }>>(() =>
    restoredSwaps(world.calls, world.decisions),
  )
  const [cursor, setCursor] = useState(0)
  /**
   * A call opened from the Overview by its key, rather than by position among
   * the undecided ones.
   *
   * **This is how a decided call is read** (F3-AC-13 names the overview as the
   * route). Looking up a decided call's position among the *undecided* ones
   * returned −1, which clamped to zero and opened somebody else's card — found
   * on the live app, 2026-09-15.
   */
  const [openedKey, setOpenedKey] = useState<string | null>(null)
  const [holdCleared, setHoldCleared] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /**
   * **Why the decisions he made are no longer there**, and its own state rather
   * than the notice above.
   *
   * The notice is the refresh talking — it is cleared the moment a run starts,
   * which is the very next thing a correction does. A dropped lock is not run
   * chatter: it is the answer to "where did my call go", and it has to outlive
   * the run that the same upload kicked off.
   */
  const [dropped, setDropped] = useState<string | null>(null)

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

  /** The run a team link or a correction asks for, started exactly once. */
  const autoRan = useRef(false)

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

  // On the Overview these are the whole week rather than one category: the
  // refresh is all-scope there (F8-AC-12) and the interstitial has to state what
  // that covers.
  const onOverview = tab === 'overview'
  const here = onOverview ? shown : inCategory(tab)
  const pending = onOverview ? [] : pendingIn(tab)
  const outstanding = onOverview
    ? shown.filter((s) => decisions.decisions[s.key] === undefined && s.figures.reading === 'call')
    : outstandingIn(tab)
  const reopenedHere = here.filter((s) => decisions.reopened[s.key] !== undefined).length

  // Category cleared takes over when nothing is left pending, and stays while
  // rows are reopened and restored on it — until the manager asks to review them.
  useEffect(() => {
    if (!onOverview && here.length > 0 && pending.length === 0) setHoldCleared(true)
  }, [onOverview, here.length, pending.length])
  // Unchanged, and it already does the right thing for a keep reading: a reading
  // is never decided, so a tab holding one never empties `pending`, never sets
  // `holdCleared`, and never has the cleared summary take the card's place. The
  // Captain tab always has something to show, which is F4-AC-01.
  /**
   * The card on screen. A deliberately opened call wins over the cursor, and the
   * cursor is what the arrows move — so the arrows still walk undecided calls
   * only, which is the half of F3-AC-13 that still holds.
   */
  const opened = openedKey === null ? undefined : shown.find((c) => c.key === openedKey)
  const current = opened ?? (pending.length > 0 ? pending[cursor % pending.length] : undefined)
  /** Undefined unless the card on screen is one already decided. */
  const currentDecision = current ? decisions.decisions[current.key] : undefined

  // A deliberately opened card outranks the cleared summary: the manager asked
  // for that call, and a tab whose every call is decided is exactly when he does.
  const showCleared = opened === undefined && here.length > 0 && (pending.length === 0 || holdCleared)


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

    /**
     * **Change, on a card opened to be read.** It reopens the call in place —
     * the same two-way control Category cleared offers (F3-AC-14) — and the card
     * stays on screen, now undecided, so the manager can act on what he just
     * read. It must not fall through to *Later* below, which advances to the
     * next card without recording anything.
     */
    if (currentDecision !== undefined && state === 'pending') {
      const key = current.key
      setOpenedKey(null)
      setCursor(Math.max(0, pending.findIndex((c) => c.key === key)))
      void record(key, 'pending', (d) => reopen(d, key))
      return
    }

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
      /**
        * **The last undecided card goes to the Overview** (STE-122).
        *
        * Head to head shows only undecided calls (F3-AC-13), so on the last one
        * there is nothing to advance to and the card simply stayed put —
        * correct, and indistinguishable from a control that does not work.
        * Stephen found it running slice 5's checklist on 2026-09-11, and the
        * answer waited on the Overview existing at all.
        *
        * Going there rather than to another category is the point: the call is
        * still pending and the Overview is where a pending call is visible
        * beside everything else, so *Later* now takes him somewhere that shows
        * him what he deferred. Hopping to the next category instead was the
        * stopgap, and it answered a different question — *what else is there* —
        * while leaving the deferred call out of sight.
        *
        * **Only the last card changes.** With more than one left, *Later* still
        * moves to the next undecided call, which is right and is the branch
        * above. F3-AC-12 covers deciding rather than deferring, so this is
        * behaviour the criteria leave open.
        */
      const here = TABS.find((t) => t.category === tab)
      setTab('overview')
      setCursor(0)
      setHoldCleared(false)
      setNotice(`${here?.noun ?? 'That call'} left for later — it is on the overview.`)
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
          // Nothing behind the advice moved, so nothing was spent and the week
          // stands. Said plainly rather than shown as an empty report — and it
          // is now a claim the server can actually make, because it re-derives
          // every stored call before saying it rather than only checking FPL's
          // player records (STE-128).
          if (event.reused) setNotice('Nothing behind your advice has moved. Your calls stand.')
          else setShowDiff(true)
          onReload()
        } else {
          // **The server's sentence, not ours** (STE-187). It knows which stage
          // broke; a run written before this shipped carries none, and then the
          // old wording stands.
          setError(event.message ?? RUN_FAILED)
        }
      }
    } catch (cause) {
      // An abort is the manager's own doing and is not an error to report at him.
      // The stream itself broke, so there is no server verdict to show.
      if (!controller.signal.aborted) setError(RUN_FAILED)
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
    const title = armbandTitle(s.call, players) ?? `${SHAPE_TITLE[s.call.shape]}: ${s.out.name} → ${s.into.name}`
    const decided = decisions.decisions[s.key]
    if (decided !== undefined) return [{ key: s.key, title, state: decided }]
    if (decisions.reopened[s.key] !== undefined) return [{ key: s.key, title, state: 'reopened' as const }]
    return []
  })

  const noRunYet = world.calls.length === 0 && world.lastRunAt === null

  /**
   * **Two routes arrive here already meaning to run**: the team link finishing
   * (F7-AC-15) and a squad correction (F2-AC-05). Both are the manager's own
   * action one screen earlier, so `F6-AC-15`'s *nothing refreshes on its own*
   * is intact — nothing sets this flag but those two.
   *
   * The ref is what stops a re-render starting a second run, which would spend
   * twice for one action.
   */
  useEffect(() => {
    if (!startRun || autoRan.current) return
    autoRan.current = true
    // **Spend the request before taking it.** The ref below only ever guarded a
    // re-render; walking to the Squad screen and back unmounts this component
    // and takes the ref with it, so the flag has to be cleared where it lives
    // (STE-137).
    onRunStarted?.()
    /**
     * **Say what the correction cost, in the same breath as acting on it.**
     * A decision that simply disappears is indistinguishable from one the app
     * lost, and the whole reason the count comes back from the upload.
     */
    if (decisionsCleared > 0) {
      setDropped(
        decisionsCleared === 1
          ? 'Your updated squad is the current one, so the call you had already decided has been cleared. The advice below is for this squad.'
          : `Your updated squad is the current one, so the ${String(decisionsCleared)} calls you had already decided have been cleared. The advice below is for this squad.`,
      )
    }
    void onRefresh()
  }, [startRun])

  /**
   * **One derivation of the week, for the editorial, the token and the tab
   * meta.** Three readings of one pair of lists, which is what makes F8-AC-06
   * true by construction rather than by care.
   */
  const week = useMemo(() => weekOf(world, decisions.decisions), [world, decisions.decisions])

  /** What a tap would rewrite, named on the control itself (F6-AC-07). */
  /**
   * **Every refresh rewrites everything, so every control says so** (STE-158).
   *
   * This used to read `'everything'` on the Overview and the tab's own noun
   * anywhere else — so the confirmation sheet said *"Refresh transfers"* over a
   * run that also rewrote captaincy and substitutions. `run.scope` is a column
   * with a check constraint that nothing has ever set, and `POST
   * /api/runs/stream` has never taken a scope: every run reads the whole world
   * and rewrites every pending call.
   *
   * Nothing was wrong with the advice. What the wording could cost was a
   * *pending* call on a tab the manager believed he was leaving alone — a
   * selected one is carried forward and survives (F6-AC-02).
   *
   * **Ruled by Stephen on 2026-09-16: the run keeps doing everything and the
   * label changes to match**, rather than the run being scoped to fit the label.
   * `F6-AC-08` already leans this way — *one rule is easier to trust than a rule
   * plus three shortcuts* — and `F6-AC-09` needs the news token's refresh to be
   * all-scope regardless, which is now simply what every refresh is.
   *
   * **`F6-AC-07` is unmet as written until the PRD catches up**, because it asks
   * for a control scoped to the screen it is on. No test may name it in the
   * meantime.
   */
  const refreshScope = 'everything'

  return (
    <main className={styles.screen}>
      <header className={styles.brandRow}>
        {/* The avatar is the route into the account sheet, on every screen
            carrying a header (F7-AC-21). */}
        <button
          className={styles.avatarButton}
          onClick={() => setAccountOpen(true)}
          aria-label="Account"
          data-testid="account"
          type="button"
        >
          <img className={styles.avatar} src={avatar} alt="" />
        </button>
        <span className={styles.wordmark}>The Gaffer</span>
        {/* **Symbol only, in the header.** The label changed width between tabs
            and took the header's height with it, so what a tap would rewrite is
            named in the confirmation and in the accessible name, which is where
            it does the work (F6-AC-07, F6-AC-10). */}
        <NewsToken
          flagged={week.flagged}
          since={world.news?.since ?? null}
          disabled={running || world.feedsReachable === false}
          onRefreshAll={() => {
            // Always every scope: new team news is squad-wide, and a scoped run
            // must never half-clear the token (F8-AC-16, F6-AC-09).
            setTab('overview')
            setAsking(true)
          }}
        />
        <button
          className={running ? `${styles.refresh} ${styles.refreshOff}` : styles.refresh}
          onClick={() => setAsking(true)}
          disabled={running || noRunYet || world.feedsReachable === false}
          aria-label={`Refresh ${refreshScope}`}
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
        {/* First and default: this is the entry screen for the week, and the
            decision tabs are what it leads into (F8 happy path). */}
        <button
          role="tab"
          aria-selected={tab === 'overview'}
          className={tab === 'overview' ? styles.tabOn : styles.tab}
          onClick={() => {
            setTab('overview')
            setOpenedKey(null)
            setNotice(null)
          }}
          data-testid="tab-overview"
          type="button"
        >
          <span>Overview</span>
          <span className={styles.tabMeta}>{noRunYet ? '—' : week.live.length === 0 ? 'Clear' : String(week.live.length)}</span>
        </button>
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
              data-testid={`tab-${t.category}`}
              onClick={() => {
                setTab(t.category)
                setOpenedKey(null)
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

      {/* **The last-run line and the card stepper share a row.**
          The stepper used to sit above the card with a "TRANSFER · CALL 1 OF 3"
          label beside it — a second line of chrome stating what the tab strip
          and the card's own header already say, and the card paid for it in
          height. The line still says outright when squad news is outstanding
          (F8-AC-18), so the token is never the only place it is stated. */}
      <div className={styles.statusLine}>
        <p className={styles.lastRun} data-testid="last-run">
          {world.lastRunAt === null
            ? 'no run yet this gameweek'
            : week.flagged.length > 0
              ? `last run ${clockOf(world.lastRunAt)} · ${String(week.flagged.length)} player${week.flagged.length === 1 ? '' : 's'} flagged since`
              : `last run ${clockOf(world.lastRunAt)} · squad news up to date`}
        </p>

        {!onOverview && current && pending.length > 0 ? (
          <span className={styles.stepper}>
            <button
              className={styles.pager}
              onClick={() => {
                setOpenedKey(null)
                setCursor((c) => (c + pending.length - 1) % pending.length)
              }}
              aria-label="Previous undecided call"
              type="button"
            >
              ‹
            </button>
            <button
              className={styles.pager}
              onClick={() => {
                setOpenedKey(null)
                setCursor((c) => (c + 1) % pending.length)
              }}
              aria-label="Next undecided call"
              type="button"
            >
              ›
            </button>
            <span className={styles.left}>{pending.length} LEFT</span>
          </span>
        ) : null}
      </div>


      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {dropped ? (
        <p className={styles.notice} role="status" data-testid="dropped">
          {dropped}
        </p>
      ) : null}

      {notice ? (
        <p className={styles.notice} role="status" data-testid="notice">
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
        {/* **A stop, not a prompt** (F6-UP-03, ruled 2026-09-10). A refresh says
            *there is newer data, want it?* and can reasonably be declined. This
            says *the week I am advising on has already been played* — there is
            nothing to weigh, so there is nothing to dismiss, and it replaces the
            calls rather than sitting over them. Putting the two in the same
            dismissible sheet teaches the manager to click past a broken state
            the same way as a routine one. */}
        {world.gameweekStop ? (
          <div className={styles.stop} data-testid="gameweek-stop">
            <div className={styles.stopHead}>Advice out of date</div>
            <div className={styles.stopBody}>
              <p>
                <strong>
                  Gameweek {world.gameweekStop.gameweek}
                  {world.gameweekStop.reason === 'deadline_passed' ? ' has already started.' : ' is not covered by the projections.'}
                </strong>
              </p>
              <p>
                {world.gameweekStop.reason === 'deadline_passed'
                  ? 'Everything below was worked out for a week you can no longer change, so none of it is advice any more.'
                  : 'The two data sources disagree about which week this is, so nothing here can be trusted.'}
              </p>
              <p className={styles.stopMeta}>Reopen the app once the new gameweek is live and it will work the week out again.</p>
            </div>
          </div>
        ) : running ? (
          <Thinking current={step} scale={scale} gameweekId={world.gameweek.id} onCancel={onCancelRun} />
        ) : noRunYet ? (
          <div className={styles.empty}>
            <p>No calls yet this gameweek.</p>
            {/* The same streamed run as a refresh — and this is the longest one
                of the week, so it is the run that most needs a pipeline and a
                way out. There is nothing to confirm first: a first run keeps,
                rewrites and suppresses nothing. */}
            <button className={styles.primary} onClick={() => void onRefresh()} disabled={running} type="button">
              {running ? 'Reading the feeds and working out the week…' : "Get this week's calls"}
            </button>
          </div>
        ) : onOverview ? (
          <Overview
            world={world}
            week={week}
            decisions={decisions.decisions}
            nameOf={(id) => players.get(id)?.name ?? 'A player'}
            onOpen={(call) => {
              setTab(call.category)
              setOpenedKey(call.key)
              setHoldCleared(false)
              setNotice(null)
            }}
            onDecide={(call, state) => {
              if (state === 'pending') {
                void record(call.key, 'pending', (d) => reopen(d, call.key))
                return
              }
              void record(call.key, state, (d) => decide(d, call.key, state))
            }}
            onShowAll={() => setNotice(null)}
          />
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
              <p className={styles.verdictText}>
                {clearVerdict(tab, TABS.find((t) => t.category === tab)?.clear ?? '', world.calls, players)}
              </p>
            </div>
          </div>
        ) : showCleared ? (
          <CategoryCleared
            noun={TABS.find((t) => t.category === tab)?.noun ?? ''}
            rows={clearedRows}
            reopened={reopenedHere}
            /* Read from the same list the tab strip counts, so the two can never
               disagree about how much is left (STE-165). */
            outstanding={TABS.filter((t) => t.category !== tab)
              .map((t) => ({ category: t.category, noun: t.noun, count: outstandingIn(t.category).length }))
              .filter((t) => t.count > 0)}
            onToggle={onToggle}
            onReview={() => {
              setHoldCleared(false)
              setCursor(0)
            }}
            onOverview={() => {
              setTab('overview')
              setCursor(0)
              setHoldCleared(false)
            }}
            onGo={(category) => {
              setTab(category as Category)
              setCursor(0)
              setHoldCleared(false)
            }}
          />
        ) : current ? (
          <HeadToHead
            key={current.key}
            shown={current}
            gameweekId={world.gameweek.id}
            players={players}
            onDecide={onDecide}
            picker={picker}
            {...(currentDecision ? { decided: currentDecision } : {})}
          />
        ) : null}

        {/* Asked before it runs, and the question explains the outcome rather
            than being a bare "are you sure?" (F6-AC-10). */}
        {asking ? (
          <RefreshInterstitial
            scope={refreshScope}
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
            rows={diffRows(world.calls, (id) => players.get(id)?.name ?? 'A player')}
            untouched={world.calls.length - diffRows(world.calls, () => '').length}
            onClose={() => setShowDiff(false)}
          />
        ) : null}
      </section>

      {accountOpen ? (
        <AccountSheet
          teamName={account.teamName}
          managerName={account.managerName}
          gameweekId={world.gameweek.id}
          onCancel={() => setAccountOpen(false)}
          onLoggedOut={account.onLoggedOut}
        />
      ) : null}
    </main>
  )
}
