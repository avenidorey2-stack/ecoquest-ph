# EcoQuest PH — Project Plan & Current State

_Last synced with the codebase: 2026-10-03 (schema at migration `20261003070000_daily_side_quests`)._

This document describes what the code **actually does today**. For setup, schema-change and testing commands see
[README.md](README.md).

---

## 1. Project Overview

**EcoQuest PH** is a gamified tree-planting web app for the Philippines. Planters claim geofenced planting
slots in their own city/municipality, upload photo/video proof, and — once an admin approves it — earn points,
XP, badges and leaderboard rank. Points are spent on native seedlings (shop) or GCash/Maya cash-outs and
Grab/Shopee vouchers (rewards). Admins run everything from an in-app portal: slots on a map, proof review,
inventory and orders, rewards fulfilment, sponsor banners, and daily/side quests.

**Tech stack**

| Layer | Choice |
|---|---|
| Framework | Next.js 16.3 (App Router, Turbopack dev), React 19.2, TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 (`@tailwindcss/postcss`), earthy emerald/slate/cream palette (`--color-cream-*` in `globals.css`) |
| Data | PostgreSQL via Prisma 7 (`prisma-client` generator → `src/generated/prisma`, `@prisma/adapter-pg` driver adapter) |
| Auth | Auth.js / NextAuth v5 beta — email+password (Credentials) and optional Google; JWT sessions |
| Maps | Leaflet 1.9 + react-leaflet 5, OpenStreetMap tiles, Nominatim (reverse geocoding + city boundaries) |
| Locations | PSGC (Philippine Standard Geographic Code) vendored in `src/data/psgc.json` |
| Media | Local disk (`storage/uploads`, `storage/avatars`); avatars re-encoded to WebP with `sharp` |
| Email | Nodemailer over SMTP; dev fallback mailbox at `/dev/mailbox` |
| Animation | framer-motion (celebrations) + CSS keyframes |
| Tests | Vitest 5 (unit + DB-backed API integration tests) |

Size: ~13.9k lines in `src/` (excluding generated Prisma client), ~4.1k lines of tests, 17 migrations.

---

## 2. Directory Structure

Excluded: `node_modules/`, `.next/`, `.git/`, `src/generated/prisma/` (generated client), `storage/` (runtime
uploads + dev mailbox), `*.tsbuildinfo`, and local env files (`.env`, `.env.local`, `.env.test`).

```
ecoquest-ph/
├── AGENTS.md / CLAUDE.md          # Agent notes: "this is NOT the Next.js you know" — read node_modules/next/dist/docs
├── ECOQUEST_PLAN.md               # This document
├── README.md                      # Setup, schema changes, features, accounts/email, PSGC, testing, limitations
├── .env.example                   # DATABASE_URL, AUTH_*, EMAIL_*, MEDIA_ROOT, DATABASE_POOL_MAX
├── eslint.config.mjs  next.config.ts (empty)  postcss.config.mjs  tsconfig.json (@/* → src/*)
├── prisma.config.ts               # schema/migrations paths, seed = `tsx prisma/seed.ts`, loads dotenv
├── vitest.config.mts              # node env, tests/**/*.test.ts, sequential files, tests/setup.ts
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts                    # tree species → slot links → back-fill → seedling products → starter missions
│   └── migrations/
│       ├── 20261001175505_init
│       ├── 20261002090000_psgc_location_codes
│       ├── 20261002120000_weekly_leaderboard
│       ├── 20261002150000_shop_rewards
│       ├── 20261002180000_referrals_onboarding
│       ├── 20261002210000_email_verification
│       ├── 20261002213000_auth_pruning_indexes
│       ├── 20261002220000_password_reset
│       ├── 20261003000000_gamification
│       ├── 20261003010000_tree_species
│       ├── 20261003020000_seedling_shop_notifications
│       ├── 20261003030000_dual_pricing_transactions   # hand-edited: enum rename + ledger back-fill
│       ├── 20261003040000_slot_barangay
│       ├── 20261003050000_slot_soft_delete
│       ├── 20261003060000_quest_plant_goals           # hand-edited: per-submission plant counts back-fill
│       └── 20261003070000_daily_side_quests
├── public/                        # Next.js template SVGs (unused)
├── scripts/fetch-psgc.mjs         # Regenerates src/data/psgc.json from the PSGC API
├── src/
│   ├── auth.ts                    # Auth.js config
│   ├── types/next-auth.d.ts
│   ├── data/
│   │   ├── psgc.json              # 17 regions, provinces, 1,634 cities/municipalities
│   │   ├── tree-species.ts        # 24 native/cultivated species (+ aliases, SVG art spec)
│   │   └── eco-tips.ts            # Per-region tips for the dashboard
│   ├── app/
│   │   ├── layout.tsx  page.tsx (→ /dashboard)  globals.css  favicon.ico
│   │   ├── r/[code]/route.ts      # Invite link: sets referral cookie, redirects to sign-up
│   │   ├── dev/mailbox/           # Dev-only inbox for emails when EMAIL_SERVER is unset
│   │   ├── actions/auth.ts        # signOut server action
│   │   ├── (auth)/                # login, signup (+complete), forgot-password, reset-password, actions.ts
│   │   ├── (app)/                 # Signed-in area (AppShell layout)
│   │   │   ├── layout.tsx  error.tsx
│   │   │   ├── dashboard/  profile/  leaderboard/  planters/[id]/  achievements/  trees/
│   │   │   ├── shop/  rewards/  transactions/  referrals/
│   │   │   └── admin/  (layout + overview, slots/, shop/, missions/, verifications/,
│   │   │               redemptions/, rewards/, patrons/)
│   │   └── api/
│   │       ├── auth/[...nextauth]  register/ (+complete)  password/{forgot,reset}
│   │       ├── slots/  slots/[id]/claim  quests/[id]/{verifications,celebrate}
│   │       ├── missions/[id]/claim  shop/orders  rewards/[id]/redeem  referrals/claim
│   │       ├── notifications  celebrations  onboarding  profile (+avatar)  planters/[id]
│   │       ├── leaderboard  impact  geo/boundary  psgc/regions/[code]  trees/art/[slug]
│   │       ├── media/[key]  avatars/[key]
│   │       └── admin/ slots (+[id])  geo/reverse  verifications (+[id]/review)  redemptions/[id]
│   │                  rewards (+[id])  patron-ads (+[id])  seedlings/[id]  orders/[id]  missions (+[id])
│   ├── components/
│   │   ├── layout/        AppShell, NotificationBell, LiveClock, AutoRefresh, ComingSoon (unused)
│   │   ├── dashboard/     Card, QuestBoard, QuestList, QuestProofToggle (Submit Proof modal), CopyField
│   │   ├── map/           SlotMap, SlotMapLoader
│   │   ├── quests/        ProofUploadForm, CelebrationGate, GrowingTreeCelebration
│   │   ├── gamification/  CelebrationCenter, BadgeGrid, LevelBar, ClimbHighlight, Confetti
│   │   ├── leaderboard/   PlanterProfileModal, PlanterProfileTrigger
│   │   ├── profile/       ProfileForm, AvatarUploader, AchievementShowcase, ProofGallery
│   │   ├── shop/          OrderSeedlingForm, RedeemButton
│   │   ├── admin/         AdminNav, SlotManager, SlotForm, AdminSlotMap, VerificationReviewCard,
│   │   │                  InventoryTable, OrderManager, MissionManager, RewardCatalog,
│   │   │                  RedemptionActions, PatronAdManager
│   │   ├── auth/  location/LocationPicker  onboarding/WelcomeModal  patrons/PatronBanner
│   │   ├── referrals/ (InviteLink, ClaimCodeForm)  trees/TreeDirectory  ui/icons
│   └── lib/               # Domain logic (see §3)
└── tests/
    ├── setup.ts  helpers.ts       # TEST_DATABASE_URL, auth mock, temp media dirs, resetDb (TRUNCATE all)
    ├── unit/   (auth-providers, dev-mailbox, geo, levels, patron-ads, psgc, registration, rewards,
    │            slots, tree-species, week)
    └── api/    (admin, admin-shop-transactions-profiles, avatars, dashboard, gamification, leaderboard,
                 missions, password-reset, patrons-onboarding, profile, quest-goals, referrals,
                 registration, seedling-shop-notifications, shop, slots, tree-species,
                 verification-flow, verified-gating)
```

---

## 3. Core Components & Files

### Data model (`prisma/schema.prisma`)

| Area | Models | Notes |
|---|---|---|
| Users & auth | `User`, `Account`, `Session`, `VerificationToken`, `PendingRegistration`, `PasswordResetToken`, `RateLimit` | `User` holds points (spendable), weekly points (+ week start, lazy reset), xp/level, PSGC location, avatar, referral code/referrer, onboarding + celebration bookkeeping. Roles: `USER`, `ADMIN`, `PATRON` |
| Planting | `Slot`, `Quest`, `Verification`, `PlantedTree`, `TreeSpecies` | Slot: PSGC `cityCode` geofence key, species, `pointsPerPlant`, `questGoal`, `maxParticipants`, `barangay`, `status` OPEN/FULL/CLOSED, `deletedAt` (soft delete). Quest: `plantCount` = approved progress, `targetPlants` = goal, `pointsAwarded`. Verification: media, `plantCount` per submission, review status. PlantedTree: one row per approved submission (species + PSGC code) |
| Gamification | `Achievement`, `UserAchievement`, `Mission`, `MissionClaim` | 14 badges (catalogue in code). Missions = admin daily/side quests; `MissionClaim` unique per mission+user+period |
| Commerce | `SeedlingProduct`, `Order`, `Reward`, `RedemptionHistory`, `Transaction` | Dual pricing (points / pesos COD); order statuses PENDING → PACKED → OUT_FOR_DELIVERY → DELIVERED / CANCELLED; `Transaction` = unified history ledger |
| Engagement | `Notification`, `PatronAd` | Header bell; sponsor banners on the dashboard |

### Key library modules (`src/lib/`)

| File | Responsibility |
|---|---|
| `prisma.ts` | Prisma client singleton; dev cache is keyed by the generated `PrismaClient` class so a regenerated client replaces a stale one |
| `authz.ts` | `getCurrentUser` (role read from DB), `requirePageUserId`, `requireVerifiedUser`, `getAdmin`, `requireAdminPage`. **Every page/route guards itself** (no middleware) |
| `registration.ts`, `password-reset.ts`, `rate-limit.ts`, `email.ts`, `dev-mailbox.ts`, `auth-providers.ts` | Email sign-up (link-first, account created on completion), credential checks, reset links, DB-backed fixed-window rate limits, SMTP / dev mailbox |
| `psgc.ts`, `geo.ts` | PSGC lookup/matching; PH bounds; geofence (`isWithinUserCity` by city code); Nominatim reverse geocode (street level → barangay, falls back to city level) and city boundary polygons |
| `slots.ts`, `slot-limits.ts`, `admin-slots.ts` | Slot input validation (create/update incl. `questGoal`, `maxParticipants`, `barangay`); admin slot data; `deleteSlotPermanently` (soft-delete when approved history exists, hard-delete otherwise) |
| `quests.ts` | `approveVerification` / `rejectVerification`: per-submission progress, points/XP/trees, auto-complete at goal, quest chaining, referral bonus, notifications |
| `points.ts`, `levels.ts`, `week.ts` | Point awards with lazy weekly reset (Mon 00:00 PHT); XP curve (L starts at 50·L·(L−1)) and titles; PHT week/day helpers |
| `achievements.ts`, `celebrations.ts` | Badge catalogue + evaluation (idempotent, never fails approvals); pending level/badge/rank celebration popups |
| `leaderboard.ts` | Weekly local (city) / national rankings with competition ranking and viewer rank |
| `missions.ts`, `mission-meta.ts` | Daily/side quests: period windows (PHT day / start→end), auto progress per objective, claim with unique-period guard, admin validation, starter seed |
| `dashboard.ts` | Assembles the whole dashboard: impact, ranks, planting quests + milestones (with "awaiting review" counts), completed tasks, wallet, notices, missions |
| `seedlings.ts`, `rewards.ts`, `transactions.ts`, `order-status.ts` | Shop orders (guarded stock + points decrements, pesos COD), admin order status flow + cancel/refund; reward redemption (pending cap, PH mobile normalization); ledger rows |
| `species.ts`, `tree-art.ts`, `impact.ts` | Species catalogue sync, planting records, totals, generated SVG tree art, national/local impact |
| `public-profile.ts` | Public planter profile (stats, approved proofs with dates, achievements with dates) — USER role only, no private fields |
| `notifications.ts` | `notify` / `notifyCity` (same-site links only) |
| `storage.ts`, `avatars.ts`, `avatar-url.ts` | Proof media on disk (type/size rules, safe keys); avatar sniffing + WebP re-encode |
| `profile.ts`, `referrals.ts`, `patron-ads.ts`, `format.ts`, `url.ts` | City-change cooldown, referral codes/bonus, banner validation, formatting, app origin |

### UI entry points

- **`components/layout/AppShell.tsx`** — sidebar (Dashboard, Profile, Leaderboard, Shop, Rewards, Transactions,
  Referral Hub, Achievements, Tree Directory, Admin Portal for admins), header (level bar, clock, points, bell, avatar).
- **`app/(app)/dashboard/page.tsx`** — eco-impact score, **Quests card** (`QuestBoard`: Daily / Side / Planting tabs),
  latest submission, reward wallet, geofenced map (admins see all slots nationwide), local leaderboard
  (rows open `PlanterProfileModal`), notifications/referral hub/eco-tips, patron banner, welcome modal, celebrations.
- **Admin portal** (`app/(app)/admin/*`, tabs in `AdminNav`): Overview (users, trees, active slots, pending orders),
  Slots (map pin → auto-filled region/province/city/barangay, list with edit/close/delete), Shop & Orders
  (inventory, order fulfilment), Quests (daily/side CRUD), Verifications, Redemptions, Rewards, Patrons.

---

## 4. Current Implementation Status

### Original brief → status

| Requirement | Status |
|---|---|
| PH-localized geofenced map, shared slots | ✅ PSGC city-code geofence; shared slots with `maxParticipants`; admins see all slots |
| Per-plant points, quest chaining, daily quests | ✅ Per-plant points × approved count; plant goals per quest; auto-complete + chain; admin daily & side quests |
| Photo/video proof + growing-tree celebration | ✅ Upload (10 MB images / 50 MB video), admin review, celebration on quest completion |
| Profile: avatar, city settings, digital certificates | ✅ Avatar + city (30-day cooldown) · ❌ certificates not built |
| Referral system | ✅ `/r/<code>` links, code claiming, referrer bonus on friend's first approved planting |
| Local & national weekly leaderboards | ✅ Lazy weekly reset; public profile modal and `/planters/[id]` |
| Rewards: GCash/Maya, Grab/Shopee | ✅ Manual fulfilment with refunds on rejection |
| Patron banners | ✅ Admin-managed banners (no `PATRON`-role portal) |
| Admin: pin-slot map, slot rules, verification, fulfilment | ✅ All, plus inventory/orders and quests |
| Sidebar: About Us, Settings, Privacy Policy | ❌ Not built |
| Onboarding: welcome modal + interactive walkthrough | ✅ Welcome modal · ❌ walkthrough |
| Extras built beyond the brief | Seedling shop (dual currency), transactions ledger, notifications bell, achievements/levels, tree directory, email verification, password reset |

### Main flows

1. **Sign-up / login** — `/signup` emails a one-time link (`PendingRegistration`, hashed token); the account is
   created when the user sets a password on `/signup/complete`. Google sign-in requires a Google-verified email.
   Rate limits on sign-up, completion, login, forgot/reset. Unverified legacy accounts are blocked from all point
   actions (`requireVerifiedUser`).
2. **Claim → plant → verify**
   `POST /api/slots/:id/claim` (Serializable tx): user must have a city; slot OPEN, not deleted, same PSGC city, not
   already active for the user, participants < `maxParticipants` → `Quest{targetPlants = slot.questGoal}`.
   → `POST /api/quests/:id/verifications` (multipart file + `plantCount`) → quest `PENDING_VERIFICATION`,
   `Verification{plantCount}`.
   → Admin `POST /api/admin/verifications/:id/review`:
   - **approve** (optional corrected count): quest progress `+= count`, points `count × pointsPerPlant`
     (weekly + lifetime), XP `count × 20`, `PlantedTree` + species total, referral bonus (once), notification;
     if progress ≥ goal → `COMPLETED`, celebration, next quest chained on the same slot; else back to `ACTIVE`.
     Achievements are evaluated after commit.
   - **reject**: verification REJECTED, quest back to ACTIVE, notification with reason.
3. **Daily & side quests** — `getUserMissions` computes progress from existing activity (approved plants, non-rejected
   proofs, non-cancelled seedlings, invite sign-ups, non-declined redemptions) in the period (PHT day for DAILY,
   whole first day included; start→end for SIDE). `POST /api/missions/:id/claim` re-checks progress and inserts a
   `MissionClaim` (unique per period) then awards points + XP. **Closing** a live quest (admin sets `isActive: false`,
   `closeMission`) removes it from dashboards and blocks claims; users with unclaimed progress in the current period
   get `The quest '<title>' is now closed.` Progress isn't stored (no per-user progress table), so nothing else needs
   cleaning up; claimed rewards stay.
4. **Shop** — `POST /api/shop/orders` (`POINTS` or `PESOS`): guarded stock decrement; points orders also guarded
   points decrement; ledger row + notification. Admin advances PENDING → PACKED → OUT_FOR_DELIVERY → DELIVERED or
   cancels (restock; refund points orders).
5. **Rewards** — `POST /api/rewards/:id/redeem`: max 3 pending, guarded points decrement, ledger row; admin
   fulfils (code/reference) or rejects (refund + REFUND ledger row).
6. **Slot lifecycle (admin)** — create by map pin (Nominatim → PSGC match + barangay, notify city residents); edit
   rules; close; delete (no history) or delete permanently (history → soft delete keeps approved proofs/trees;
   in-progress quests cancelled and their unapproved media deleted).
7. **Visibility** — proof media: owner + admins, and any signed-in user once APPROVED. Public profiles: USER role
   only. Notifications polled every 60 s; Transactions page auto-refreshes every 30 s.

### Quality status

- `npx tsc --noEmit` and `npx eslint` clean; **30 test files / 474 tests pass** (1 race test skipped unless
  `TEST_DB_CONCURRENCY=1` on a real Postgres).
- New migrations are generated with `prisma migrate diff --from-config-datasource … --script` and applied with
  `prisma migrate deploy`, because `prisma migrate dev`'s shadow database fails on the local `prisma dev` (PGlite)
  instance. After adding routes, run `npx next typegen` before `tsc` (route types for `PageProps`/`RouteContext`).

---

## 5. Pending Tasks & Known Issues

There are **no TODO/FIXME comments** in the source; the items below come from reviewing the code and recent runs.

### Not built (from the brief or implied by existing features)
- **Digital certificates** for plantings.
- **About Us, Settings, Privacy Policy** pages (`components/layout/ComingSoon.tsx` exists but is unused).
- **Interactive onboarding walkthrough** (only the welcome modal exists).
- **`PATRON` role does nothing** — it's in the enum but no code checks it; sponsor banners are admin-managed.
- **Seedling orders have no delivery address or contact details**, so orders can't actually be shipped; pesos
  orders are cash-on-delivery with no payment integration.
- **Rewards have no payout/voucher API** and no voucher stock tracking (manual fulfilment).
- **Leaderboard history** isn't archived (weekly scores reset lazily; past winners are lost).
- **"Claim a slot" mission objective** isn't offered: the next quest is auto-created on completion, so claims
  can't be counted reliably.

### Logic gaps / risks
- **Latest-submission points** on the dashboard are recomputed as `plantCount × current pointsPerPlant`; if an
  admin changed the slot's rate after approval, the displayed figure is wrong (per-submission points aren't stored).
- **INVITE_FRIENDS missions count sign-ups**, not verified plantings — farmable with throwaway (verified-email)
  accounts; keep those rewards small or switch to qualified referrals.
- **Rate limiting covers only auth endpoints**; proof uploads, orders, redemptions and mission claims rely on
  business guards only.
- **Nominatim dependence**: reverse geocoding/boundaries go to the public OSM service (usage policy, latency,
  best-effort barangay names — admins should double-check).
- **Media on local disk** — not suitable for serverless hosting; replace `lib/storage.ts`/`lib/avatars.ts`
  with object storage before deploying.
- **Naming drift**: `QuestProofToggle` now opens a modal; `public/*.svg` are unused Next.js template files;
  `next.config.ts` is empty.

### Environment / data issues (local)
- **`prisma dev` (PGlite) is fragile**: single shared connection (occasional `08P01 bind message` errors under
  concurrent access), and force-stopping an instance can leave stale lock files in
  `%LOCALAPPDATA%\prisma-dev-nodejs\Data\` so it can never start again. Fix: delete that instance's folders under
  `Data\` and `Data\durable-streams\` (never `ecoquest-dev`), then `npx prisma dev --name <name> --detach`.
  `ecoquest-test` was rebuilt this way (port 51214, migrations applied, full suite passing). Moving dev/test to the
  full PostgreSQL on port 5432 is still recommended.
- **Lost planting history (data, not fixable)**: two slots were permanently deleted under an earlier implementation
  that erased their proofs and planting records. Both users' `totalPlants` counters were reconciled to their
  `PlantedTree` records (15 → 0 and 40 → 35); points, XP and achievements already earned were left unchanged.
- **Expired JWT cookies** in a browser produce repeated `JWTSessionError` log noise until the user signs in again.

---

## Working agreements (from the original brief)
1. Work step-by-step; don't regenerate the whole repository at once.
2. Prefer focused diffs to whole-file rewrites.
3. Scaffold structure before heavy features.
4. Read `node_modules/next/dist/docs/` before using unfamiliar Next.js 16 APIs (see `AGENTS.md`).
