-- ============================================================
-- Always On — Technical Projects with Milestones
-- Run once in Supabase SQL Editor. Safe to re-run.
-- Requires upgrade-roles.sql (is_admin) to have run first.
--
-- Technical projects are a second KIND of project, sharing the same
-- tasks/subtasks/comments/attachments engine as campaigns. The difference
-- is their fields, and that their tasks are grouped under milestones.
-- ============================================================

-- ---------- projects gains a kind + technical-only fields ----------
alter table projects add column if not exists kind text not null default 'campaign';
alter table projects drop constraint if exists projects_kind_check;
alter table projects add constraint projects_kind_check check (kind in ('campaign','technical'));

alter table projects add column if not exists platform     text;   -- Marketo, WordPress, Salesforce...
alter table projects add column if not exists work_type    text;   -- Integration, Migration, Build...
alter table projects add column if not exists requested_by text;
alter table projects add column if not exists priority     text;
alter table projects drop constraint if exists projects_priority_check;
alter table projects add constraint projects_priority_check
  check (priority is null or priority in ('high','med','low'));
alter table projects add column if not exists target_date  date;
-- campaigns this technical project unblocks: ["mktplace","crosssell"]
alter table projects add column if not exists unblocks jsonb default '[]'::jsonb;

-- ---------- milestones ----------
create table if not exists milestones (
  id         uuid primary key default gen_random_uuid(),
  project_id text references projects(id) on delete cascade,
  name       text not null,
  due        date,
  position   int default 0,
  created_at timestamptz default now()
);

alter table tasks add column if not exists milestone_id uuid references milestones(id) on delete set null;

-- ---------- RLS: everyone reads, admins write (same rule as campaigns) ----------
alter table milestones enable row level security;
drop policy if exists ms_sel on milestones;
drop policy if exists ms_ins on milestones;
drop policy if exists ms_upd on milestones;
drop policy if exists ms_del on milestones;
create policy ms_sel on milestones for select to authenticated using (true);
create policy ms_ins on milestones for insert to authenticated with check (is_admin());
create policy ms_upd on milestones for update to authenticated using (is_admin()) with check (is_admin());
create policy ms_del on milestones for delete to authenticated using (is_admin());

do $$
begin
  execute 'alter publication supabase_realtime add table milestones';
exception when duplicate_object then null;
end $$;
