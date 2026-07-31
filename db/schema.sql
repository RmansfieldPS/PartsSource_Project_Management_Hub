-- ============================================================
-- PMPM — PartsSource Marketing Project Management
-- Supabase schema. Run once in: Supabase -> SQL Editor -> New query -> Run.
-- Safe to re-run.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Tables ----------
create table if not exists members (
  id     text primary key,           -- initials, e.g. 'RM'
  name   text not null,
  role   text,
  color  text,
  email  text,
  sort   int default 0
);

create table if not exists projects (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  description text,
  segment     text,
  motion      text check (motion in ('recruit','grow','retain')),
  solution    text,
  pipeline    text,
  value       text,
  audience    text,
  launch      text,
  status      text not null default 'active' check (status in ('active','planning','review','complete')),
  owner_id    text references members(id),
  blocker     text,
  sort        int default 0,
  created_at  timestamptz default now()
);

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  text references projects(id) on delete cascade,
  title       text not null,
  assignee_id text references members(id),
  due         date,
  priority    text default 'med' check (priority in ('high','med','low')),
  status      text default 'todo' check (status in ('todo','progress','blocked','review','done')),
  blocked_by  text,
  blocks      text,
  description text,
  position    int default 0,
  created_at  timestamptz default now()
);

create table if not exists subtasks (
  id       uuid primary key default gen_random_uuid(),
  task_id  uuid references tasks(id) on delete cascade,
  title    text not null,
  done     boolean default false,
  position int default 0
);

create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid references tasks(id) on delete cascade,
  author_id  text references members(id),
  body       text not null,
  created_at timestamptz default now()
);

create table if not exists attachments (
  id       uuid primary key default gen_random_uuid(),
  task_id  uuid references tasks(id) on delete cascade,
  label    text,
  sublabel text,
  url      text
);

-- ---------- Row Level Security ----------
-- Internal, trusted team: any signed-in user can read & write.
-- Anonymous (not signed in) users get nothing.
alter table members     enable row level security;
alter table projects    enable row level security;
alter table tasks       enable row level security;
alter table subtasks    enable row level security;
alter table comments    enable row level security;
alter table attachments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['members','projects','tasks','subtasks','comments','attachments'] loop
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Realtime ----------
-- Push live changes to every connected client.
do $$
declare t text;
begin
  foreach t in array array['projects','tasks','subtasks','comments'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
