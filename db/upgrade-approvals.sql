-- ============================================================
-- PMPM approvals upgrade — run once in Supabase SQL Editor.
-- Campaign-level approval workflow. Safe to re-run.
-- Requires upgrade-roles.sql (current_member_id / is_admin) first.
--
-- Model: members.is_approver flags who may approve; projects.approver_id
-- designates the approver per campaign (null = no approval required —
-- existing campaigns are grandfathered). Decisions are an append-only
-- event log (approvals), so there's a full audit trail and the state
-- can't be forged by editing a status field.
-- ============================================================

alter table members  add column if not exists is_approver boolean default false;
alter table projects add column if not exists approver_id text references members(id);

create table if not exists approvals (
  id         uuid primary key default gen_random_uuid(),
  project_id text references projects(id) on delete cascade,
  actor_id   text references members(id),
  action     text not null check (action in ('submitted','approved','changes')),
  note       text,
  created_at timestamptz default now()
);

alter table approvals enable row level security;
drop policy if exists apr_sel on approvals;
drop policy if exists apr_ins on approvals;
drop policy if exists apr_del on approvals;
create policy apr_sel on approvals for select to authenticated using (true);
-- submit/resubmit: admins. approve / request changes: that campaign's
-- designated approver, or an admin. Actor must be yourself.
create policy apr_ins on approvals for insert to authenticated
  with check (
    actor_id = current_member_id()
    and (
      (action = 'submitted' and is_admin())
      or (action in ('approved','changes') and (
            is_admin()
            or exists (select 1 from projects p
                       where p.id = project_id
                         and p.approver_id = current_member_id())))
    )
  );
create policy apr_del on approvals for delete to authenticated using (is_admin());

-- Gate: a campaign with a designated approver cannot be Active unless
-- its latest approval event is 'approved'.
create or replace function pmpm_enforce_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare last_action text;
begin
  if new.status = 'active' and new.approver_id is not null then
    select action into last_action
    from approvals where project_id = new.id
    order by created_at desc limit 1;
    if coalesce(last_action,'none') <> 'approved' then
      raise exception 'This campaign needs approval before it can be set to Active';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_enforce_approval on projects;
create trigger trg_enforce_approval
before insert or update of status, approver_id on projects
for each row execute function pmpm_enforce_approval();

do $$
begin
  execute 'alter publication supabase_realtime add table approvals';
exception when duplicate_object then null;
end $$;
