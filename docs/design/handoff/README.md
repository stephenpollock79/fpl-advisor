# Handoff: FPL Advisor — mobile decision-support app

## Overview

FPL Advisor is a portrait-phone app for a single Fantasy Premier League manager. Once a week it
reads the manager's squad, runs a model, and returns a small set of **calls** — transfers,
substitutions, a captaincy pick, and a season-long chip plan. The manager decides each call
individually (select / reject / leave pending); the app never makes a move in the user's FPL
account.

The assistant has a persona, **The Gaffer**, who is the voice of every recommendation. The product
is invite-only: accounts are created by the owner, and there is no public registration.

Two files are bundled:

| File | What it is |
| --- | --- |
| `FPL Advisor Prototype.dc.html` | The interactive prototype. Source of truth for **what exists and how it behaves**. |
| `FPL Advisor Design System.dc.html` | Palette, type, controls, widgets and their states. Source of truth for **visual specs**. |

Open either file directly in a browser. `support.js` and `assets/` must sit alongside them.

## About the design files

**These are design references created in HTML — prototypes showing intended look and behaviour, not
production code to copy.** The prototype is a single-component HTML file with all styling inline and
all sample data hard-coded; it is built to be *read*, not shipped.

The task is to **recreate these designs in the target codebase's existing environment** — React,
Vue, SwiftUI, Compose, whatever is already there — using its established components, styling
approach, state library and networking layer. If no environment exists yet, choose the framework
that best fits the project (a portrait-only phone app with no desktop layout, so React Native,
Swift/SwiftUI or Compose are all reasonable) and implement the designs there.

Do not port the prototype's internals. In particular: the inline styles, the single-class structure,
and the demo data helpers (`OUT_CANDS`, `IN_CANDS`, `T_PAIRS`, `POST_REFRESH`, `DRIFTED`) are
scaffolding for a clickable mock. What *should* be carried over faithfully is the **model rules**
section below — those are product decisions, not implementation details.

## Fidelity

**High-fidelity.** Final colours, typography, spacing, radii, shadows, copy and interaction states.
Recreate the UI pixel-perfectly using the codebase's existing libraries where they can hit these
values, and follow the Design System file when they differ. Every figure, label and piece of copy in
the prototype is deliberate — including the abbreviations and the caps-label wording.

## Hard constraints

These are not preferences. Breaking any of them is a bug.

1. **Portrait phone only, 390 × 844.** No desktop layout, no responsive breakpoints, ever.
2. **No screen scrolls as a whole.** Every screen fits 844px exactly. Only these regions scroll:
   the stat table (both axes), the evaluation table inside a detail card, the candidate picker,
   the Overview column, the Chips plan panel, and the fifteen-player list on the Chip proposal.
3. **Minimum body text 9px.** Primary tap targets 44px; dense status-row controls may be 28–32px
   with extended hit areas.
4. **Player markers are kit/number icons, never photos.** No headshot data exists.
5. Sample data uses real current Premier League names.

## Screens / views

Eleven screens, each a `[data-screen-label]` root in the prototype. Sheets and overlays are not
separate screens — they render over Squad state or Recommendation.

### 1. Landing (`Landing`)
**Purpose:** the only screen reachable without an account. Log in, or read what the product does.
**Layout:** vertically centred column, 22px side padding. Circular 96px Gaffer avatar (3px `#10985A`
border, green glow shadow), wordmark, invite-only badge, then a white card with a two-tab header.
Standing disclaimer pinned at the foot.
**Components:**
- **Wordmark** — "The Gaffer", Lobster Two bold italic, `#0A6E3D`.
- **Invite-only badge** — pill, `#F3F0E9` on `#D5CFC2` border, mono 8px caps: `INVITE ONLY · NO
  PUBLIC SIGN-UP`. States the constraint before anyone types.
- **Tabs** — "What he does" / "Log in". Active tab `#10985A` on white, inactive `#6A655C`.
- **Log in, step 1** — one email field (44px, 10px radius, `#D5CFC2` border), primary button
  "Send me a code" (48px, `#F7F4EE` fill, 2px `#BFDCCB` border, `#0E8A4E` text).
- **Log in, step 2** — same card, not a new screen. Warm info strip repeating the address, then a
  six-digit code field (48px, mono 20px, `.34em` tracking, centred), "Log in" button, and two mono
  9px links: `SEND ANOTHER CODE` / `USE A DIFFERENT ADDRESS`.
- **Error card** — inline inside the login card, never a toast. `#FDF3F4` fill, `#F0D3D7` border,
  circular `#E03A4E` "!" glyph, `#A32C3C` text. Covers wrong, expired and already-used codes.
- **"What he does" tab** — five one-line claims; tapping one expands it to a sentence with a small
  device mock beside it.
**Critical behaviour:** the screen responds **identically whether or not the entered address has
access** — same copy, same next step, no hint either way. There is no password field and no
password-reset affordance anywhere in the product.

### 2. Link FPL team (`Link FPL Team`)
**Purpose:** capture the manager's FPL team ID. **First login ever only** — this single step *is*
the onboarding; there is no wizard, and it is skipped on every subsequent login.
**Layout:** status bar, Gaffer header (46px avatar + wordmark), then a 16px-padded column.
**Components:**
- Mono 8px caps eyebrow `ONE-OFF SETUP · FIRST LOG IN`, 20px/800 title, 12px explanatory body.
- **"Where to find it" panel** — `#F3F0E9` on `#DFDACE`, showing
  `fantasy.premierleague.com/entry/`**`1234567`**`/event/4` with the ID highlighted in green, plus a
  second line covering the FPL app route.
- **Entry state** — one numeric field (48px, mono 18px, `.16em` tracking), "Find my team" button.
- **Confirm state** — green-tinted card (`rgba(16,152,90,.10)` on `rgba(16,152,90,.32)`) with a
  check glyph, `FOUND · IS THIS YOU?`, the team name at 17px/800, manager name and overall rank in a
  two-column grid, and the team ID on a divided footer row. Then a solid `#10985A` primary button
  "Yes — that's my team" and a quiet secondary "Not mine — try another ID".
- **Error state** — same inline red card as login, for an ID that resolves to no team.
- Footer: the Gaffer only reads the team, never makes a move.
**Critical behaviour:** the confirm step exists because the app cannot know whose squad a wrong ID
would load. On confirm it proceeds into the Thinking state exactly as a normal run does.

### 3. Thinking state (`Thinking state`)
**Purpose:** the run. Fetches the squad and computes every call.
**Components:** a labelled pipeline (squad + bank sync, fixture difficulty, injury/press scan,
transfer market, chip window) with per-stage durations and a rolling status line. Entered from a
confirmed team link, a manual re-run, or a scoped refresh.

### 4. Squad state (`Squad State`)
**Purpose:** what the manager currently has. Two modes via a Pitch / Stat toggle.
**Pitch mode:** deeper-green pitch, **goal at the top**, keeper in the penalty area, forwards nearest
the halfway line at the bottom. Markers stay upright and are kit/number icons with availability
badges (`INJ` red, `75%`/`50%` amber) and armband badges (C/V). Bench sits below, ordered GK, 1, 2, 3.
**Stat mode:** grouped table (GKP/DEF/MID/FWD) scrolling on both axes — availability, form, xPts,
this-GW fixture with a difficulty bar, price, selected-by, season points, transfers in/out.
**Overlays:** account sheet, upload sheet, log-out confirm.

### 5. Recommendation (`Recommendation`)
The core screen. Five tabs: **Overview**, **Transfer**, **Sub**, **Captain**, **Chips**.
- **Overview** — the only scrolling column. A green header strip (`THE WEEK IN ONE READ`), the
  Gaffer's editorial with a MORE/LESS clamp, a flagged-players row that expands to a dropdown, a
  conviction tally, then grouped call rows (TRANSFERS / SUBSTITUTIONS / CAPTAIN). Each row: title,
  sub-line, optional fixture tag (`BLANK` / `×2`), optional flag (`FORCED` / `WATCH`), xPTS, COST,
  CONVICTION, and a status control. A fixed footer bar shows the plan's xPTS, BAL and the
  free-transfer chip.
- **Transfer / Sub / Captain** — one head-to-head detail card per call, with prev/next stepping
  (`SUBSTITUTION · CALL 2 OF 3`). Out player versus in player, kit icons, an evaluation table
  (scrolling) with a win/lose/tie mark per row, net xPts, cost, hit, conviction meter, the Gaffer's
  reasoning, and the three decision actions. Transfers additionally offer `CHANGE ⇄` on either side,
  opening the candidate picker.
- **Chips** — a season plan, not a weekly call: chip discs (blue poker chips with a segmented edge;
  spent ones flat grey) and a scrolling plan panel.
- **Category cleared** (`Category cleared`) — the state a tab reaches when every call in it is
  decided, pointing at whichever category still has work.

### 6. Chip proposal (`Chip proposal`)
A full fifteen-player proposal for Wildcard or Free Hit: verdict banner (e.g. `HOLD · GW9`), the
reasoning, headline stats, and the fifteen players grouped by position with a per-player note and an
in/out marker. The fifteen-player list scrolls. Alternatives can be swapped per slot.

### 7–11. Unhappy paths
- **Squad problem** (`Squad problem`) — a scenario that cannot be entered, e.g. four players from
  one club. Red-flag explainer plus the offending names.
- **Upload failed** (`Upload failed`) — the photo route could not be read.
- **Run failed** (`Run failed`) — the model run did not complete.
- **FPL unreachable** (`FPL unreachable`) — the upstream API is down before the deadline, with the
  risk stated plainly (late team news will not reach the user).

## Interactions & behaviour

- **Decision per call, not per category.** Three states: **Pending review**, **Selected**,
  **Rejected**. Swipe right to select, left to reject, up for later. Selected reads
  `SELECTED · LOCKED`. There is no separate remove action — rejecting *is* removing.
- **Rejected cards stay visible** at 55% opacity. Nothing disappears silently.
- **Filters** — `All` / `Forced only` / `Forced + rec.` / `Selected`. The first three are *the advice
  as given* and are **not** altered by the user's decisions; `Selected` is the user's plan. Filtered
  groups show an `N CALLS HIDDEN BY FILTER` line with a clear-filter affordance.
- **Refresh** is always confirmed by a scoped interstitial (all / transfers / subs / captain) and
  reports a diff afterwards. On refresh: **Selected** survives as a constraint, **Rejected** stays
  suppressed unless the reason materially changed, **Pending** is regenerated, and **Forced** always
  returns. A rejected call resurfaces only when its reason has genuinely changed.
- **Stale-data alert** — the header carries `LAST RUN hh:mm · N PLAYERS FLAGGED SINCE` and a
  dropdown listing each flagged player with a plain-language note.
- Card stepping, tab switching and picker selection all preserve the user's decisions.

## Model rules

Carry these over exactly. They are the product.

**Conviction does not use hue.** One green at four weights, from a single ramp function that feeds
every figure, chip, border, filter and tally:

| Band | Range | Treatment |
| --- | --- | --- |
| Certain | ≥ 90% | `#0A6E3D` |
| Strong | 80–90% | `#10985A` |
| Lean | 60–80% | white fill, `#86BE9F` border |
| Thin | < 60% | warm grey `#7A756B` |

**Forced is a property of the call, never a conviction threshold.** A forced call means the
incumbent cannot play, so the call has to happen — it can carry low conviction, and a 95%-conviction
call is *not* forced unless the incumbent is actually unavailable. Red means forced or expiring;
amber (`WATCH`) means time-sensitive. **A call carries at most one flag, and FORCED outranks WATCH.**
Neither flag is ever derived from conviction.

How forcedness is derived in the prototype (`forcedFor(id)`):
- **Substitutions** derive it from the week being shown: the incumbent is at 0% availability **or**
  has no fixture at all. A starter with no fixture is unplayable, so a blank gameweek turns the same
  call forced with no data edited.
- **Captaincy** is narrower on purpose: forced when, and only when, the current captain is ruled out
  (availability rating 0). A blanking captain is *not* availability 0, so in a blank week the armband
  is an ordinary call. (This asymmetry is deliberate and specified; it is raised separately as
  STE-77.)
- **Transfers** use a declared flag rather than a derivation: a player with one blank week can simply
  be benched, so a sale is only forced when he is out long enough that carrying him is not a real
  option.

**One computation produces net xPts, conviction and cost.** Overview headlines and detail cards must
never disagree, and no figure on a card may be authored copy — the sample data proves this by
deriving even the "puts £X back in the bank" sentence from the same cost value the COST cell shows.

**Points hits.** One free transfer per week. Every proposed transfer beyond the allowance is a
−4 hit, and **the hit comes off the net of the call that incurs it**, not off a plan-level total, so
conviction moves with it. Forced calls take the free transfer first — they have to happen, so the
optional upgrades are what actually cost points. The free-transfer chip turns red and states the
deduction in plain terms (`FT 2/1 · −4 PTS`), and the plan note spells it out in a sentence.

**Chips** are a season plan on their own screen, never a weekly swipeable call.

## State management

The prototype keeps everything in one component's state. A real implementation needs roughly:

- **Session** — `panel` (what-he-does / login), `email`, `codeSent`, `code`, `busy`, `err`,
  `linked` (has an FPL team ever been linked), `linkStage`, `linkId`, `linkTeam`, `linkErr`.
- **Run** — `lastRun`, `stale`, `step` (pipeline stage), `refreshed` (per scope), `outcome`/`diff`
  (the post-refresh report).
- **Squad** — the fifteen with availability, form, xPts, fixtures, price, ownership and transfer
  flow; plus `mode` (pitch/stat).
- **Calls** — a keyed set (`T0…`, `S0…`, `C0`, `V0`) each with out/in, gross and net xPts, cost,
  hit, conviction, flag and reasoning. `verdicts` maps call id → `kept` / `rejected` / `later`.
- **Navigation** — `tab`, `pick` (which call per tab), `pinned`, `editing`, `squadFilter`,
  `picker` / `outPick` / `inPick` for candidate selection.
- **Chips** — `proposalToken` (Wildcard / Free Hit), per-slot swaps and locks.

Data needs: the FPL public API for entry (team) lookup, squad, fixtures, prices and availability
flags; the model output for xPts, conviction and reasoning. Availability and press-conference flags
drive both the badges and the forced derivation, so they must arrive per player, per gameweek.

## Design tokens

**Colours**

| Token | Value |
| --- | --- |
| Screen background | `#FAF8F3` |
| Card / surface | `#FFFFFF` |
| Warm surface (strips, wells) | `#F7F4EE`, `#F3F0E9`, `#EDEAE1`, `#EFEBE3` |
| Border, light | `#DFDACE`, `#E9E4DA`, `#E4E0D8` |
| Border, strong | `#CFC7B6`, `#D5CFC2`, `#C6BFB0` |
| Ink | `#23211D`, `#3A3630`, `#46433D`, `#4A453D` |
| Muted | `#6A655C`, `#847F74`, `#918C83`, `#7A756B` |
| Green (primary) | `#10985A`; dark `#0A6E3D`; text-on-light `#0E8A4E`; tint border `#86BE9F`, `#BFDCCB`, `#C9E0D3` |
| Red | `#E03A4E`, `#D33A4E`; border `#C2303F`; card `#FDF3F4` on `#F0D3D7`; text `#A32C3C` |
| Amber | `#C2820F`, `#B4791A`; chip `rgba(194,130,15,.14)` on `rgba(194,130,15,.38)`, text `#8A6A28` |
| Alternating table row | `#EBF4EE` |
| Fixture difficulty 1→5 | `#0E8A4E`, `#2FA96A`, `#E0A924`, `#E0604E`, `#E03A4E` |

**Typography** — Manrope for text, JetBrains Mono for all figures and caps labels, Lobster Two bold
italic for the wordmark only.

| Role | Spec |
| --- | --- |
| Wordmark | Lobster Two, 700 italic, 27px on headers / 96px-avatar scale on Landing, `#0A6E3D` |
| Screen title | 18px / 800 |
| Card title | 13–14px / 800 |
| Body | 11–12px / 400, line-height 1.45 |
| Caps label | mono 8px / 700, letter-spacing `.14em` |
| Figure | mono 11–12px / 700 |
| Large figure (conviction) | mono 14px / 700 |
| Smallest permitted text | 9px |

Labels always precede values (`xPTS +8.1`), and figure columns share the 8px caps + mono value
pattern.

**Radii** — phone shell 34px; cards 14px; panels and wells 10–12px; buttons 9px; chips and badges
4–6px; pills 20px.

**Shadows** — phone shell `0 30px 80px rgba(92,82,62,.16)`; raised card `0 6px 18px
rgba(92,82,62,.12)`; dropdown `0 10px 24px rgba(92,82,62,.22)`; bottom sheet `0 -10px 40px
rgba(35,33,29,.28)`; avatar glow `0 10px 26px rgba(10,110,61,.22)`.

**Spacing** — 16px screen gutter (22px on Landing and status rows); 8–12px between siblings in a
column; 6–10px inside dense rows. Sibling groups are laid out with flex/grid and `gap`.

## Assets

- `assets/gaffer-avatar.png` — face crop, used in the circular header and Landing avatar.
- `assets/gaffer-full.png` — head-to-toe cutout, used beside reasoning blocks.

Both are project-owned illustrations of the Gaffer persona. There are no player photographs and none
should be introduced — player identity is always a kit colour, a shirt number and a club code.

## Files in this bundle

| Path | Notes |
| --- | --- |
| `FPL Advisor Prototype.dc.html` | Behaviour reference. Open in a browser; the panel on the left jumps to any screen and forces any scenario (normal / blank / double gameweek, error paths). |
| `FPL Advisor Design System.dc.html` | Visual reference: palette, type table, controls, widgets, states. |
| `support.js` | Runtime needed to open the two HTML files. Not part of the design. |
| `assets/` | The two Gaffer images. |

The prototype's left-hand panel is a demo harness, not part of the product. Use it to reach states
that are otherwise several steps in: first-login vs returning login, blank and double gameweeks,
forced-only filtering, post-refresh diffs, and each failure screen.
