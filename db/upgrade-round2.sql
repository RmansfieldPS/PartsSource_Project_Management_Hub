-- ============================================================
-- PMPM round-2 upgrade — run once in Supabase SQL Editor.
-- Adds: recurring tasks + comment editing. Safe to re-run.
-- Requires upgrade-roles.sql first.
-- ============================================================

-- recurring tasks: completing one auto-creates the next occurrence
alter table tasks add column if not exists recur text;
alter table tasks drop constraint if exists tasks_recur_check;
alter table tasks add constraint tasks_recur_check
  check (recur is null or recur in ('weekly','biweekly','monthly'));

-- comment editing (own comments; admins any)
alter table comments add column if not exists updated_at timestamptz;
drop policy if exists com_upd on comments;
create policy com_upd on comments for update to authenticated
  using (is_admin() or author_id = current_member_id())
  with check (is_admin() or author_id = current_member_id());
