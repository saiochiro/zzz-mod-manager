# Database tests

Runs `community.sql` against a plain local Postgres 16 with small stand-ins for
what Supabase provides (auth.users, auth.uid(), the anon/authenticated roles and
the http extension, which here returns fake GameBanana responses).

```sh
createdb pltest
psql -d pltest -f supabase/tests/supabase_stub.sql
sed '/create extension if not exists http/d' supabase/community.sql | psql -d pltest -f -
psql -d pltest -f supabase/tests/community_test.sql   # last line: failures = 0
```
