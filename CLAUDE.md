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
- **Tier 2 partial (2026-07-31):** Calendar view (month grid keyed on task `due`
  strings — compare as YYYY-MM-DD strings, no Date TZ math; chips colored by status,
  overdue red, click opens drawer) and filters (`FILT` state: board by
  assignee/priority, campaigns by motion/owner/segment, calendar by
  assignee/campaign). Pure front-end, no schema change.
- **Roles shipped (2026-07-31):** `members.app_role` ('admin'|'user'). Enforcement is
  in RLS (db/upgrade-roles.sql): identity = sign-in email ↔ members.email via
  security-definer helpers (`current_member_id`, `is_admin`, `can_edit_task`,
  `is_upstream_mine` — the last one lets a base user's task completion auto-unblock
  others' tasks). Admins edit everything + Team screen (edit emails/roles, Add User
  = throwaway supabase client signUp + members insert; admin session untouched).
  Base users edit only own tasks; UI gates via `isAdminMe()`/`canEdit(t)` but RLS is
  the real boundary. Client treats missing app_role as admin (pre-migration compat).
  Members with no email mapped can't edit anything in live mode — set emails in Team.
- **Files + Excel export shipped (2026-07-31):** attachments now task-level
  (task_id) OR campaign-level (project_id) with `path` (Storage) vs `url`
  (external link) + `uploaded_by`; private bucket 'pmpm-files', open via
  1-hour signed URL on click. Task attach = admin/assignee; campaign attach =
  any signed-in user; delete = admin/uploader/task-editor
  (db/upgrade-files.sql — note: storage.* SQL can fail with "must be owner"
  on some projects → create bucket/policies via Dashboard → Storage instead).
  Excel export (everyone): SheetJS lazy-loaded from jsdelivr in
  `loadXLSX()`/`buildCampaignWb()` — Campaign meta sheet + Tasks sheet.
- **Campaign templates shipped (2026-07-31):** `templates` table (jsonb `steps`:
  [{t, role, off, pr, sub[], dep}]) — role = member job title (role slot, resolved
  via `roleDefault()`), off = days relative to launch (dues computed at creation),
  dep = index of earlier step (instantiated as real blocked_by_task + 'blocked'
  status, so auto-unblock works). Flows: template picker in New Campaign modal
  (launch date + role→person remap), "Save as template" on campaign detail
  (generalizes assignees→roles, dues→offsets anchored on launch-ish task else
  latest due), Templates manager view (admin nav) with step editor + starter
  import. 4 starters in seed-data.js (Email Series, Promo, ABM, Event).
  Templates are admin-managed, viewable by all. Migration: db/upgrade-templates.sql.
- **Timeline shipped (2026-07-31):** two modes on one screen (`tlMode`):
  portfolio (campaign bars derived min→max of task dues + launchDate; progress
  fill; status colors; ⚑ launch flag) and single-campaign (milestone circles on
  due dates, SVG cubic dependency arrows via blocked_by_task, undated tasks
  listed below). Drag-to-reschedule: pointer events on .tl-marker, snaps to
  TL_PPD-sized days, gated by canEdit, persists due. Date math is string/ISO
  (no TZ). `projects.launch_date` added (db/upgrade-timeline.sql) — set via
  campaign modal or template flow; `HAS_LDATE` feature-detects the column so
  the app works pre-migration. All nav stubs are now done.
- **Campaign approvals shipped (2026-07-31):** `members.is_approver` (Team screen
  toggle + Add User field), `projects.approver_id` (campaign modal; null = no
  approval required — legacy campaigns grandfathered), `approvals` append-only
  event log ('submitted'|'approved'|'changes' + note). State = last event
  (`approvalState()`: null/pending/approved/changes). RLS: decisions only by the
  campaign's approver or admin; submit/resubmit admin-only; actor must be self.
  DB trigger `trg_enforce_approval` blocks status='active' when approver set and
  latest event ≠ approved; client mirrors by soft-forcing 'planning' + toast.
  UI: banner on campaign detail (Approve / Request changes for approver+admin,
  Resubmit for admin, mini history), chips on cards + dashboard, Excel meta row.
  Notifications both directions. `HAS_APPR` feature-detects pre-migration.
  Migration: db/upgrade-approvals.sql. Seed: MH is approver; top5 pending.
- **Fundamentals shipped (2026-07-31):** task editing (due/priority inline in
  drawer via `setTaskField`; title/description via `drawerEdit` mode + pencil);
  delete task (assignee/admin, clears dependents' `bt`, removes storage files),
  subtask, own comment (RLS loosened in db/upgrade-fundamentals.sql: tsk_del +
  com_del now assignee/author or admin); campaign archive (`projects.archived`,
  `HAS_ARCH` feature-detect, `visibleProjects()` filters every view/picker/
  search/counts; Archived seg tab on Campaigns; admin-only) and campaign hard
  delete (in edit modal, double-confirm, cascades + storage cleanup); undo —
  `showToast(msg,{action,onAction})` on task completion. `rerender()` now
  refreshes whichever view is active.
- **Round 2 shipped (2026-07-31):** Reports tab (all users; `renderReports()` —
  hand-rolled SVG/HTML: completed-per-week bars from `completedAt` (seed done
  tasks proxy completedAt=due in DEMO only; live history starts at adoption),
  real on-time %, campaign progress, status donut, stacked workload, overdue
  rollups, pipeline-by-motion). @mentions (`mentionInput`/`insertMention` on
  #newcomment, `parseMentions` by '@'+display-name → notify, `decorateMentions`
  highlights). Comment editing (own; `editingComment` inline; sets
  `comments.updated_at` → '(edited)'; policy com_upd). Recurring tasks
  (`tasks.recur` weekly|biweekly|monthly; completing spawns next occurrence via
  `spawnRecurrence` — recur moves to the new task, subtasks reset, undo removes
  spawn; 🔁 badges). Password reset (Forgot link → resetPasswordForEmail →
  PASSWORD_RECOVERY event → #reset-form; Safe Links may eat tokens — fallback is
  admin SQL). Flags: HAS_RECUR/HAS_CEDIT. Migration: db/upgrade-round2.sql.
  **Email digest deliberately skipped** (user choice — revisit later; needs Edge
  Function + provider).
- Possible next (Tier 3): email digest (Edge Function + SendGrid/Resend),
  task reordering, bulk actions, add-task from board/calendar.
