-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyToken" TEXT NOT NULL DEFAULT (gen_random_uuid())::text;

-- CreateIndex
CREATE UNIQUE INDEX "User_notifyToken_key" ON "User"("notifyToken");

-- Live notifications: after a notification row is saved, ping its owner's Supabase Realtime
-- channel ("notify:<notifyToken>") so their open app fetches it at once. The ping carries no
-- data. realtime.send only broadcasts once the transaction commits, and any failure is swallowed
-- so a notification (or the order/approval that created it) can never fail because of it.
-- Databases without Supabase Realtime (local dev, tests) skip this; the app falls back to polling.
DO $migration$
BEGIN
  IF to_regprocedure('realtime.send(jsonb, text, text, boolean)') IS NULL THEN
    RAISE NOTICE 'Supabase Realtime not found: live notification pings are off (apps poll instead).';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.eq_ping_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $body$
    DECLARE
      token text;
    BEGIN
      SELECT "notifyToken" INTO token FROM public."User" WHERE id = NEW."userId";
      IF token IS NOT NULL THEN
        BEGIN
          PERFORM realtime.send('{}'::jsonb, 'notify', 'notify:' || token, false);
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Live notification ping failed: %', SQLERRM;
        END;
      END IF;
      RETURN NULL;
    END
    $body$
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS eq_ping_notification ON public."Notification"';
  EXECUTE 'CREATE TRIGGER eq_ping_notification AFTER INSERT ON public."Notification" '
       || 'FOR EACH ROW EXECUTE FUNCTION public.eq_ping_notification()';
  RAISE NOTICE 'Live notification pings are on.';
END
$migration$;
