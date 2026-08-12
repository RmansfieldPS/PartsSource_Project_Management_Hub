# Always On — PartsSource Demand Gen

An internal, Asana-style project-management tool for the PartsSource Demand Gen team.
Dashboard, campaigns, per-campaign tasks with assignment, task detail (subtasks,
attachments, activity), a Kanban board, My Tasks, and a Roadblocks view — all built on
your real campaign data.

**No build step, no Node required.** It's plain HTML/CSS/JS. It runs in **demo mode**
by just opening it, and becomes a **live, shared, multi-user app** once you connect a
free Supabase project.

---

## Run it right now (demo mode)

Just open `index.html` in a browser (or serve the folder — see below). You'll see the
full app with the real campaigns. In demo mode nothing is saved and you're the only
viewer. That's expected — it's for clicking around.

> Tip: some browsers restrict `file://` pages. If it looks blank, use the local server
> below.

---

## Make it live & shared (≈10 minutes)

### 1. Create a Supabase project (free)
1. Go to https://supabase.com and sign up / sign in.
2. **New project** → give it a name (e.g. `pmpm`), set a database password, pick a region, **Create**.
3. Wait ~2 minutes for it to finish provisioning.

### 2. Create the database tables
1. In the project, open **SQL Editor** → **New query**.
2. Open `db/schema.sql` from this repo, copy everything, paste it in, and click **Run**.
   You should see "Success". (It's safe to run again if needed.)

### 3. Connect the app to your project
1. In Supabase go to **Project Settings → API**.
2. Copy the **Project URL** and the **`anon` `public`** key.
3. Open `js/config.js` and paste them in, replacing the `YOUR-...` placeholders:
   ```js
   window.PMPM_CONFIG = {
     SUPABASE_URL: "https://abcd1234.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOi...your-anon-key..."
   };
   ```
   > The `anon` key is a **public** client key — it's fine to commit it. Your data is
   > protected by Row Level Security (only signed-in users can read/write).

### 4. Create your login & the team's logins
Two options:
- **Simplest:** in Supabase → **Authentication → Providers → Email**, turn **off**
  "Confirm email" for now. Then open the app, click **Sign up**, and create each
  person's account. (Turn confirmation back on later if you want.)
- Or create users manually in **Authentication → Users → Add user**.

### 5. Import your campaigns (one click, first run only)
Open the app and sign in. Because the database is empty, you'll see a banner:
**"Import sample campaigns."** Click it — it loads your real Demand Gen campaigns,
tasks, team, and blockers into the database. Do this **once**.

### 6. Match logins to team members (so "My Tasks" works)
Each teammate's login email should match their `email` in the `members` table so
"My Tasks" shows their work. Ryan's is pre-filled. To set the others: in Supabase →
**Table Editor → members**, add each person's work email to their row. (Until then,
anyone can use the "Viewing as … · switch" control at the bottom-left in demo, or we
can wire a picker.)

---

## Put it online (GitHub Pages)

Because it's just static files, hosting is free and simple:

1. Create a new **GitHub repository** and push this folder to it.
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, pick `main` / `/root`, **Save**.
3. After a minute your app is live at `https://<your-username>.github.io/<repo>/`.
   Share that link with the team.

Any time you push a change, GitHub Pages updates automatically. `config.js` with your
Supabase keys can be committed (the anon key is public by design).

---

## How it fits together

| File | What it is |
|------|-----------|
| `index.html` | The app shell and all screens |
| `css/styles.css` | All styling (light + dark themes) |
| `js/config.js` | **Your** Supabase URL + anon key |
| `js/seed-data.js` | The real campaigns/team (demo data + first-run import) |
| `js/app.js` | All app logic — data loading, rendering, editing, realtime |
| `db/schema.sql` | Database tables, security rules, realtime setup |

## Data model
`members` → `projects` → `tasks` → (`subtasks`, `comments`, `attachments`).
Campaigns carry Segment, Motion (Recruit/Grow/Retain), Solution, Pipeline, value,
audience, launch, and a blocker. Tasks carry assignee, due date, priority, status,
and dependency notes. My Tasks, Roadblocks, and the dashboard are all derived from
this data live.

## Notes & next steps
- **Security:** any signed-in user can read/write everything (fine for one trusted
  team). Per-role permissions can be added later.
- **Coming soon:** Calendar and Timeline views (stubbed in the nav).
- Questions or changes? This is a starting point meant to grow with the team.
