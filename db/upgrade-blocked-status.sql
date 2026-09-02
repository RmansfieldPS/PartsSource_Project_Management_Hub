-- ============================================================
-- Always On — add "Blocked" to the campaign status options.
-- Run once in Supabase SQL Editor. Safe to re-run.
--
-- Blocked is treated as a LIVE status in the app (it shows on the
-- dashboard and under the Active tab alongside on-track campaigns),
-- because a stuck campaign is exactly what people need to see.
-- ============================================================

alter table projects drop constraint if exists projects_status_check;
alter table projects add constraint projects_status_check
  check (status in ('active','planning','review','complete','blocked'));
