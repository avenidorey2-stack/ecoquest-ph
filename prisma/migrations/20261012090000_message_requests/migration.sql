-- Message requests: planters who aren't friends can message each other. A conversation started
-- by a non-friend is a request (requestedById = who wrote first) until the other replies or
-- accepts. hiddenAt: the member deleted the request. Existing conversations stay normal chats.

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "requestedById" TEXT;

-- AlterTable
ALTER TABLE "ConversationMember" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowMessageRequests" BOOLEAN NOT NULL DEFAULT true;
