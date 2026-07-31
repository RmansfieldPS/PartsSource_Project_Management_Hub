-- ============================================================
-- PMPM Tier 1 upgrade — run once in Supabase SQL Editor.
-- Adds: real task dependencies, completion timestamps, notifications.
-- Safe to re-run.
-- ============================================================

-- Real task-to-task dependency (auto-unblock) + completion tracking
alter table tasks add column if not exists blocked_by_task uuid references tasks(id) on delete set null;
alter table tasks add column if not exists completed_at timestamptz;

-- In-app notifications
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  member_id  text references members(id),
  body       text not null,
  project_id text,
  task_id    uuid,
  read       boolean default false,
  created_at timestamptz default now()
);

alter table notifications enable row level security;
drop policy if exists "auth_all" on notifications;
create policy "auth_all" on notifications for all to authenticated using (true) with check (true);

do $$
begin
  execute 'alter publication supabase_realtime add table notifications';
exception when duplicate_object then null;
end $$;
