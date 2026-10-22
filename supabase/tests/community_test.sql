\set ON_ERROR_STOP on
\set QUIET on
insert into extensions.fake_gb values
 (100, 200, '{"_sName":"Clean Jacket","_aGame":{"_idRow":19567},"_aSubmitter":{"_sName":"Alice"},"_aPreviewMedia":{"_aImages":[{"_sBaseUrl":"https://images.gamebanana.com/img/ss/mods","_sFile":"a.jpg","_sFile530":"530-a.jpg"}]},"_aContentRatings":{}}'),
 (200, 200, '{"_sName":"Beach Hair","_aGame":{"_idRow":19567},"_aSubmitter":{"_sName":"Bob"},"_aContentRatings":{"sa":"Skimpy Attire"}}'),
 (300, 200, '{"_sName":"Genshin thing","_aGame":{"_idRow":8552}}'),
 (400, 599, ''),
 (500, 200, '{"_sName":"Warned","_aGame":{"_idRow":19567},"_sInitialVisibility":"warn"}');

insert into auth.users values
 ('11111111-1111-1111-1111-111111111111', '{"full_name":"ghxty","avatar_url":"https://cdn.discordapp.com/a.png"}'),
 ('22222222-2222-2222-2222-222222222222', '{"custom_claims":{"global_name":"Friend"}}'),
 ('33333333-3333-3333-3333-333333333333', '{}'),
 ('44444444-4444-4444-4444-444444444444', '{}');

create temp table results (name text, ok boolean, detail text);
grant all on results to anon, authenticated;

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid, ''), false); $$;
create function pg_temp.recipe(parts jsonb, nm text default 'My Mix', nsfw boolean default false) returns jsonb language sql as $$
  select jsonb_build_object('format','proxylaunch-recipe','version',1,'name',nm,'agent_id','jane_doe','is_nsfw',nsfw,'created_at','x','parts',parts) $$;
create function pg_temp.part(p text, id int, title text default 'whatever') returns jsonb language sql as $$
  select jsonb_build_object('part',p,'source',jsonb_build_object('title',title,'author','me','gamebanana_id',id)) $$;

-- profiles were created by the trigger
insert into results select 'profile names from Discord', array_agg(display_name order by id) = '{ghxty,Friend,Proxy,Proxy}', array_agg(display_name order by id)::text from public.profiles;
update public.profiles set is_admin = true where id = '11111111-1111-1111-1111-111111111111';

set role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');

-- clean post
do $$ declare p public.posts; begin
  p := public.publish_post(pg_temp.recipe(jsonb_build_array(pg_temp.part('Body', 100, 'my own title'))), 'Nice jacket');
  insert into results values ('clean post published, not 18+', p.status = 'published' and not p.is_nsfw, p.nsfw_reasons::text);
  insert into results values ('credits come from GameBanana', p.recipe -> 'parts' -> 0 -> 'source' ->> 'title' = 'Clean Jacket' and p.recipe -> 'parts' -> 0 -> 'source' ->> 'author' = 'Alice', p.recipe::text);
  insert into results values ('thumbnail from GameBanana', p.thumbnail_url = 'https://images.gamebanana.com/img/ss/mods/530-a.jpg', p.thumbnail_url);
end $$;

-- skimpy source => 18+ even though the app said it isn't
do $$ declare p public.posts; begin
  p := public.publish_post(pg_temp.recipe(jsonb_build_array(pg_temp.part('Hair', 200), pg_temp.part('Body', 100)), 'Summer', false));
  insert into results values ('rated source makes post 18+', p.is_nsfw and p.nsfw_reasons::text like '%Skimpy Attire%', p.nsfw_reasons::text);
  insert into results values ('recipe stored as 18+', (p.recipe ->> 'is_nsfw')::boolean, '');
end $$;
do $$ declare p public.posts; begin
  p := public.publish_post(pg_temp.recipe(jsonb_build_array(pg_temp.part('Hair', 500))), 'x');
  insert into results values ('warned visibility makes 18+', p.is_nsfw, p.nsfw_reasons::text);
  p := public.publish_post(pg_temp.recipe(jsonb_build_array(pg_temp.part('Hair', 400))), 'x');
  insert into results values ('GameBanana unreachable => 18+ (fail safe)', p.is_nsfw, p.nsfw_reasons::text);
  p := public.publish_post(pg_temp.recipe(jsonb_build_array(pg_temp.part('Hair', 100)), 'Lewd edit'), 'x');
  insert into results values ('adult words => 18+', p.is_nsfw, p.nsfw_reasons::text);
  p := public.publish_post(pg_temp.recipe(jsonb_build_array(pg_temp.part('Hair', 100)), 'Class mix'), 'x');
  insert into results values ('word "class" is not flagged (ass)', not p.is_nsfw, p.nsfw_reasons::text);
end $$;

-- rejected posts
create function pg_temp.expect_error(label text, r jsonb, pattern text) returns void language plpgsql as $$
begin
  perform public.publish_post(r, '');
  insert into results values (label, false, 'no error');
exception when others then
  insert into results values (label, sqlerrm ~* pattern, sqlerrm);
end $$;
select pg_temp.expect_error('rejects non-ZZZ mod', pg_temp.recipe(jsonb_build_array(pg_temp.part('Hair', 300))), 'isn''t a Zenless');
select pg_temp.expect_error('rejects deleted mod', pg_temp.recipe(jsonb_build_array(pg_temp.part('Hair', 999))), 'doesn''t exist');
select pg_temp.expect_error('rejects local-only part', pg_temp.recipe('[{"part":"Hair","source":{"title":"x","gamebanana_id":null}}]'), 'isn''t on GameBanana');
select pg_temp.expect_error('rejects duplicate part', pg_temp.recipe(jsonb_build_array(pg_temp.part('Hair', 100), pg_temp.part('Hair', 200))), 'only come from one');
select pg_temp.expect_error('rejects empty name', pg_temp.recipe(jsonb_build_array(pg_temp.part('Hair', 100)), '  '), '1 to 60');
select pg_temp.expect_error('rejects junk', '{"hello":1}', 'isn''t a Workshop');

-- direct writes are blocked
do $$ begin
  insert into public.posts (author_id, agent_id, name, recipe, part_names, source_gb_ids, is_nsfw)
  values ('22222222-2222-2222-2222-222222222222', 'jane_doe', 'sneaky', '{}', '{}', '{}', false);
  insert into results values ('app cannot insert posts directly', false, 'inserted');
exception when others then insert into results values ('app cannot insert posts directly', true, sqlerrm); end $$;
do $$ begin
  update public.posts set is_nsfw = false;
  insert into results values ('app cannot change labels', false, 'updated');
exception when others then insert into results values ('app cannot change labels', true, sqlerrm); end $$;
do $$ begin
  perform public.moderate_post((select id from public.posts limit 1), 'removed', null);
  insert into results values ('non-admin cannot moderate', false, 'ok');
exception when others then insert into results values ('non-admin cannot moderate', true, sqlerrm); end $$;

-- likes
do $$ declare pid uuid := (select id from public.posts where description = 'Nice jacket'); begin
  insert into public.likes (post_id, user_id) values (pid, '22222222-2222-2222-2222-222222222222');
  insert into results values ('like counts', (select like_count from public.posts where id = pid) = 1, '');
  begin
    insert into public.likes (post_id, user_id) values (pid, '33333333-3333-3333-3333-333333333333');
    insert into results values ('cannot like as someone else', false, '');
  exception when others then insert into results values ('cannot like as someone else', true, sqlerrm); end;
  delete from public.likes where post_id = pid;
  insert into results values ('unlike counts', (select like_count from public.posts where id = pid) = 0, '');
end $$;

-- reports: 3 hide the post
do $$ declare pid uuid := (select id from public.posts where description = 'Nice jacket'); u text; begin
  foreach u in array array['22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444'] loop
    perform pg_temp.as_user(u);
    insert into public.reports (post_id, reporter_id, reason) values (pid, u::uuid, 'bad');
  end loop;
  perform pg_temp.as_user('');
  insert into results values ('3 reports hide the post from everyone', not exists (select 1 from public.posts where id = pid), '');
  perform pg_temp.as_user('22222222-2222-2222-2222-222222222222');
  insert into results values ('author still sees hidden post', exists (select 1 from public.posts where id = pid), '');
  insert into results values ('non-admin cannot read reports', (select count(*) from public.reports) = 0, '');
end $$;

-- anonymous browsing
reset role;
set role anon;
select pg_temp.as_user('');
do $$ begin
  insert into results values ('signed-out users can browse', (select count(*) from public.posts) > 0, (select count(*) from public.posts)::text);
  begin
    perform public.publish_post(pg_temp.recipe(jsonb_build_array(pg_temp.part('Hair', 100))), '');
    insert into results values ('signed-out users cannot post', false, '');
  exception when others then insert into results values ('signed-out users cannot post', true, sqlerrm); end;
end $$;

-- admin
reset role;
set role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ declare pid uuid := (select id from public.posts where description = 'Nice jacket'); p public.posts; begin
  insert into results values ('admin reads reports', (select count(*) from public.reports) = 3, '');
  p := public.moderate_post(pid, 'published', true);
  insert into results values ('admin restores and labels', p.status = 'published' and p.is_nsfw and p.report_count = 0, p.nsfw_reasons::text);
  perform public.set_user_banned('22222222-2222-2222-2222-222222222222', true);
end $$;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.expect_error('banned user cannot post', pg_temp.recipe(jsonb_build_array(pg_temp.part('Hair', 100))), 'can''t post');

-- rate limit
reset role;
update public.profiles set banned = false;
set role authenticated;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
do $$ declare i int; begin
  for i in 1..10 loop perform public.publish_post(pg_temp.recipe(jsonb_build_array(pg_temp.part('Hair', 100)), 'n' || i), ''); end loop;
end $$;
select pg_temp.expect_error('10 posts a day limit', pg_temp.recipe(jsonb_build_array(pg_temp.part('Hair', 100))), '10 mods a day');

reset role;
\set QUIET off
select case when ok then 'ok  ' else 'FAIL' end as r, name, left(detail, 110) as detail from results;
select count(*) filter (where not ok) as failures from results;
