# CLAUDE.md — PMPM

Context for Claude Code sessions working on this project.

## What this is
**PMPM (PartsSource Marketing Project Management)** — an internal, Asana-style tool for
the PartsSource Demand Gen team. Dashboard, campaigns, per-campaign tasks with
assignment, task detail (subtasks / attachments / activity), Kanban board, My Tasks,
and Roadblocks. Built on the team's real campaign data.

## Architecture (important)
- **Buildless static site.** No Node, no bundler, no framework. Plain HTML/CSS/JS.
  (The dev machine has Git but NOT node/npm — do not introduce a build step without
  discussing it.)
- **Supabase** (Postgres + Auth + Realtime) is the backend, loaded from the jsdelivr
  CDN as a UMD global (`window.supabase`). Because it's static, it deploys to
  **GitHub Pages** by just committing files.
- **Two runtime modes**, chosen automatically in `js/app.js` by `LIVE`:
  - **Demo** — no real keys in `js/config.js`. Data comes from `js/seed-data.js`,
    held in memory, nothing persists, no login. For clicking around.
  - **Live** — real Supabase URL + anon key present. Email/password auth, data in
    Postgres, realtime sync across users.
- `app.js` uses **inline `onclick` handlers**, so all handler functions are global
  (classic script, not a module). Keep it that way, or the HTML breaks.

## Files
| File | Purpose |
|------|---------|
| `index.html` | App shell + all screens + login overlay |
| `css/styles.css` | All styling; light + dark via CSS custom properties + `data-theme` |
| `js/config.js` | Supabase URL + anon key (anon key is public; committed on purpose) |
| `js/seed-data.js` | Real campaigns/team; demo data AND the first-run import source |
| `js/app.js` | All logic: mode detection, load, render, mutate, realtime, auth, seed |
| `db/schema.sql` | Tables, RLS, realtime publication. Run once in Supabase. |

## Data model
`members` → `projects` → `tasks` → (`subtasks`, `comments`, `attachments`).
- Member IDs are initials (e.g. `RM`). Project IDs are slugs (e.g. `depot`) or uuids
  for new ones. Task/subtask/comment/attachment IDs are uuids.
- Campaigns carry: segment, motion (`recruit|grow|retain`), solution, pipeline, value,
  audience, launch, status (`active|planning|review|complete`), owner, blocker.
- Tasks carry: title, assignee, due, priority (`high|med|low`), status
  (`todo|progress|blocked|review|done`), blocked_by, blocks, description.
- My Tasks, Roadblocks, dashboard KPIs, and workload are all **derived** from task data.

## In-memory model shape (what render code expects)
Task objects use short keys: `t` (title), `a` (assignee code), `s` (status),
`pr` (priority), plus `_sub` / `_comments` / `_links` for detail. `loadLive()` maps DB
rows → this shape; `buildFromSeed()` builds the same shape for demo.

## Conventions
- `esc()` all user/DB strings interpolated into HTML.
- Mutations update memory + re-render immediately, then persist (live) via `pUpdate` /
  `pInsert`. Realtime triggers a debounced reload+rerender.
- RLS is intentionally permissive: any authenticated user can read/write (single
  trusted team). Revisit before wider rollout.

## Status / next steps
- **In production:** https://ps-project-management.netlify.app/ (Netlify auto-deploys
  from GitHub `RmansfieldPS/PartsSource_Project_Management_Hub`, branch `main`).
  GitHub Pages is blocked by the corporate firewall — do not move hosting back.
- Live Supabase project is connected and seeded; demo + live paths both verified.
- **Tier 1 shipped (2026-07-31):** campaign create/edit modal; real task dependencies
  (`blocked_by_task` → auto-unblock + comment + notification when upstream completes;
  `blocked_by` text = external blocker); drag-and-drop board; in-app notifications
  (bell, `notifications` table); computed pipeline KPI (`parseValue`) + open-work
  breakdown; working global search. Requires `db/upgrade-tier1.sql` on existing DBs.
- Nav stubs: Calendar and Timeline ("soon").
- Possible next (Tier 2/3): calendar view, campaign templates, Supabase Storage file
  uploads, filters, password-reset UI, email digest (needs Edge Function), WordPress
  read-only dashboard, Excel export, per-role permissions.
