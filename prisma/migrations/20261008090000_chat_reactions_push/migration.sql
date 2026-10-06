-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowComments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "replyToId" TEXT;

-- CreateTable
CREATE TABLE "MessageReaction" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageReaction_userId_idx" ON "MessageReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "DirectMessage_replyToId_idx" ON "DirectMessage"("replyToId");

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "DirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keep the Supabase Data API locked out (see 20261006140000_lock_data_api).
ALTER TABLE "MessageReaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;

-- Live reaction pings: adding, changing or removing a reaction pings both chat members'
-- Realtime channel (event "message"), like a new message does, so open chats update at once.
-- Databases without Supabase Realtime skip this; the app polls instead.
DO $migration$
BEGIN
  IF to_regprocedure('realtime.send(jsonb, text, text, boolean)') IS NULL THEN
    RAISE NOTICE 'Supabase Realtime not found: live reaction pings are off (apps poll instead).';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.eq_ping_message_reaction() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $body$
    DECLARE
      member record;
      msg_id text := COALESCE(NEW."messageId", OLD."messageId");
    BEGIN
      FOR member IN
        SELECT u."notifyToken" AS token
        FROM public."DirectMessage" d
        JOIN public."ConversationMember" m ON m."conversationId" = d."conversationId"
        JOIN public."User" u ON u.id = m."userId"
        WHERE d.id = msg_id
      LOOP
        BEGIN
          PERFORM realtime.send('{}'::jsonb, 'message', 'notify:' || member.token, false);
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Live reaction ping failed: %', SQLERRM;
        END;
      END LOOP;
      RETURN NULL;
    END
    $body$
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS eq_ping_message_reaction ON public."MessageReaction"';
  EXECUTE 'CREATE TRIGGER eq_ping_message_reaction AFTER INSERT OR UPDATE OR DELETE ON public."MessageReaction" '
       || 'FOR EACH ROW EXECUTE FUNCTION public.eq_ping_message_reaction()';
  RAISE NOTICE 'Live reaction pings are on.';
END
$migration$;
