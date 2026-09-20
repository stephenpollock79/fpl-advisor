#!/usr/bin/env node
/**
 * `supabase db push`, with the target named out loud.
 *
 * **Written after an evening lost to it** (2026-09-20). A migration was pushed,
 * `supabase migration list` confirmed it applied, and the live app went on
 * rejecting the thing the migration allowed. Both commands were telling the
 * truth about the wrong database: the CLI was linked to **dev**, and neither
 * command says which project it is talking to unless you go and look.
 *
 * The failure is quiet by construction. `db push` follows the link, `migration
 * list` follows the same link, so the two agree with each other — and agreement
 * between two readings of the same wrong thing is exactly what confidence feels
 * like.
 *
 *   node scripts/db-push.mjs --project=prod
 *   node scripts/db-push.mjs --project=dev --dry-run
 *
 * **Invoked as `node`, not through the package manager.** There are npm scripts
 * for it, but bare `pnpm` is not on the PATH on this machine — a help message
 * printing a command that does not run is the small version of the fault this
 * whole script exists to stop.
 *
 * **There is no default.** `live-rls-check.mjs` defaults to dev, and that is
 * right there — running it is a read plus two throwaway accounts, and the worst
 * a default can do is check the wrong database. A migration is neither cheap nor
 * reversible, so leaving the target unset is refused rather than guessed.
 *
 * It does not link anything itself. Linking can ask for the database password,
 * and a script that carries a credential between two places is a worse problem
 * than the one this solves.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { PROJECTS, linkedRef, nameOfRef } from './projects.mjs'

const die = (...lines) => {
  console.error(`\n${lines.join('\n')}\n`)
  process.exit(1)
}

const flag = process.argv.find((a) => a.startsWith('--project='))
const target = flag?.split('=')[1]

if (!target) {
  die(
    'Refusing to push: no --project given.',
    '',
    'Name the database. There is no default, because a migration is not',
    'something to apply to whichever project the CLI happens to be linked to.',
    '',
    '  node scripts/db-push.mjs --project=dev',
    '  node scripts/db-push.mjs --project=prod',
  )
}

if (!(target in PROJECTS)) {
  die(`Unknown --project=${target}. Known: ${Object.keys(PROJECTS).join(', ')}.`)
}

const want = PROJECTS[target]
const linked = linkedRef(readFileSync)

if (linked === null) {
  die(
    `Refusing to push: the Supabase CLI is not linked to anything.`,
    '',
    `Link it to ${target} first — it may ask for the database password, which is`,
    'yours to type and is never handled here:',
    '',
    `  supabase link --project-ref ${want}`,
  )
}

if (linked !== want) {
  const actually = nameOfRef(linked)
  die(
    `Refusing to push to ${target}: the CLI is linked to ${actually ?? 'an unknown project'} (${linked}).`,
    '',
    'This is the check that exists because of 2026-09-20. The push would have',
    `gone to ${actually ?? 'that project'}, and "supabase migration list" would then`,
    'have confirmed it applied — to the same wrong place.',
    '',
    `Link to ${target} and run this again:`,
    '',
    `  supabase link --project-ref ${want}`,
  )
}

// Everything after the flag goes through untouched, so --dry-run still works.
const passthrough = process.argv.slice(2).filter((a) => a !== flag)

console.warn(`\nPushing migrations to ${target.toUpperCase()} (${want})${passthrough.length ? ` ${passthrough.join(' ')}` : ''}\n`)

const result = spawnSync('supabase', ['db', 'push', ...passthrough], { stdio: 'inherit' })
process.exit(result.status ?? 1)
