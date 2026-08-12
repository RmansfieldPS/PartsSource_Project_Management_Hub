-- ============================================================
-- Always On — daily Microsoft Teams digest
--
-- Posts one card to a Teams channel each weekday morning listing every
-- overdue and due-today task, grouped by person. Silent on days when
-- nobody has anything due.
--
-- BEFORE RUNNING THIS FILE:
--   1. In Supabase → Database → Extensions, enable  pg_cron  and  pg_net.
--   2. In Teams, on the channel you want: ⋯ → Workflows →
--      "Post to a channel when a webhook request is received" → copy the URL.
--
-- AFTER RUNNING THIS FILE:
--   3. Paste your webhook URL (see step 3 at the bottom).
--   4. Test it immediately:   select send_teams_digest(true);
--
-- Safe to re-run.
-- ============================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- where the webhook URL lives ----------
-- RLS is on with NO policies, so the app's users can never read this secret.
-- Only the digest function (security definer) and the service role can.
create table if not exists app_config (
  key   text primary key,
  value text
);
alter table app_config enable row level security;

-- ---------- the digest ----------
create or replace function public.send_teams_digest(force boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  hook     text;
  today    date := (now() at time zone 'America/New_York')::date;
  sections jsonb := '[]'::jsonb;
  people   int := 0;
  total    int := 0;
  rec      record;
  card     jsonb;
  req      bigint;
begin
  -- pg_cron runs in UTC, so the job fires at both 12:00 and 13:00 UTC and we
  -- keep only the run that is actually 8am in New York. That tracks DST by itself.
  if not force and extract(hour from now() at time zone 'America/New_York') <> 8 then
    return 'skipped: not 8am Eastern';
  end if;

  select value into hook from app_config where key = 'teams_webhook';
  if hook is null or hook = '' then
    return 'no webhook configured — see step 3 in db/upgrade-teams-digest.sql';
  end if;

  for rec in
    select m.name as who,
           count(*)::int as n,
           string_agg(
             case when t.due < today then
               '- ⚠️ **' || t.title || '** — ' || (today - t.due) ||
               case when today - t.due = 1 then ' day overdue' else ' days overdue' end ||
               ' · ' || p.name
             else
               '- **' || t.title || '** — due today · ' || p.name
             end,
             chr(10) order by t.due, t.title) as lines
    from tasks t
    join projects p on p.id = t.project_id
    join members  m on m.id = t.assignee_id
    where t.status <> 'done'
      and t.due is not null
      and t.due <= today
      -- tolerate databases where upgrade-fundamentals.sql hasn't run yet
      and coalesce((to_jsonb(p) ->> 'archived')::boolean, false) = false
    group by m.name
    order by m.name
  loop
    people := people + 1;
    total  := total + rec.n;
    sections := sections
      || jsonb_build_object('type','TextBlock','text',rec.who,
                            'weight','Bolder','spacing','Medium','wrap',true)
      || jsonb_build_object('type','TextBlock','text',rec.lines,
                            'wrap',true,'spacing','None');
  end loop;

  if people = 0 then
    return 'nothing overdue or due today — no post sent';
  end if;

  card := jsonb_build_object(
    'type','message',
    'attachments', jsonb_build_array(jsonb_build_object(
      'contentType','application/vnd.microsoft.card.adaptive',
      'content', jsonb_build_object(
        '$schema','http://adaptivecards.io/schemas/adaptive-card.json',
        'type','AdaptiveCard',
        'version','1.4',
        'body',
          jsonb_build_array(
            jsonb_build_object('type','TextBlock','size','Large','weight','Bolder',
                               'text','Always On — what''s due today'),
            jsonb_build_object('type','TextBlock','isSubtle',true,'spacing','None','wrap',true,
                               'text', to_char(today,'FMDay, FMMon FMDD') || ' · ' ||
                                       total || case when total = 1 then ' task' else ' tasks' end ||
                                       ' across ' || people ||
                                       case when people = 1 then ' person' else ' people' end)
          ) || sections,
        'actions', jsonb_build_array(jsonb_build_object(
          'type','Action.OpenUrl',
          'title','Open Always On',
          'url','https://ps-project-management.netlify.app/'))
      ))));

  select net.http_post(
           url     := hook,
           body    := card,
           headers := '{"Content-Type": "application/json"}'::jsonb
         ) into req;

  return 'posted ' || total || ' task(s) for ' || people || ' people (net request ' || req || ')';
end $$;

revoke all on function public.send_teams_digest(boolean) from anon, authenticated;

-- ---------- schedule: weekdays, 8am Eastern ----------
do $$
begin
  perform cron.unschedule('always-on-teams-digest');
exception when others then null;
end $$;

select cron.schedule(
  'always-on-teams-digest',
  '0 12,13 * * 1-5',                       -- 12:00 & 13:00 UTC; the function keeps 8am ET
  $job$ select public.send_teams_digest(); $job$
);

-- ============================================================
-- STEP 3 — paste your Teams webhook URL, then test.
-- Run these two lines separately once the file above has succeeded:
--
--   insert into app_config (key, value) values ('teams_webhook', 'PASTE_URL_HERE')
--     on conflict (key) do update set value = excluded.value;
--
--   select send_teams_digest(true);   -- posts right now, ignoring the 8am check
--
-- To pause the digest:    select cron.unschedule('always-on-teams-digest');
-- To see recent runs:     select * from cron.job_run_details order by start_time desc limit 10;
-- ============================================================
