/**
 * Club kit colours.
 *
 * Neither feed carries them. FPL's `teams` payload has a `code` that maps to
 * shirt images on their CDN, and the design calls for a drawn kit rather than a
 * photograph — **player markers are kit/number icons, never photos** (handoff,
 * *Hard constraints* 4). So the colours live here, keyed by the three-letter code
 * the feed does supply.
 *
 * Presentation only. Nothing downstream reads a colour, and a club missing from
 * this map renders in the neutral fallback rather than failing — a promoted club
 * next season should look plain, not break the pitch.
 *
 * **The second colour is the sleeve, and for a club that plays in one colour it
 * is a darker shade of the first rather than a contrast.** The first pass gave
 * Manchester United black sleeves purely so the shirt would read as a shirt,
 * which is a drawing convenience standing in for a fact. A shade keeps the seam
 * visible without asserting a colour the club does not wear.
 */

export type Kit = { primary: string; secondary: string; ink: string }

const NEUTRAL: Kit = { primary: '#e9e4da', secondary: '#cfc7b6', ink: '#3a3630' }

const KITS: Record<string, Kit> = {
  ARS: { primary: '#ef0107', secondary: '#ffffff', ink: '#ffffff' },
  AVL: { primary: '#670e36', secondary: '#95bfe5', ink: '#95bfe5' },
  BOU: { primary: '#da291c', secondary: '#000000', ink: '#ffffff' },
  BRE: { primary: '#e30613', secondary: '#ffffff', ink: '#ffffff' },
  BHA: { primary: '#0057b8', secondary: '#ffffff', ink: '#ffffff' },
  BUR: { primary: '#6c1d45', secondary: '#99d6ea', ink: '#ffffff' },
  CHE: { primary: '#034694', secondary: '#022f66', ink: '#ffffff' },
  CRY: { primary: '#1b458f', secondary: '#c4122e', ink: '#ffffff' },
  EVE: { primary: '#003399', secondary: '#00246b', ink: '#ffffff' },
  FUL: { primary: '#ffffff', secondary: '#000000', ink: '#23211d' },
  IPS: { primary: '#3a64a3', secondary: '#2b4c7d', ink: '#ffffff' },
  LEE: { primary: '#ffffff', secondary: '#1d428a', ink: '#1d428a' },
  LEI: { primary: '#003090', secondary: '#002166', ink: '#ffffff' },
  LIV: { primary: '#c8102e', secondary: '#a30d25', ink: '#ffffff' },
  MCI: { primary: '#6cabdd', secondary: '#ffffff', ink: '#ffffff' },
  MUN: { primary: '#da291c', secondary: '#b3170c', ink: '#ffffff' },
  NEW: { primary: '#241f20', secondary: '#ffffff', ink: '#ffffff' },
  NFO: { primary: '#dd0000', secondary: '#b80000', ink: '#ffffff' },
  SUN: { primary: '#eb172b', secondary: '#ffffff', ink: '#ffffff' },
  TOT: { primary: '#ffffff', secondary: '#132257', ink: '#132257' },
  WHU: { primary: '#7a263a', secondary: '#1bb1e7', ink: '#ffffff' },
  WOL: { primary: '#fdb913', secondary: '#231f20', ink: '#231f20' },
  SOU: { primary: '#d71920', secondary: '#b31419', ink: '#ffffff' },
}

export function kitFor(shortName: string): Kit {
  return KITS[shortName.toUpperCase()] ?? NEUTRAL
}
