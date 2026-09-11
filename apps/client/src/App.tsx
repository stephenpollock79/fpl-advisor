import { WorldProvider, useReloadWorld, useWorld } from "./world/WorldContext"
import { SquadScreen } from "./screens/Squad/SquadScreen"
import { AssistantScreen } from "./screens/Assistant/AssistantScreen"
import { LinkTeam } from "./screens/LinkTeam/LinkTeam"
import { SignIn } from "./screens/SignIn/SignIn"
import { type Me, fetchMe } from "./api"
import { useCallback, useEffect, useState } from "react"

/**
 * What the app shows.
 *
 * The Landing screen — the one place a signed-out visitor lands, carrying the
 * log-in card — is F7-AC-16 and arrives with slice 8. Until then the signed-out
 * state says so plainly rather than pretending to be a product screen.
 */
export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)

  const load = useCallback((signal?: AbortSignal) => {
    return fetchMe(signal)
      .then(setMe)
      .catch((cause: unknown) => {
        if (signal?.aborted) return
        if (cause instanceof Error && cause.name === "AbortError") return
        setFailed(true)
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (failed) return <Note>Could not reach the app. Try again in a moment.</Note>
  if (me === undefined) return <Note>Loading…</Note>
  // A stand-in, not the Landing screen — see screens/SignIn. Slice 8 replaces it.
  if (me === null) return <SignIn onSignedIn={() => void load()} />
  if (me.needsTeamLink) return <LinkTeam onLinked={() => void load()} />

  return (
    <WorldProvider>
      <Squad />
    </WorldProvider>
  )
}

function Squad() {
  const state = useWorld()
  const reload = useReloadWorld()
  const [view, setView] = useState<"squad" | "assistant">("squad")

  // A first open fetches both feeds before answering, so this can take a few
  // seconds. The Thinking state that narrates it properly is F6 and F8.
  if (state.status === "loading") return <Note>Reading the world — squad, fixtures and projections…</Note>
  if (state.status === "no_team_linked") return <Note>No FPL team linked yet.</Note>
  if (state.status === "failed") return <Note>Could not load your squad: {state.because}</Note>
  if (view === "assistant") {
    return <AssistantScreen world={state.world} onSquad={() => setView("squad")} onReload={reload} />
  }
  return <SquadScreen world={state.world} onAssistant={() => setView("assistant")} />
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ padding: 24, fontSize: 13, lineHeight: 1.5, color: "#46433d" }}>{children}</main>
  )
}
