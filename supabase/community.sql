-- ============================================================================
-- ProxyLaunch community page: database setup
--
-- Paste this whole file into Supabase > SQL Editor and click Run.
-- Safe to run again after an update: it only creates or replaces things.
--
-- How it works:
--  * Posts are Workshop recipes (which part came from which GameBanana mod),
--    never mod files, so creators keep their downloads and credit.
--  * The app can READ posts directly, but it can only CREATE them through
--    publish_post(), which runs here on the server. publish_post() looks up
--    every source mod on GameBanana and labels the post 18+ if any of them is
--    rated (skimpy attire, nudity, ...), so the app can't skip the check.
--  * 3 reports hide a post until an admin looks at it.
-- ============================================================================

create extension if not exists http with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Proxy',
  avatar_url text,
  is_admin boolean not null default false,
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function private.profile_from_user(u auth.users)
returns void language sql security definer set search_path = public as $$
  insert into public.profiles (id, display_name, avatar_url)
  values (
    u.id,
    left(coalesce(
      nullif(u.raw_user_meta_data -> 'custom_claims' ->> 'global_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      'Proxy'), 40),
    u.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set display_name = excluded.display_name, avatar_url = excluded.avatar_url;
$$;

create or replace function private.on_auth_user_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.profile_from_user(new);
  return new;
end $$;

drop trigger if exists proxylaunch_on_auth_user_created on auth.users;
create trigger proxylaunch_on_auth_user_created
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function private.on_auth_user_changed();

-- Anyone who signed in before this ran
select private.profile_from_user(u) from auth.users u;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------- posts
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  agent_id text not null,
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 500),
  recipe jsonb not null,
  part_names text[] not null,
  source_gb_ids integer[] not null,
  thumbnail_url text,
  is_nsfw boolean not null default true,
  nsfw_reasons text[] not null default '{}',
  status text not null default 'published' check (status in ('published', 'hidden', 'removed')),
  like_count integer not null default 0,
  report_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists posts_feed_idx on public.posts (status, created_at desc);
create index if not exists posts_agent_idx on public.posts (agent_id, status);
create index if not exists posts_likes_idx on public.posts (status, like_count desc);
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);

-- ---------------------------------------------------------------- likes / reports
create table if not exists public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 300),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);

-- Counters kept in sync on the server
create or replace function private.on_like_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists likes_count on public.likes;
create trigger likes_count after insert or delete on public.likes
  for each row execute function private.on_like_changed();

create or replace function private.on_report_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.posts
     set report_count = report_count + 1,
         status = case when status = 'published' and report_count + 1 >= 3 then 'hidden' else status end
   where id = new.post_id;
  return null;
end $$;
drop trigger if exists reports_count on public.reports;
create trigger reports_count after insert on public.reports
  for each row execute function private.on_report_added();

-- ---------------------------------------------------------------- access rules
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.reports enable row level security;

revoke all on public.profiles, public.posts, public.likes, public.reports from anon, authenticated;
grant select on public.profiles, public.posts to anon, authenticated;
grant delete on public.posts to authenticated;
grant select, insert, delete on public.likes to authenticated;
grant select, insert on public.reports to authenticated;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);

drop policy if exists "published posts are public" on public.posts;
create policy "published posts are public" on public.posts for select
  using (status = 'published' or author_id = auth.uid() or private.is_admin());

drop policy if exists "authors and admins delete" on public.posts;
create policy "authors and admins delete" on public.posts for delete to authenticated
  using (author_id = auth.uid() or private.is_admin());

drop policy if exists "see own likes" on public.likes;
create policy "see own likes" on public.likes for select to authenticated using (user_id = auth.uid());
drop policy if exists "like published posts" on public.likes;
create policy "like published posts" on public.likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published')
    and not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.banned)
  );
drop policy if exists "unlike" on public.likes;
create policy "unlike" on public.likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists "report posts" on public.reports;
create policy "report posts" on public.reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and resolved = false
    and not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.banned)
  );
drop policy if exists "admins read reports" on public.reports;
create policy "admins read reports" on public.reports for select to authenticated using (private.is_admin());

-- ---------------------------------------------------------------- GameBanana check
create or replace function private.adult_words(t text)
returns boolean language sql immutable as $$
  select coalesce(t, '') ~* '\m(nsfw|r18|nude|nudity|naked|topless|bottomless|uncensored|explicit|adult|skimpy|lewd|hentai|ecchi|erotic|sex|sexy|sexual|strip|lingerie|bikini|microbikini|thong|bondage|bdsm|fetish|boobs?|breasts?|ass|butt|nipples?|pussy|penis|futa|ahegao|slingshot|pasties)\M'
      or coalesce(t, '') ~* '(^|[^a-z0-9])(18\+|r-18)'
      or coalesce(t, '') ~* '\mbunny\s*suit\M';
$$;

-- Returns {ok, game_id, name, author, thumb, nsfw, reasons[]} for a GameBanana mod.
create or replace function private.gamebanana_mod(p_id integer)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r extensions.http_response;
  j jsonb;
  img jsonb;
  reasons text[] := '{}';
  v text;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  begin
    select * into r from extensions.http((
      'GET',
      'https://gamebanana.com/apiv11/Mod/' || p_id || '/ProfilePage',
      array[extensions.http_header('User-Agent', 'ProxyLaunch-Community/1.0')],
      null, null
    )::extensions.http_request);
  exception when others then
    return jsonb_build_object('ok', false, 'unreachable', true);
  end;
  if r.status = 404 then
    return jsonb_build_object('ok', false, 'missing', true);
  end if;
  if r.status <> 200 then
    return jsonb_build_object('ok', false, 'unreachable', true);
  end if;
  begin
    j := r.content::jsonb;
  exception when others then
    return jsonb_build_object('ok', false, 'unreachable', true);
  end;

  -- Content ratings the creator ticked on GameBanana (Skimpy Attire, Partial Nudity, ...)
  if jsonb_typeof(j -> '_aContentRatings') = 'object' then
    for v in select value from jsonb_each_text(j -> '_aContentRatings') loop
      if v is not null and lower(v) not in ('', 'none', 'everyone', 'false', '0') then
        reasons := reasons || v::text;
      end if;
    end loop;
  end if;
  if lower(coalesce(j ->> '_sInitialVisibility', '')) in ('hide', 'warn') then
    reasons := reasons || 'Marked sensitive on GameBanana'::text;
  end if;
  if (j ->> '_bIsNsfw')::boolean is true then
    reasons := reasons || 'Marked NSFW on GameBanana'::text;
  end if;
  if private.adult_words(j ->> '_sName') then
    reasons := reasons || 'Adult words in the mod name'::text;
  end if;

  img := j -> '_aPreviewMedia' -> '_aImages' -> 0;
  return jsonb_build_object(
    'ok', true,
    'game_id', (j -> '_aGame' ->> '_idRow')::integer,
    'name', left(coalesce(j ->> '_sName', 'GameBanana mod'), 120),
    'author', left(coalesce(j -> '_aSubmitter' ->> '_sName', ''), 80),
    'thumb', case when img is not null and img ->> '_sBaseUrl' like 'https://%'
                  then (img ->> '_sBaseUrl') || '/' || coalesce(img ->> '_sFile530', img ->> '_sFile')
             end,
    'nsfw', cardinality(reasons) > 0,
    'reasons', to_jsonb(reasons)
  );
end $$;

-- ---------------------------------------------------------------- publish
create or replace function public.publish_post(p_recipe jsonb, p_description text default '')
returns public.posts language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_name text := btrim(coalesce(p_recipe ->> 'name', ''));
  v_agent text := coalesce(p_recipe ->> 'agent_id', '');
  v_desc text := btrim(coalesce(p_description, ''));
  part jsonb;
  parts jsonb := '[]'::jsonb;
  v_part_names text[] := '{}';
  v_ids integer[] := '{}';
  gb_id integer;
  info jsonb;
  infos jsonb := '{}'::jsonb;
  reasons text[] := '{}';
  thumb text;
  v_row public.posts;
begin
  if me is null then
    raise exception 'Sign in with Discord to post.' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = me and banned) then
    raise exception 'Your account can''t post to the community.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = me) then
    perform private.profile_from_user(u) from auth.users u where u.id = me;
  end if;
  if (select count(*) from public.posts where author_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You can post 10 mods a day. Try again tomorrow.' using errcode = '54000';
  end if;

  if p_recipe ->> 'format' is distinct from 'proxylaunch-recipe' or jsonb_typeof(p_recipe -> 'parts') <> 'array' then
    raise exception 'That isn''t a Workshop mod.' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'The name has to be 1 to 60 characters.' using errcode = '22023';
  end if;
  if v_agent !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'Unknown agent.' using errcode = '22023';
  end if;
  if char_length(v_desc) > 500 then
    raise exception 'Keep the description under 500 characters.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_recipe -> 'parts') not between 1 and 16 then
    raise exception 'A post needs 1 to 16 parts.' using errcode = '22023';
  end if;

  for part in select value from jsonb_array_elements(p_recipe -> 'parts') loop
    if coalesce(part ->> 'part', '') !~ '^[A-Za-z0-9 ]{1,30}$' then
      raise exception 'A part name is invalid.' using errcode = '22023';
    end if;
    if (part ->> 'part') = any(v_part_names) then
      raise exception 'Each part can only come from one mod.' using errcode = '22023';
    end if;
    begin
      gb_id := (part -> 'source' ->> 'gamebanana_id')::integer;
    exception when others then
      gb_id := null;
    end;
    if gb_id is null or gb_id <= 0 then
      raise exception 'The % comes from a mod that isn''t on GameBanana, so others couldn''t get it.', part ->> 'part'
        using errcode = '22023';
    end if;
    v_part_names := v_part_names || (part ->> 'part');
    if not gb_id = any(v_ids) then
      v_ids := v_ids || gb_id;
    end if;
  end loop;

  -- Look up every source mod on GameBanana (server side, can't be skipped)
  foreach gb_id in array v_ids loop
    info := private.gamebanana_mod(gb_id);
    if (info ->> 'missing')::boolean is true then
      raise exception 'GameBanana mod % doesn''t exist anymore.', gb_id using errcode = '22023';
    end if;
    if (info ->> 'ok')::boolean is true then
      if (info ->> 'game_id')::integer is distinct from 19567 then
        raise exception 'GameBanana mod % isn''t a Zenless Zone Zero mod.', gb_id using errcode = '22023';
      end if;
      if (info ->> 'nsfw')::boolean then
        reasons := reasons || array(
          select format('%s: %s', info ->> 'name', r) from jsonb_array_elements_text(info -> 'reasons') r
        );
      end if;
      thumb := coalesce(thumb, info ->> 'thumb');
    else
      reasons := reasons || format('Couldn''t check mod %s on GameBanana', gb_id)::text;
    end if;
    infos := infos || jsonb_build_object(gb_id::text, info);
  end loop;

  if (p_recipe ->> 'is_nsfw')::boolean is true then
    reasons := reasons || 'Marked 18+ by the creator'::text;
  end if;
  if private.adult_words(v_name) or private.adult_words(v_desc) then
    reasons := reasons || 'Adult words in the name or description'::text;
  end if;

  -- Store a clean copy of the recipe with titles and credits taken from GameBanana
  for part in select value from jsonb_array_elements(p_recipe -> 'parts') loop
    gb_id := (part -> 'source' ->> 'gamebanana_id')::integer;
    info := infos -> gb_id::text;
    parts := parts || jsonb_build_array(jsonb_build_object(
      'part', part ->> 'part',
      'source', jsonb_build_object(
        'title', coalesce(case when (info ->> 'ok')::boolean then info ->> 'name' end, left(part -> 'source' ->> 'title', 120), 'GameBanana mod'),
        'author', coalesce(case when (info ->> 'ok')::boolean then info ->> 'author' end, left(part -> 'source' ->> 'author', 80), ''),
        'gamebanana_id', gb_id
      )
    ));
  end loop;

  insert into public.posts (author_id, agent_id, name, description, recipe, part_names, source_gb_ids, thumbnail_url, is_nsfw, nsfw_reasons)
  values (
    me, v_agent, v_name, v_desc,
    jsonb_build_object(
      'format', 'proxylaunch-recipe', 'version', 1, 'name', v_name, 'agent_id', v_agent,
      'is_nsfw', cardinality(reasons) > 0, 'created_at', now(), 'parts', parts
    ),
    v_part_names, v_ids, thumb, cardinality(reasons) > 0, reasons
  )
  returning * into v_row;
  return v_row;
end $$;

revoke all on function public.publish_post(jsonb, text) from public, anon;
grant execute on function public.publish_post(jsonb, text) to authenticated;

-- ---------------------------------------------------------------- moderation
-- Admins: set status ('published' | 'hidden' | 'removed') and/or the 18+ label.
create or replace function public.moderate_post(p_post uuid, p_status text default null, p_is_nsfw boolean default null)
returns public.posts language plpgsql security definer set search_path = public as $$
declare v_row public.posts;
begin
  if not private.is_admin() then
    raise exception 'Only admins can do that.' using errcode = '42501';
  end if;
  update public.posts
     set status = coalesce(p_status, status),
         is_nsfw = coalesce(p_is_nsfw, is_nsfw),
         nsfw_reasons = case
           when p_is_nsfw is true and not is_nsfw then nsfw_reasons || 'Labeled 18+ by a moderator'::text
           when p_is_nsfw is false then '{}'::text[]
           else nsfw_reasons end,
         report_count = case when p_status = 'published' then 0 else report_count end
   where id = p_post
   returning * into v_row;
  if v_row.id is null then
    raise exception 'Post not found.' using errcode = 'P0002';
  end if;
  update public.reports set resolved = true where post_id = p_post and p_status is not null;
  return v_row;
end $$;

create or replace function public.set_user_banned(p_user uuid, p_banned boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then
    raise exception 'Only admins can do that.' using errcode = '42501';
  end if;
  update public.profiles set banned = p_banned where id = p_user and not is_admin;
  if p_banned then
    update public.posts set status = 'removed' where author_id = p_user;
  end if;
end $$;

revoke all on function public.moderate_post(uuid, text, boolean) from public, anon;
revoke all on function public.set_user_banned(uuid, boolean) from public, anon;
grant execute on function public.moderate_post(uuid, text, boolean) to authenticated;
grant execute on function public.set_user_banned(uuid, boolean) to authenticated;

-- Internal helpers are not callable from the app
revoke all on function private.gamebanana_mod(integer) from public, anon, authenticated;
revoke all on function private.profile_from_user(auth.users) from public, anon, authenticated;
revoke all on function private.adult_words(text) from public, anon, authenticated;
