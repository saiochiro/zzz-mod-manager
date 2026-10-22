-- Minimal stand-ins for what Supabase provides, so community.sql can be tested locally.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create schema extensions;
grant usage on schema extensions to anon, authenticated;
create type extensions.http_header as (field varchar, value varchar);
create type extensions.http_request as (method text, uri varchar, headers extensions.http_header[], content_type varchar, content varchar);
create type extensions.http_response as (status integer, content_type varchar, headers extensions.http_header[], content varchar);
create function extensions.http_header(f varchar, v varchar) returns extensions.http_header language sql as $$ select row(f, v)::extensions.http_header $$;
create function extensions.http_set_curlopt(a varchar, b varchar) returns boolean language sql as $$ select true $$;
-- Fake GameBanana: responses keyed by mod id
create table extensions.fake_gb (id integer primary key, status integer, body text);
create function extensions.http(r extensions.http_request) returns extensions.http_response language plpgsql as $$
declare v_id integer := substring(r.uri from '/Mod/(\d+)/')::integer; f extensions.fake_gb;
begin
  select * into f from extensions.fake_gb where id = v_id;
  if f.id is null then return row(404, 'application/json', null, '{}')::extensions.http_response; end if;
  if f.status = 599 then raise exception 'timeout'; end if;
  return row(f.status, 'application/json', null, f.body)::extensions.http_response;
end $$;
grant usage on schema public to anon, authenticated;
