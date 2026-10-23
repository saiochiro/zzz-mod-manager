-- ProxyLaunch: shared content-scan verdicts.
--
-- When a PC's scan decides a GameBanana mod is NSFW or Experimental, it reports just that
-- (mod id + tier, never pictures). Every other copy of the app then treats the mod as at least
-- that strict right away, before its own scan finishes.
--
-- Safety rules:
--   * Only 'toggle' and 'nsfw' are stored. "SFW" is never shared: every PC must verify that itself,
--     so a bad report can't push a mod into the SFW views anywhere.
--   * Reports only ever make a mod stricter (toggle -> nsfw), never less strict.
--   * Nobody can write the table directly; only through report_mod_verdict().
--
-- Run once in the Supabase SQL editor (safe to run again).

create table if not exists public.mod_verdicts (
  gb_id bigint primary key check (gb_id > 0),
  level text not null check (level in ('toggle', 'nsfw')),
  scan_version int not null default 0,
  reports int not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.mod_verdicts enable row level security;

drop policy if exists "anyone can read verdicts" on public.mod_verdicts;
create policy "anyone can read verdicts" on public.mod_verdicts for select using (true);

revoke insert, update, delete on public.mod_verdicts from anon, authenticated;
grant select on public.mod_verdicts to anon, authenticated;

create or replace function public.report_mod_verdict(p_gb_id bigint, p_level text, p_scan_version int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_gb_id is null or p_gb_id <= 0 or p_gb_id > 1000000000 then return; end if;
  if p_level not in ('toggle', 'nsfw') then return; end if;
  insert into public.mod_verdicts (gb_id, level, scan_version)
  values (p_gb_id, p_level, coalesce(p_scan_version, 0))
  on conflict (gb_id) do update set
    level = case when public.mod_verdicts.level = 'nsfw' or excluded.level = 'nsfw' then 'nsfw' else 'toggle' end,
    scan_version = greatest(public.mod_verdicts.scan_version, excluded.scan_version),
    reports = public.mod_verdicts.reports + 1,
    updated_at = now();
end;
$$;

revoke all on function public.report_mod_verdict(bigint, text, int) from public;
grant execute on function public.report_mod_verdict(bigint, text, int) to anon, authenticated;
