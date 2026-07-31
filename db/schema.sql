-- ============================================================
-- PMPM — PartsSource Marketing Project Management
-- Supabase schema. Run once in: Supabase -> SQL Editor -> New query -> Run.
-- Safe to re-run.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Tables ----------
create table if not exists members (
  id       text primary key,         -- initials, e.g. 'RM'
  name     text not null,
  role     text,                     -- job title, e.g. 'Lifecycle Manager'
  color    text,
  email    text,                     -- must match their sign-in email
  app_role text default 'user' check (app_role in ('admin','user')),
  sort     int default 0
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
  launch      text,          -- display label, e.g. 'Q2 · Phase 1 live'
  launch_date date,          -- real date; timeline flag + template due-date anchor
  status      text not null default 'active' check (status in ('active','planning','review','complete')),
  owner_id    text references members(id),
  blocker     text,
  sort        int default 0,
  created_at  timestamptz default now()
);

create table if not exists tasks (
  id              uuid primary key default gen_random_uuid(),
  project_id      text references projects(id) on delete cascade,
  title           text not null,
  assignee_id     text references members(id),
  due             date,
  priority        text default 'med' check (priority in ('high','med','low')),
  status          text default 'todo' check (status in ('todo','progress','blocked','review','done')),
  blocked_by      text,                                          -- external blocker (free text)
  blocked_by_task uuid references tasks(id) on delete set null,  -- real dependency (auto-unblock)
  blocks          text,
  description     text,
  completed_at    timestamptz,
  position        int default 0,
  created_at      timestamptz default now()
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
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references tasks(id) on delete cascade,     -- set for task files
  project_id  text references projects(id) on delete cascade,  -- set for campaign files
  label       text,
  sublabel    text,
  url         text,   -- external link (e.g. SharePoint)
  path        text,   -- storage path in the 'pmpm-files' bucket (uploads)
  uploaded_by text references members(id)
);

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  member_id  text references members(id),
  body       text not null,
  project_id text,
  task_id    uuid,
  read       boolean default false,
  created_at timestamptz default now()
);

create table if not exists templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  defaults    jsonb default '{}'::jsonb,   -- {motion, segment, solution, pipeline}
  steps       jsonb default '[]'::jsonb,   -- [{t, role, off, pr, sub:[], dep}]
  created_by  text references members(id),
  created_at  timestamptz default now()
);

-- ---------- Row Level Security ----------
-- Roles: 'admin' edits everything and manages users; 'user' edits only
-- tasks assigned to them. Identity = sign-in email matched to members.email.
-- Full role policies live in db/upgrade-roles.sql — run it right after this
-- file on a fresh install:
alter table members       enable row level security;
alter table projects      enable row level security;
alter table tasks         enable row level security;
alter table subtasks      enable row level security;
alter table comments      enable row level security;
alter table attachments   enable row level security;
alter table notifications enable row level security;
alter table templates     enable row level security;
-- (upgrade-roles.sql / upgrade-files.sql / upgrade-templates.sql create the
--  helper functions and per-table policies.)

-- ---------- Realtime ----------
-- Push live changes to every connected client.
do $$
declare t text;
begin
  foreach t in array array['projects','tasks','subtasks','comments','notifications'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
