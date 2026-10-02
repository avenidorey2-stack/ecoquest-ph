"use server";

import { revalidatePath } from "next/cache";
import { clearDevMailbox } from "@/lib/dev-mailbox";

export async function clearMailbox() {
  await clearDevMailbox(); // no-op in production
  revalidatePath("/dev/mailbox");
}
