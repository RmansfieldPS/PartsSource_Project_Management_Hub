-- ============================================================
-- PMPM files upgrade — run once in Supabase SQL Editor (AFTER upgrade-roles.sql).
-- Adds: file attachments on campaigns AND tasks (Supabase Storage),
--       uploader tracking, and the storage bucket + access rules.
-- Safe to re-run.
--
-- NOTE: if the storage.* statements at the bottom fail with a
-- "must be owner of table objects" error, create the bucket and its
-- policies in the dashboard instead (steps in README / chat).
-- ============================================================

-- ---------- attachments now attach to a task OR a campaign ----------
alter table attachments add column if not exists project_id text references projects(id) on delete cascade;
alter table attachments add column if not exists path text;          -- storage path (uploaded files)
alter table attachments add column if not exists uploaded_by text references members(id);

-- ---------- role-aware attachment policies ----------
drop policy if exists "auth_all" on attachments;
drop policy if exists att_wr  on attachments;
drop policy if exists att_sel on attachments;
drop policy if exists att_ins on attachments;
drop policy if exists att_upd on attachments;
drop policy if exists att_del on attachments;
create policy att_sel on attachments for select to authenticated using (true);
-- task files: assignee or admin; campaign files: any signed-in teammate
create policy att_ins on attachments for insert to authenticated
  with check ( (task_id is not null and can_edit_task(task_id))
            or (task_id is null and project_id is not null) );
create policy att_upd on attachments for update to authenticated
  using (is_admin()) with check (is_admin());
-- delete: admin, the uploader, or (for task files) whoever can edit the task
create policy att_del on attachments for delete to authenticated
  using ( is_admin()
       or uploaded_by = current_member_id()
       or (task_id is not null and can_edit_task(task_id)) );

-- realtime so attachment changes sync across the team
do $$
begin
  execute 'alter publication supabase_realtime add table attachments';
exception when duplicate_object then null;
end $$;

-- ---------- storage: private bucket for uploaded files ----------
insert into storage.buckets (id, name, public)
values ('pmpm-files','pmpm-files', false)
on conflict (id) do nothing;

drop policy if exists pmpm_files_sel on storage.objects;
drop policy if exists pmpm_files_ins on storage.objects;
drop policy if exists pmpm_files_del on storage.objects;
create policy pmpm_files_sel on storage.objects for select to authenticated
  using (bucket_id = 'pmpm-files');
create policy pmpm_files_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'pmpm-files');
create policy pmpm_files_del on storage.objects for delete to authenticated
  using (bucket_id = 'pmpm-files');
