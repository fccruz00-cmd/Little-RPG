-- Purchase verification: the Patron league stops being a claim.
--
-- Run AFTER schema.sql, in the same SQL editor. Idempotent.
--
-- THE SHAPE. verified_patrons holds one row per device whose purchase
-- token Google confirmed. Only the verify-purchase edge function writes
-- it (service role; RLS here has NO policies, so the anon key cannot even
-- read it). submit_score consults it: a verified device's league is
-- FORCED to patron whatever the client claims, and its row wears
-- `verified` so the board can show the check.
--
-- WHAT THIS BUYS, honestly: a device that reports its token is patron
-- forever, server-side, even with a doctored save. What it cannot buy: a
-- doctored CLIENT that never reports its token still lies by omission.
-- The wall keeps honest clients honest and makes cheating deliberate.

create table if not exists public.verified_patrons (
  device      uuid primary key,
  sku         text not null,
  verified_at timestamptz not null default now()
);

alter table public.verified_patrons enable row level security;
-- no policies at all: service role only

alter table public.scores
  add column if not exists verified boolean not null default false;

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
  is_patron boolean;
begin
  if p_device is null or p_league not in ('patron', 'gilded', 'pure') then
    return;
  end if;

  -- A Google-confirmed purchase outranks whatever the client says.
  select exists (
    select 1 from public.verified_patrons v where v.device = p_device
  ) into is_patron;
  if is_patron then p_league := 'patron'; end if;

  p_sprint := greatest(0, least(coalesce(p_sprint, 0), 200));
  p_best   := greatest(0, least(coalesce(p_best, 0), 2000));
  p_week   := greatest(0, least(coalesce(p_week, 0), 100000));

  p_name := left(regexp_replace(coalesce(p_name, ''), '[^[:alnum:] _.\-]', '', 'g'), 16);
  if length(trim(p_name)) < 2 then p_name := 'Hero'; end if;

  select * into r from public.scores where device = p_device;

  if r.device is null then
    insert into public.scores (device, name, league, sprint, best_stage, week, verified)
    values (p_device, p_name, p_league, p_sprint, p_best, p_week, is_patron);
    return;
  end if;

  if r.updated_at > now() - interval '20 seconds' then
    return;
  end if;

  update public.scores set
    name = p_name,
    league = case
      when is_patron then 'patron'
      when r.league = 'patron' or p_league = 'patron' then 'patron'
      when r.league = 'gilded' or p_league = 'gilded' then 'gilded'
      else 'pure'
    end,
    verified = r.verified or is_patron,
    sprint = case when p_week > r.week then p_sprint
                  else greatest(r.sprint, p_sprint) end,
    week = greatest(r.week, p_week),
    best_stage = greatest(r.best_stage, p_best),
    updated_at = now()
  where device = p_device;
end;
$$;

grant execute on function public.submit_score to anon;
