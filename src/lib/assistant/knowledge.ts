import { CLAIM_DAYS, MAX_PLANTS_PER_SUBMISSION } from "@/lib/quests";
import { XP_PER_PLANT } from "@/lib/levels";
import { REFERRAL_BONUS_POINTS } from "@/lib/referrals";
import { MAX_PENDING_REDEMPTIONS } from "@/lib/rewards";
import { MAX_ORDER_QUANTITY } from "@/lib/seedlings";
import { DELIVERY_DAYS, ORDER_COOLDOWN_SECONDS } from "@/lib/delivery";
import { LOCATION_COOLDOWN_DAYS } from "@/lib/profile";

// How EcoQuest PH works, built from the same constants the app enforces so the assistant never
// quotes a stale rule. Used for /guide and as the AI's background knowledge.

/** The short walkthrough shown for /guide. */
export const GUIDE = [
  "How EcoQuest PH works:",
  "1. Set your home city in Profile. You can only claim slots in that city, and you can change it once every " +
    `${LOCATION_COOLDOWN_DAYS} days.`,
  "2. Claim an open slot on the Dashboard map (/slots shows them). " +
    `A claim lasts ${CLAIM_DAYS} days.`,
  "3. Plant the required tree, then upload a photo or video as proof from your quest on the Dashboard.",
  "4. An admin reviews it. Each approved plant earns the slot's points per plant, plus " +
    `${XP_PER_PLANT} XP toward your level.`,
  "5. Spend points in the Shop (seedlings) or on Rewards (GCash, Maya, Grab and Shopee).",
  `Bonus: invite friends from the Referral Hub and get ${REFERRAL_BONUS_POINTS} pts when their first planting is approved.`,
].join("\n");

/** Background facts for the AI. Live numbers (prices, slots, balances) come from its tools. */
export const SITE_FACTS = `
EcoQuest PH is a gamified tree-planting web app for the Philippines. Planters plant native trees at mapped planting slots, upload proof, and earn points and XP.

Getting started
- Sign up with email or Google. Set a home city/municipality in Profile (Region → Province → City). The home city is the geofence: planters can only claim slots in that city. It can be changed once every ${LOCATION_COOLDOWN_DAYS} days.

Slots and quests
- A slot is a planting site an admin placed on the map. Each slot has a required tree species, points per plant, plants needed per quest, and a limit on how many planters can work it at once.
- Claim a slot from the Dashboard map: tap a pin, then press "Claim Slot". A claim lasts ${CLAIM_DAYS} days; planters get a reminder when less than a day is left. Expired claims stop accepting proof and free the spot.
- Submit proof on the Dashboard in the Quests card → Planting tab: open the quest, add a "Photo or Video Proof", set "Plants in This Proof", then press "Submit Proof". The proof is a photo (JPG, PNG, WebP up to 10 MB) or video (MP4, MOV up to 50 MB), with how many plants it shows (up to ${MAX_PLANTS_PER_SUBMISSION} per proof). Phones can use the camera directly.
- Admins approve or reject proof. Each approved plant earns the slot's points per plant and ${XP_PER_PLANT} XP. A quest completes when its plant goal is approved.
- Slot status: OPEN (claimable), FULL (no spots left), CLOSED (no longer accepts proof).

Points, XP and levels
- Points are spendable (Shop and Rewards). XP is never spent and raises your level.
- Level L starts at 50·L·(L−1) XP (Level 2 = 100 XP, Level 3 = 300, Level 5 = 1,000). Titles: Seedling (1), Sprout (2), Sapling (3), Young Tree (5), Grove Keeper (8), Forest Guardian (12), Ancient Narra (20).
- Leaderboard: points earned this week, locally (your city) and nationally. Weeks reset Monday 00:00 Philippine time.
- Daily quests (missions) reset every day at 00:00 Philippine time; side quests run for a set period. Claim their rewards in the Quests card on the Dashboard.
- Achievements: badges for milestones, shown on the Achievements page.

Seedling shop
- Native tree seedlings, paid with points (charged right away) or, where a peso price is shown, pesos as cash on delivery.
- Up to ${MAX_ORDER_QUANTITY} seedlings per order, and ${ORDER_COOLDOWN_SECONDS} seconds between orders. Delivery needs a name, mobile number and address.
- Order steps: Pending → Packed → Out for Delivery → Delivered. Delivery takes ${DELIVERY_DAYS.min}–${DELIVERY_DAYS.max} days after the team packs it. Orders can be cancelled only while Pending or Packed (ask the team via Report a Problem); cancelled points orders are refunded.
- Track orders on the Transactions page.

Rewards
- Turn points into GCash or Maya cash (needs a mobile number) or Grab and Shopee vouchers.
- Up to ${MAX_PENDING_REDEMPTIONS} redemptions can wait for the team at once. Points are deducted on request and refunded in full if the request is declined.

Social
- Friends & Messages: send friend requests; chat with friends, or message any planter — a first message to a non-friend goes to their Message Requests until they reply or accept (photos, videos and voice stay hidden until then). Turn requests off in Settings → Privacy. Unsend your own messages (removed for both), or delete a whole chat with the trash button at the top of the chat (cleared for you only; the other person keeps theirs). Like and comment on planting photos. Planters can be blocked or reported.
- Referral Hub: share your invite link; you get ${REFERRAL_BONUS_POINTS} points when an invited friend's first planting is approved.

Pages: Dashboard, Leaderboard, Friends, Messages, Shop, Rewards, Transactions, Achievements, Tree Directory, Profile, Settings (privacy, notifications, password, Help), Referral Hub.
Help: Settings → Help → Report a Problem opens a support chat with the EcoQuest team (link: /settings/support).
`.trim();
