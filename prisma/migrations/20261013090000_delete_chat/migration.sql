-- Delete chat (for me): clearedAt = when the member deleted the chat. Messages up to then no
-- longer show for them; the other person's copy is untouched.

-- AlterTable
ALTER TABLE "ConversationMember" ADD COLUMN     "clearedAt" TIMESTAMP(3);
