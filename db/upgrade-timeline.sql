-- ============================================================
-- PMPM timeline upgrade — run once in Supabase SQL Editor.
-- Adds a real launch date to campaigns (shown as a flag on the
-- timeline; set via the campaign form or template creation).
-- Safe to re-run.
-- ============================================================

alter table projects add column if not exists launch_date date;
