-- Lock the Supabase Data API out of the app's tables.
-- The app reads and writes only through Prisma, connected as the table owner, which row level
-- security does not apply to. Supabase also publishes every "public" table over its Data API
-- (REST/GraphQL) to the "anon" and "authenticated" roles, using a key that ships to browsers.
-- Turning RLS on with no policies makes those roles see and change nothing, and revoking their
-- grants (now and for tables added later) closes the door twice. Live notification pings are
-- unaffected: they are Realtime broadcasts sent by a SECURITY DEFINER trigger.
-- Databases without the Supabase roles (local dev, tests) just get RLS turned on.
DO $migration$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
    RAISE NOTICE 'Data API roles locked out of public tables.';
  END IF;
END
$migration$;
