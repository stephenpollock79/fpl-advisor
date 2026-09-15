import { WorldProvider, useReloadWorld, useWorld } from "./world/WorldContext"
import { SquadScreen } from "./screens/Squad/SquadScreen"
import { AssistantScreen } from "./screens/Assistant/AssistantScreen"
import { LinkTeam } from "./screens/LinkTeam/LinkTeam"
import { Landing } from "./screens/Landing/Landing"
import { type Me, fetchMe } from "./api"
import { useCallback, useEffect, useState } from "react"

/**
 * What the app shows.
 *
 * **The Landing screen is the only screen reachable without an account**
 * (F7-AC-16), and there is no per-screen signed-out view (F7-AC-25): signing out
 * returns the whole app here, on the Log in tab.
 */
export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  // Set when the manager signs out, so Landing opens where he just was rather
  // than on the sales tab (F7-AC-25).
  const [landOnLogin, setLandOnLogin] = useState(false)
  // True for the one render after the team link is confirmed, so onboarding
  // finishes in the Thinking state rather than on a placeholder (F7-AC-15).
  const [justLinked, setJustLinked] = useState(false)

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
  if (me === null) {
    return (
      <Landing
        startOn={landOnLogin ? 'login' : 'about'}
        onSignedIn={() => {
          setLandOnLogin(false)
          void load()
        }}
      />
    )
  }
  if (me.needsTeamLink) {
    return (
      <LinkTeam
        onLinked={() => {
          // **One screen and one run** (F7-AC-15). Confirming the team is the
          // end of onboarding, and what follows is the first advice run — not a
          // tour, not a settings pass, and not a squad screen with nothing on
          // it. Nothing refreshes on its own here (F6-AC-15): this run is the
          // manager's own confirmation, one tap earlier.
          setJustLinked(true)
          void load()
        }}
      />
    )
  }

  return (
    <WorldProvider>
      <Squad
        me={me}
        justLinked={justLinked}
        onLoggedOut={() => {
          setLandOnLogin(true)
          setMe(null)
        }}
      />
    </WorldProvider>
  )
}

function Squad({ me, justLinked, onLoggedOut }: { me: Me; justLinked: boolean; onLoggedOut: () => void }) {
  const state = useWorld()
  const reload = useReloadWorld()
  // Straight to the Assistant after the team link: that is where the run is.
  const [view, setView] = useState<"squad" | "assistant">(justLinked ? "assistant" : "squad")
  // A squad correction returns through the Thinking state (F2-AC-05), which is
  // the same route onboarding's first run takes.
  const [corrected, setCorrected] = useState(false)

  // A first open fetches both feeds before answering, so this can take a few
  // seconds. The Thinking state that narrates it properly is F6 and F8.
  if (state.status === "loading") return <Note>Reading the world — squad, fixtures and projections…</Note>
  if (state.status === "no_team_linked") return <Note>No FPL team linked yet.</Note>
  if (state.status === "failed") return <Note>Could not load your squad: {state.because}</Note>

  // **The sheet belongs to the screen it was opened from** (F7-AC-23), so each
  // screen renders its own and cancelling returns there because nothing left.
  const account = {
    teamName: me.manager?.team_name ?? null,
    managerName: me.manager?.manager_name ?? null,
    onLoggedOut,
  }

  if (view === "assistant") {
    return (
      <AssistantScreen
        world={state.world}
        onSquad={() => setView("squad")}
        onReload={reload}
        account={account}
        startRun={justLinked || corrected}
      />
    )
  }
  return (
    <SquadScreen
      world={state.world}
      onAssistant={() => setView("assistant")}
      onCorrected={() => {
        setCorrected(true)
        reload()
        setView("assistant")
      }}
      account={account}
    />
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ padding: 24, fontSize: 13, lineHeight: 1.5, color: "#46433d" }}>{children}</main>
  )
}
