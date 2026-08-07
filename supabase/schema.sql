-- Little RPG leaderboards: one table, one door in.
--
-- Run this once in the Supabase SQL editor (or `supabase db push`). It is
-- idempotent: safe to run again after edits.
--
-- THE SHAPE. One row per device, three leagues split by how the save was
-- funded (patron / gilded / pure -- see spendTier in src/game/state.js),
-- two boards per league: the WEEKLY SPRINT (deepest stage inside a run's
-- first 30 minutes, reset by the UTC week column) and the all-time best
-- stage.
--
-- THE DOOR. Clients never write the table directly: row level security
-- allows SELECT only, and every write goes through submit_score(), which
-- clamps instead of rejecting, keeps the best score rather than the last,
-- hardens the league one way (pure -> gilded -> patron, never back), and
-- refuses to update any row more than once per 20 seconds. None of that
-- makes a client-side idle game cheat-proof -- nothing can -- but it turns
-- "open table anyone can vandalise" into "one narrow honest function".

create table if not exists public.scores (
  device     uuid primary key,
  name       text        not null default 'Hero',
  league     text        not null check (league in ('patron', 'gilded', 'pure')),
  sprint     int         not null default 0 check (sprint between 0 and 200),
  best_stage int         not null default 0 check (best_stage between 0 and 2000),
  week       int         not null default 0 check (week between 0 and 100000),
  updated_at timestamptz not null default now()
);

-- The two orders the boards actually ask for.
create index if not exists scores_sprint_idx
  on public.scores (league, week, sprint desc);
create index if not exists scores_best_idx
  on public.scores (league, best_stage desc);

alter table public.scores enable row level security;

drop policy if exists "anyone reads the boards" on public.scores;
create policy "anyone reads the boards"
  on public.scores for select using (true);
-- No insert/update/delete policies on purpose: RLS denies what no policy
-- allows, so the function below is the only way in.

create or replace function public.submit_score(
  p_device uuid,
  p_name   text,
  p_league text,
  p_sprint int,
  p_best   int,
  p_week   int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.scores%rowtype;
begin
  if p_device is null or p_league not in ('patron', 'gilded', 'pure') then
    return;
  end if;

  -- Clamp, never reject: a cap should be a wall, not a tripwire that
  -- teaches the client what number to send next time.
  p_sprint := greatest(0, least(coalesce(p_sprint, 0), 200));
  p_best   := greatest(0, least(coalesce(p_best, 0), 2000));
  p_week   := greatest(0, least(coalesce(p_week, 0), 100000));

  -- Names: printable, short, never empty. The client filters harder; this
  -- is the floor that holds when the client is not ours.
  p_name := left(regexp_replace(coalesce(p_name, ''), '[^[:alnum:] _.\-]', '', 'g'), 16);
  if length(trim(p_name)) < 2 then p_name := 'Hero'; end if;

  select * into r from public.scores where device = p_device;

  if r.device is null then
    insert into public.scores (device, name, league, sprint, best_stage, week)
    values (p_device, p_name, p_league, p_sprint, p_best, p_week);
    return;
  end if;

  -- One write per row per 20s: a loop cannot hammer the board.
  if r.updated_at > now() - interval '20 seconds' then
    return;
  end if;

  update public.scores set
    name = p_name,
    -- Leagues only harden. A patron stays a patron through every reset,
    -- because a league you can wash out of is not a league.
    league = case
      when r.league = 'patron' or p_league = 'patron' then 'patron'
      when r.league = 'gilded' or p_league = 'gilded' then 'gilded'
      else 'pure'
    end,
    -- A new week starts the sprint over; inside a week the best run holds.
    sprint = case when p_week > r.week then p_sprint
                  else greatest(r.sprint, p_sprint) end,
    week = greatest(r.week, p_week),
    best_stage = greatest(r.best_stage, p_best),
    updated_at = now()
  where device = p_device;
end;
$$;

grant execute on function public.submit_score to anon;
