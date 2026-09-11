/**
 * The world, held once.
 *
 * One context and one reducer, per architecture §11. No server-state library and
 * no client-state library: the app makes about six requests and recomputes
 * locally by design, so a second cache would be machinery this shape does not use.
 *
 * Every screen reads from here and derives what it shows. Nothing derived is
 * stored — not the formation, not the totals — so nothing can drift from the
 * players it describes.
 *
 * `reload` re-reads the world after something changed it on the server — a run
 * that produced calls. The previous world stays on screen while the new one is
 * read, so a reload never blanks the page.
 */

import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react'
import { ApiError, type World, fetchWorld } from '../api'

type State =
  | { status: 'loading' }
  | { status: 'ready'; world: World }
  | { status: 'no_team_linked' }
  | { status: 'failed'; because: string }

const WorldContext = createContext<State>({ status: 'loading' })
const ReloadContext = createContext<() => void>(() => {})

export function WorldProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    fetchWorld(controller.signal)
      .then((world) => setState({ status: 'ready', world }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof Error && cause.name === 'AbortError') return
        // A missing team link is a step not yet taken, not a failure. Reading it
        // as an error would send the manager looking for something broken.
        if (cause instanceof ApiError && cause.code === 'no_team_linked') {
          setState({ status: 'no_team_linked' })
          return
        }
        setState({ status: 'failed', because: cause instanceof Error ? cause.message : 'unknown' })
      })

    return () => controller.abort()
  }, [version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return (
    <ReloadContext.Provider value={reload}>
      <WorldContext.Provider value={state}>{children}</WorldContext.Provider>
    </ReloadContext.Provider>
  )
}

export function useWorld(): State {
  return useContext(WorldContext)
}

export function useReloadWorld(): () => void {
  return useContext(ReloadContext)
}
