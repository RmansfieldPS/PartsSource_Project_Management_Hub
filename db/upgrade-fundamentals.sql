-- ============================================================
-- PMPM fundamentals upgrade — run once in Supabase SQL Editor.
-- Adds: campaign archiving, and delete rights for base users on
-- their own tasks and their own comments. Safe to re-run.
-- Requires upgrade-roles.sql first.
-- ============================================================

alter table projects add column if not exists archived boolean default false;

-- base users may delete tasks assigned to them (admins: any task)
drop policy if exists tsk_del on tasks;
create policy tsk_del on tasks for delete to authenticated
  using (is_admin() or assignee_id = current_member_id());

-- anyone may delete their own comments (admins: any comment)
drop policy if exists com_del on comments;
create policy com_del on comments for delete to authenticated
  using (is_admin() or author_id = current_member_id());
