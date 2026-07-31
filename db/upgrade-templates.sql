-- ============================================================
-- PMPM templates upgrade — run once in Supabase SQL Editor.
-- Adds the campaign templates library. Safe to re-run.
-- Requires upgrade-roles.sql (is_admin) to have run first.
-- ============================================================

create table if not exists templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  defaults    jsonb default '{}'::jsonb,   -- {motion, segment, solution, pipeline}
  steps       jsonb default '[]'::jsonb,   -- [{t, role, off, pr, sub:[], dep}]
  created_by  text references members(id),
  created_at  timestamptz default now()
);

alter table templates enable row level security;
drop policy if exists tpl_sel on templates;
drop policy if exists tpl_ins on templates;
drop policy if exists tpl_upd on templates;
drop policy if exists tpl_del on templates;
create policy tpl_sel on templates for select to authenticated using (true);
create policy tpl_ins on templates for insert to authenticated with check (is_admin());
create policy tpl_upd on templates for update to authenticated using (is_admin()) with check (is_admin());
create policy tpl_del on templates for delete to authenticated using (is_admin());

do $$
begin
  execute 'alter publication supabase_realtime add table templates';
exception when duplicate_object then null;
end $$;
