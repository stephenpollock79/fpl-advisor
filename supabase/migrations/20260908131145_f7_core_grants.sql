-- Grants for the F7-core tables.
--
-- Found by applying the previous migration to fpl-advisor-dev and then asking the
-- Data API for a row: **every role was denied, service_role included.** Postgres
-- checks grants before policies, so row-level security on a table nothing has
-- been granted is security that never runs — and a test suite that only exercises
-- policies reports it as working.
--
-- The cause is a project setting, not a mistake in the migration: STE-29 switched
-- "Automatically expose new tables" OFF, so Supabase's default privileges do not
-- reach a new table. Grants are therefore ours to state, per table, deliberately
-- — the same rule STE-29 already recorded for reference-table select policies,
-- one layer down.
--
-- Separate migration rather than an edit to the one before it: that one is
-- already applied to dev, and migrations here are additive (ADR 0004). The pair
-- reads as what happened.

-- ---------------------------------------------------------------------------
-- manager — reachable only as the signed-in user.
-- ---------------------------------------------------------------------------
-- No DELETE: there is no delete policy either, and removing someone is deleting
-- their account at the provider (F7-UP-05), which cascades.
grant select, insert, update on public.manager to authenticated;

-- Nothing to anon. A signed-out visitor has no business here, and denying by
-- grant as well as by policy means neither is the single point of failure.
revoke all on public.manager from anon;

-- **Nothing to service_role, deliberately, and this is the important line.**
--
-- ADR 0007 says user data is read with the signed-in user's token and never the
-- service key, because service_role carries BYPASSRLS and would see every row.
-- Until now that was a naming convention in supabase.ts. Withholding the grant
-- makes it a property of the database: the service key cannot read `manager` at
-- all, so the rule cannot be broken by a careless import.
--
-- If a future slice genuinely needs service-key access to a user table, that is a
-- decision to take deliberately and record — not a grant to add because something
-- returned 403.
revoke all on public.manager from service_role;

-- ---------------------------------------------------------------------------
-- app_session — the server's own table, and only the server's.
-- ---------------------------------------------------------------------------
grant select, insert, update on public.app_session to service_role;
revoke all on public.app_session from anon, authenticated;
