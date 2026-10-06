-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "showActiveStatus" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SupportMessage" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "mediaKey" TEXT,
ADD COLUMN     "mediaType" TEXT;

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMember" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "mediaKey" TEXT,
    "mediaType" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_pairKey_key" ON "Conversation"("pairKey");

-- CreateIndex
CREATE INDEX "ConversationMember_userId_unreadCount_idx" ON "ConversationMember"("userId", "unreadCount");

-- CreateIndex
CREATE UNIQUE INDEX "DirectMessage_mediaKey_key" ON "DirectMessage"("mediaKey");

-- CreateIndex
CREATE INDEX "DirectMessage_conversationId_createdAt_idx" ON "DirectMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportMessage_mediaKey_key" ON "SupportMessage"("mediaKey");

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keep the Supabase Data API locked out (see 20261006140000_lock_data_api).
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DirectMessage" ENABLE ROW LEVEL SECURITY;

-- Live message pings: when a direct message is sent or unsent, ping every member's Realtime
-- channel ("notify:<notifyToken>", event "message") so open chats and the header badge update
-- at once. Like the notification ping, it carries no data, is only broadcast after commit, and
-- never fails the message. Databases without Supabase Realtime skip this; the app polls instead.
DO $migration$
BEGIN
  IF to_regprocedure('realtime.send(jsonb, text, text, boolean)') IS NULL THEN
    RAISE NOTICE 'Supabase Realtime not found: live message pings are off (apps poll instead).';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.eq_ping_direct_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $body$
    DECLARE
      member record;
    BEGIN
      FOR member IN
        SELECT u."notifyToken" AS token
        FROM public."ConversationMember" m JOIN public."User" u ON u.id = m."userId"
        WHERE m."conversationId" = NEW."conversationId"
      LOOP
        BEGIN
          PERFORM realtime.send('{}'::jsonb, 'message', 'notify:' || member.token, false);
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Live message ping failed: %', SQLERRM;
        END;
      END LOOP;
      RETURN NULL;
    END
    $body$
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS eq_ping_direct_message ON public."DirectMessage"';
  EXECUTE 'CREATE TRIGGER eq_ping_direct_message AFTER INSERT OR UPDATE OF "deletedAt" ON public."DirectMessage" '
       || 'FOR EACH ROW EXECUTE FUNCTION public.eq_ping_direct_message()';
  RAISE NOTICE 'Live message pings are on.';
END
$migration$;
