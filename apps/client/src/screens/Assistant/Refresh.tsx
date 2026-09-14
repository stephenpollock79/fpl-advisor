/**
 * The three states of a refresh: asking, running, and reporting.
 *
 * **This screen computes no figure.** Steps and their labels arrive from the
 * server, so a label and a state can never contradict each other (F6-AC-18); the
 * diff's numbers are the run's own. What lives here is elapsed time, which is
 * about the screen rather than the advice.
 */

import { useEffect, useRef, useState } from 'react'
import type { RunStep } from '../../api'
import styles from './Assistant.module.css'

const STEPS: { id: RunStep['id']; label: string }[] = [
  { id: 'read', label: 'Reading the feeds' },
  { id: 'diff', label: 'Checking what has changed' },
  { id: 'propose', label: 'Looking for candidates' },
  { id: 'score', label: 'Scoring the week' },
  { id: 'explain', label: 'Writing the reasoning' },
]

/**
 * **Every refresh is confirmed before it runs** (F6-AC-10), and the confirmation
 * explains the outcome rather than asking a bare *are you sure?* — what is kept,
 * what is forced back, what is rewritten, what stays out. A manager who cannot
 * tell what a button will do to his week has no way to decide whether to press it.
 */
export function RefreshInterstitial({
  scope,
  lastRunAt,
  selected,
  rejected,
  pending,
  onGo,
  onCancel,
}: {
  scope: string
  lastRunAt: string | null
  selected: number
  rejected: number
  pending: number
  onGo: () => void
  onCancel: () => void
}) {
  return (
    <div className={styles.sheet} role="dialog" aria-label={`Refresh ${scope}`}>
      <p className={styles.sheetTitle}>Refresh {scope}</p>
      <p className={styles.sheetMeta}>
        {lastRunAt === null ? 'No advice run yet' : `Last run ${new Date(lastRunAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
      </p>
      <ul className={styles.sheetList}>
        <li>
          <strong>{selected}</strong> selected {selected === 1 ? 'call is' : 'calls are'} kept, and the money and transfers they use stay spent.
        </li>
        <li>
          <strong>{pending}</strong> undecided {pending === 1 ? 'call is' : 'calls are'} rewritten from scratch.
        </li>
        <li>
          <strong>{rejected}</strong> rejected {rejected === 1 ? 'call stays' : 'calls stay'} out, unless what you rejected has changed.
        </li>
        <li>A player who has become unavailable comes back whatever you said before.</li>
      </ul>
      <div className={styles.sheetActions}>
        <button className={styles.secondary} onClick={onCancel} type="button">
          Not now
        </button>
        <button className={styles.primary} onClick={onGo} type="button">
          Refresh {scope}
        </button>
      </div>
    </div>
  )
}

/**
 * The working state (F6-AC-16 to F6-AC-19).
 *
 * **Exactly one step is running at any moment**, completed ones carry the time
 * they took, and the rest are visibly queued — so the screen says what is
 * happening rather than that something is. It is cancellable for the whole of it.
 */
export function Thinking({
  current,
  scale,
  gameweekId,
  onCancel,
}: {
  current: RunStep | null
  scale: { players: number; squad: number } | null
  gameweekId: number
  onCancel: () => void
}) {
  const [elapsed, setElapsed] = useState<Record<string, number>>({})
  const stepStartedAt = useRef<number>(Date.now())
  const previous = useRef<string | null>(null)

  useEffect(() => {
    if (!current || previous.current === current.id) return
    if (previous.current !== null) {
      const id = previous.current
      setElapsed((e) => ({ ...e, [previous.current as string]: Date.now() - stepStartedAt.current }))
      void id
    }
    previous.current = current.id
    stepStartedAt.current = Date.now()
  }, [current])

  const index = current ? STEPS.findIndex((s) => s.id === current.id) : -1
  const took = (id: string) => {
    const ms = elapsed[id]
    if (ms === undefined) return null
    return ms < 100 ? '<0.1s' : `${(ms / 1000).toFixed(1)}s`
  }

  return (
    // Tap anywhere to cancel, as the handoff has it — and a real control in the
    // footer as well, because a gesture with nothing to see is not something a
    // manager can be expected to discover (F6-AC-19).
    <div className={styles.thinking} data-testid="thinking" onClick={onCancel} role="presentation">
      <div className={styles.thinkingStrip}>
        <span>Working your gameweek</span>
        <span>GW{gameweekId}</span>
      </div>

      <div className={styles.thinkingHead}>
        <span className={styles.thinkingSpinner} aria-hidden="true">
          <span className={styles.thinkingPulse} />
        </span>
        <p className={styles.thinkingTitle}>Reading your gameweek</p>
        {scale ? (
          <p className={styles.thinkingScale}>
            {scale.squad} IN YOUR SQUAD · {scale.players} PLAYERS · 3 GAMEWEEKS
          </p>
        ) : null}
      </div>

      {/* The rolling status line, separate from the pipeline: the pipeline says
          how far the run has got, this says what it is doing right now. Both come
          from the server, so neither can disagree with the other (F6-AC-17). */}
      <div className={styles.thinkingNowRow}>
        <p className={styles.thinkingNow} data-testid="thinking-now">
          <span className={styles.thinkingDot} aria-hidden="true" />
          {current?.label ?? 'Starting'}
          {current?.calls !== undefined ? ` — ${String(current.calls)} calls` : ''}…
        </p>
        <span className={styles.sweep} aria-hidden="true">
          <span className={styles.sweepBar} />
        </span>
      </div>

      <div className={styles.pipelineBox}>
        <span className={styles.pipelineLabel}>PIPELINE</span>
        <ol className={styles.pipeline}>
          {STEPS.map((step, i) => {
            const state = i < index ? 'done' : i === index ? 'running' : 'queued'
            const mark = state === 'done' ? '\u2713' : state === 'running' ? '\u25b8' : '\u00b7'
            return (
              <li key={step.id} className={styles[`step${state[0]?.toUpperCase() ?? ''}${state.slice(1)}`] ?? styles.stepQueued} data-state={state}>
                <span className={styles.stepMark} aria-hidden="true">
                  {mark}
                </span>
                <span className={styles.pipeStep}>{step.label}</span>
                <span className={styles.stepState}>
                  {state === 'done' ? (took(step.id) ?? '') : state === 'running' ? 'running' : 'queued'}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <button className={styles.thinkingFooter} onClick={onCancel} type="button">
        Tap anywhere to cancel · usually under a minute
      </button>
    </div>
  )
}

import type { DiffRow } from '../../calls/view'

export type { DiffRow }

/**
 * **A refresh produces a diff, never a silent replace** (F6-AC-11) — and **no
 * sheet at all when nothing was invalidated, resurfaced or moved band**
 * (F6-AC-12). A sheet that appears to say "nothing happened" teaches the manager
 * to dismiss it without reading, which is the one habit this report cannot afford.
 */
export function DiffSheet({ rows, untouched, onClose }: { rows: DiffRow[]; untouched: number; onClose: () => void }) {
  if (rows.length === 0) return null

  return (
    <div className={styles.sheet} role="dialog" aria-label="What changed" data-testid="diff-sheet">
      <p className={styles.sheetTitle}>What changed</p>
      <ul className={styles.sheetList}>
        {rows.map((row) => (
          <li key={row.key}>
            <strong>{row.title}</strong> — {row.note}
          </li>
        ))}
      </ul>
      <p className={styles.sheetMeta}>
        {untouched} other {untouched === 1 ? 'call is' : 'calls are'} unchanged.
      </p>
      <div className={styles.sheetActions}>
        <button className={styles.primary} onClick={onClose} type="button">
          Got it
        </button>
      </div>
    </div>
  )
}
