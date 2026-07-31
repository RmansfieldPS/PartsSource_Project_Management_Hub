-- ============================================================
-- PMPM roles upgrade — Admin vs Base User. Run once in Supabase SQL Editor.
-- Safe to re-run.
--
-- Admin:     sees Team screen, adds users, edits ALL tasks & campaigns.
-- Base user: edits only tasks assigned to them (identified by matching
--            their sign-in email to members.email — set emails in Team!).
--
-- After running this: Ryan (RM) is the only admin. Promote others from
-- the Team screen in the app.
-- ============================================================

-- ---------- Role column ----------
alter table members add column if not exists app_role text default 'user';
update members set app_role = 'user' where app_role is null;
alter table members drop constraint if exists members_app_role_check;
alter table members add constraint members_app_role_check check (app_role in ('admin','user'));
update members set app_role = 'admin' where id = 'RM';

-- ---------- Identity helpers ----------
-- Map the signed-in auth user to a members row via email.
-- SECURITY DEFINER so these can be used inside policies without recursion.
create or replace function current_member_id() returns text
language sql stable security definer set search_path = public as
$$ select id from members
   where email is not null
     and lower(email) = lower(coalesce(auth.jwt()->>'email',''))
   limit 1 $$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists(
     select 1 from members
     where email is not null
       and lower(email) = lower(coalesce(auth.jwt()->>'email',''))
       and app_role = 'admin') $$;

-- Can the current user edit this task? (admin, or it's assigned to them)
create or replace function can_edit_task(tid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select is_admin() or exists(
     select 1 from tasks where id = tid and assignee_id = current_member_id()) $$;

-- Is the upstream task (that blocks this one) assigned to me?
-- Lets a base user's "complete my task" auto-unblock dependents owned by others.
create or replace function is_upstream_mine(up_id uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(
     select 1 from tasks where id = up_id and assignee_id = current_member_id()) $$;

-- ---------- Replace permissive policies with role-aware ones ----------
-- members: everyone reads; only admins write.
-- (Bootstrap: inserts are also allowed while no admin exists yet, so the
--  first-run seed import works on a fresh database.)
drop policy if exists "auth_all" on members;
drop policy if exists mem_sel on members; drop policy if exists mem_ins on members;
drop policy if exists mem_upd on members; drop policy if exists mem_del on members;
create policy mem_sel on members for select to authenticated using (true);
create policy mem_ins on members for insert to authenticated
  with check (is_admin() or not exists(select 1 from members where app_role='admin'));
create policy mem_upd on members for update to authenticated using (is_admin()) with check (is_admin());
create policy mem_del on members for delete to authenticated using (is_admin());

-- projects (campaigns): everyone reads; only admins write.
drop policy if exists "auth_all" on projects;
drop policy if exists prj_sel on projects; drop policy if exists prj_ins on projects;
drop policy if exists prj_upd on projects; drop policy if exists prj_del on projects;
create policy prj_sel on projects for select to authenticated using (true);
create policy prj_ins on projects for insert to authenticated with check (is_admin());
create policy prj_upd on projects for update to authenticated using (is_admin()) with check (is_admin());
create policy prj_del on projects for delete to authenticated using (is_admin());

-- tasks: everyone reads; admins edit all; base users edit their own,
-- may create tasks assigned to themselves, and may unblock a task whose
-- upstream dependency was theirs (the auto-unblock path).
drop policy if exists "auth_all" on tasks;
drop policy if exists tsk_sel on tasks; drop policy if exists tsk_ins on tasks;
drop policy if exists tsk_upd on tasks; drop policy if exists tsk_del on tasks;
create policy tsk_sel on tasks for select to authenticated using (true);
create policy tsk_ins on tasks for insert to authenticated
  with check (is_admin() or assignee_id = current_member_id());
create policy tsk_upd on tasks for update to authenticated
  using (is_admin() or assignee_id = current_member_id() or is_upstream_mine(blocked_by_task))
  with check (true);
create policy tsk_del on tasks for delete to authenticated using (is_admin());

-- subtasks & attachments: follow the parent task's edit rights.
drop policy if exists "auth_all" on subtasks;
drop policy if exists sub_sel on subtasks; drop policy if exists sub_wr on subtasks;
create policy sub_sel on subtasks for select to authenticated using (true);
create policy sub_wr on subtasks for all to authenticated
  using (can_edit_task(task_id)) with check (can_edit_task(task_id));

drop policy if exists "auth_all" on attachments;
drop policy if exists att_sel on attachments; drop policy if exists att_wr on attachments;
create policy att_sel on attachments for select to authenticated using (true);
create policy att_wr on attachments for all to authenticated
  using (can_edit_task(task_id)) with check (can_edit_task(task_id));

-- comments: anyone signed in can read & post (collaboration); admins can delete.
drop policy if exists "auth_all" on comments;
drop policy if exists com_sel on comments; drop policy if exists com_ins on comments;
drop policy if exists com_del on comments;
create policy com_sel on comments for select to authenticated using (true);
create policy com_ins on comments for insert to authenticated with check (true);
create policy com_del on comments for delete to authenticated using (is_admin());

-- notifications: open to signed-in users (any user's action may notify another).
drop policy if exists "auth_all" on notifications;
drop policy if exists ntf_sel on notifications; drop policy if exists ntf_ins on notifications;
drop policy if exists ntf_upd on notifications; drop policy if exists ntf_del on notifications;
create policy ntf_sel on notifications for select to authenticated using (true);
create policy ntf_ins on notifications for insert to authenticated with check (true);
create policy ntf_upd on notifications for update to authenticated using (true) with check (true);
create policy ntf_del on notifications for delete to authenticated using (is_admin());

-- realtime for member/role changes
do $$
begin
  execute 'alter publication supabase_realtime add table members';
exception when duplicate_object then null;
end $$;
