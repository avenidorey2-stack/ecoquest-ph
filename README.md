# EcoQuest PH

Gamified climate action for the Philippines: claim tree-planting slots in your city, upload proof, earn points,
then spend them on native seedlings, GCash/Maya cash-outs or vouchers.
See [ECOQUEST_PLAN.md](ECOQUEST_PLAN.md) for the current state of the project: architecture, flows and known issues.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 + PostgreSQL · Auth.js (NextAuth v5) ·
Leaflet + OpenStreetMap · framer-motion · sharp · Vitest

## Setup

```bash
npm install                      # also runs `prisma generate`
cp .env.example .env             # then fill in the values
npx auth secret                  # writes AUTH_SECRET to .env.local
npx prisma migrate deploy        # apply migrations to DATABASE_URL
npm run db:seed                  # tree species, seedling products, starter daily/side quests (safe to re-run)
npm run dev                      # http://localhost:3000
```

Google sign-in needs an OAuth client with redirect URI `http://localhost:3000/api/auth/callback/google`.

**Becoming an admin:** sign in once, then set your user's `role` to `ADMIN` with `npm run db:studio`.

### Changing the schema

1. Edit `prisma/schema.prisma`.
2. Create the migration. `npm run db:migrate` (`prisma migrate dev`) works on a real PostgreSQL; on the local
   `prisma dev` database its shadow database fails ("type Role already exists"), so generate the SQL from the
   live database instead and review it (hand-edit enum changes and add data back-fills where needed):

   ```bash
   mkdir prisma/migrations/<timestamp>_<name>
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script \
     > prisma/migrations/<timestamp>_<name>/migration.sql
   npx prisma migrate deploy && npx prisma generate
   ```
3. The running dev server picks up the regenerated client automatically (`src/lib/prisma.ts` replaces a stale
   cached client) — no restart needed.

After adding pages or route handlers, run `npx next typegen` before `npx tsc --noEmit` so the `PageProps` /
`RouteContext` route types include them.

## Accounts & email verification

Every account has a verified email — there is no way to earn or spend points without one.

- **Email sign-up** (`/signup`): the user enters name + email and gets a one-time link (valid 24 h). The account
  is created only when they open the link and choose a password there — so nobody can pre-register someone
  else's address or pre-set its password. Links are stored hashed and work once; viewing the page doesn't use
  them up (safe with email scanners that prefetch links).
- **Forgot password** (`/forgot-password`): emails a single-use reset link (1 h, stored hashed; only the newest
  link works). Resetting also lifts any login lockout for that address. Signing up again with an address that
  already has an account sends the owner a "you already have an account — sign in or reset" email instead
  (max 3/day), while the requester sees the usual reply.
- **Google sign-in** is shown only when `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are both set, and is accepted
  only if Google reports the email as verified. Email and Google accounts with the
  same address are linked automatically (safe because both sides are verified).
- **Spam protection:** sign-ups are limited to 10/hour per IP and 1 email/minute (5/day) per address; replies never
  reveal whether an address is registered; a hidden honeypot field silently drops bots; logins are limited to
  10 attempts per 15 min per email. Limits are DB-backed (work across instances) and pruned automatically.
- **Server-side gate:** claiming slots, submitting proof, ordering seedlings, redeeming rewards, claiming quest rewards
  and using invite codes return 403 for unverified accounts (only possible for accounts created before this feature
  without Google).

Email is sent over SMTP (`EMAIL_SERVER`, `EMAIL_FROM`). **In development without `EMAIL_SERVER`, nothing is sent:
emails land in the local dev mailbox at [`/dev/mailbox`](http://localhost:3000/dev/mailbox)** (stored in
`storage/dev-mailbox.json`, last 50 kept) — open the confirmation email there and click "Open link". The mailbox
returns 404 in production and as soon as `EMAIL_SERVER` is set. In production a missing `EMAIL_SERVER` makes
sign-up answer 503 rather than fail silently.
Set `AUTH_URL` to the public URL in production — links in emails are built from it. Rate limiting keys on the first
`X-Forwarded-For` address, so run behind a proxy that sets it (Vercel, nginx, Cloudflare).

## Planting quests

- **Slots** (admin → Slots): admins click the map to drop a pin; the region, province, city/municipality (PSGC) and
  barangay are filled in automatically from OpenStreetMap and can be corrected. Each slot sets the tree species, points
  per plant, **plants per quest** (goal) and **max participants**. New slots notify residents of that city. Slots can be
  edited, closed (hidden, history kept), deleted (only without quests) or **deleted permanently** — slots with approved
  plantings are then soft-deleted (`deletedAt`) so planters keep their approved proofs and trees; in-progress quests are
  cancelled and their planters notified.
- **Claiming** (`POST /api/slots/:id/claim`): only slots in the user's PSGC city, while open and below max participants.
  The quest copies the slot's goal (`targetPlants`).
- **Proof**: the Submit Proof modal uploads a photo/video (images ≤ 10 MB, video ≤ 50 MB) with a plant quantity; each
  submission stores its own `plantCount`. Phones get Take photo / Record video / Photos & files; desktop gets drag &
  drop, Browse and webcam. With Supabase configured the browser uploads straight to Storage through a signed URL
  (`POST /api/quests/:id/verifications/upload`), sidestepping Vercel's 4.5 MB request limit.
- **Review** (admin → Verifications): approving adds exactly the approved count to the quest's progress and awards points
  (count × points per plant), XP and planted trees. When progress reaches the goal the quest **completes automatically**,
  the growing-tree celebration plays and the next quest on the same slot unlocks; otherwise it stays active for more proof.
  Rejecting reopens the quest with the reason sent as a notification.
- **Admins** see every slot nationwide on the dashboard map (with "Edit slot" links); planters see their own city.

## Daily & side quests

Admin → Quests creates **daily** quests (reset every day at 12:00 AM PHT) and **side** quests (one-time, optional end
date). Objectives are tracked automatically from existing activity: approved plants, approved proofs (counted on the day
an admin approves them — pending uploads earn nothing), seedlings bought, friends who signed up with the user's invite link, and rewards redeemed. When the target is met the dashboard's
Quests card shows **Claim**; `POST /api/missions/:id/claim` awards the points (they count on the weekly leaderboard)
and XP once per period — enforced by a unique `(mission, user, period)` row. `npm run db:seed` adds six starter
quests only when none exist.

## Shop, rewards & history

- **Seedling shop** (`/shop`): one product per species with a points price and a peso price. Points orders are paid
  immediately; peso orders are cash on delivery. Stock and points are decremented with guarded updates so they can't
  oversell or overspend. Admin → Shop & Orders edits prices/stock and moves orders through
  Pending → Packed → Out for delivery → Delivered (or cancels: restock + points refund).
- **Rewards** (`/rewards`): GCash/Maya cash-outs and Grab/Shopee vouchers, fulfilled manually by an admin
  (rejections refund the points).
- **Transactions** (`/transactions`): unified history of seedling orders, redemptions and refunds (`Transaction` table)
  with live statuses.
- **Notifications**: the header bell lists approvals, rejections, new slots, order and redemption updates, quest
  rewards and referral bonuses (`Notification` table, polled every minute). Admins are notified of every new proof
  to review, linking to Admin → Verifications.
- **Public profiles** (`/planters/[id]`, also a modal from any leaderboard row): level, trees, points, every
  achievement and every approved proof photo/video, each with the date it was acquired. Approved proof is visible to
  all signed-in users; pending/rejected proof stays private to its owner and admins.

## Gamification

- **XP & levels** (`src/lib/levels.ts`): approving a planting awards shop **points** (plants × points per plant) *and*
  **XP** (20 per plant). XP is never spent; level L starts at 50·L·(L−1) XP (L2 = 100, L3 = 300, L4 = 600…). Shown as a
  level bar in the header, the dashboard's Eco-Impact card and the profile.
- **Achievements** (`/achievements`, `src/lib/achievements.ts`): the badge catalogue lives in code and is mirrored to
  the `Achievement` table; unlocks are `UserAchievement` rows. Badges are checked after each approval and on dashboard /
  achievements visits (leaderboard badges like "City of Cebu Top 10" can be earned between approvals), grant their XP
  once, and are idempotent.
- **Celebrations** (Framer Motion): level-ups and new badges pop up once on the dashboard (with confetti); climbing the
  weekly leaderboard shows a toast naming who you overtook, plus a highlight on your leaderboard row. Each is
  acknowledged via `POST /api/celebrations`. Animations respect the OS "reduce motion" setting.
- **Profile pictures**: uploaded on `/profile`, re-encoded to a 256×256 WebP with `sharp` (strips EXIF/GPS, rejects
  non-images by content, max 5 MB) and stored in `storage/avatars` (`AVATAR_ROOT` to override), served by
  `/api/avatars/[key]`. Not `public/`: Next.js only serves public files that existed at build time.
- **Tree Directory** (`/trees`): 24 species in 6 categories, stored in `TreeSpecies` and seeded from
  `src/data/tree-species.ts` by `prisma/seed.ts` (`npm run db:seed`). Cards show each species' live
  `totalPlanted` vs `plantingGoal`; clicking opens a details modal. Images are generated illustrations served by
  `/api/trees/art/[slug]` — set `imageUrl` to a real photo URL to replace one.
- **Planting records**: approving a submission creates a `PlantedTree` row (user, species, PSGC city code, count) and
  increments the species' `totalPlanted` in the same transaction. Admins pick a species when creating slots; older
  free-text slots ("Bakawan (mangrove)") are matched by name. The seed back-fills records for past approvals and
  recomputes totals, so it also repairs drift.
- **Impact stats**: the dashboard's Eco-Impact card shows national vs local (your PSGC city) verified plantings
  (`src/lib/impact.ts`, also `GET /api/impact`).

## Locations (PSGC)

Places come from the Philippine Standard Geographic Code, vendored in `src/data/psgc.json`
(17 regions, 81 provinces + pseudo-provinces for NCR and independent cities, 1,634 cities/municipalities).
Geofencing compares **PSGC city codes**, never names — 114 municipality names occur more than once nationwide.
Regenerate with `node scripts/fetch-psgc.mjs` when the PSA publishes updates.

Users pick their home city on `/profile`; changes are blocked while a quest is active and limited to once per 30 days.

## Testing

Tests run against a disposable database set as `TEST_DATABASE_URL` in `.env.test`.
**Every table is truncated between tests** — never point it at real data.

**Recommended: a real PostgreSQL.** Create an empty database (e.g. `ecoquest_test`) and set:

```
TEST_DATABASE_URL="postgresql://USER:PASSWORD@127.0.0.1:5432/ecoquest_test"
TEST_DB_CONCURRENCY=1   # also runs the concurrent points-award race test
```

**Fallback: `prisma dev`** (embedded PGlite, no install). It handles one connection at a time; the test setup
closes each file's connection pool so they don't pile up. It also stops when the terminal session that started
it ends — if tests fail with "Can't reach database server", restart it
(`npx prisma dev start ecoquest-test --detach`; run `stop` and `start` as separate commands).

```bash
npx prisma dev --name ecoquest-test --detach    # prints the TCP connection string
```

PGlite instances that were force-stopped can hang on "Starting…" forever. If that happens, remove and recreate the
instance (`npx prisma dev rm ecoquest-test`, then the command above) and update `TEST_DATABASE_URL` with the new port.
It can also fail with `08P01 bind message …` when two programs query it at once — another reason to prefer PostgreSQL.

Use `127.0.0.1` rather than `localhost` in the URL (it listens on IPv4 only). Without `TEST_DB_CONCURRENCY=1`,
tests use a single-connection pool (`DATABASE_POOL_MAX=1`) and skip the race test.

Apply migrations to the test database once (and after each new migration):

```powershell
$env:DATABASE_URL = "<TEST_DATABASE_URL>"; npx prisma migrate deploy
```

then run `npm test` (or `npm run test:watch`).

| Suite | Covers |
|---|---|
| `tests/unit` | Geofence matching, PH bounds, slot input validation, PSGC lookup and name matching, PHT week boundaries |
| `tests/unit/rewards` | PH mobile number normalization, reward catalogue validation |
| `tests/api/shop` | Redeeming (balance guard, e-wallet numbers, pending cap, refunds), admin catalogue |
| `tests/unit/registration` | Email/password/name validation, token hashing, HTML escaping, safe callback URLs |
| `tests/api/registration` | Sign-up emails, honeypot, cooldown/daily/IP limits, link completion, login checks, pruning |
| `tests/unit/levels`, `tests/unit/tree-species` | Level curve (incl. SQL backfill parity), species catalogue, name matching, SVG art |
| `tests/api/tree-species` | Planting records + species totals on approval, impact stats, seed back-fill/idempotency, admin species picks |
| `tests/api/gamification` | XP + points on approval, badge unlocks/idempotency/chaining, level-up & rank-climb celebrations |
| `tests/api/avatars` | Upload re-encoding, content sniffing, size limits, replace/delete, public serving |
| `tests/api/password-reset` | Reset emails, silent unknown-email handling, caps, single-use links, lockout lift |
| `tests/api/verified-gating` | Unverified accounts can't claim, submit proof, redeem, or use invite codes |
| `tests/api/quest-goals` | Plants-per-quest goals: batch progress, auto-complete + chaining, admin-corrected counts, rejections |
| `tests/api/missions` | Daily/side quests: PHT day boundaries, objective tracking, claims once per period, admin CRUD, starter seed |
| `tests/api/seedling-shop-notifications` | Seedling orders (stock/points guards), notifications API and triggers |
| `tests/api/admin-shop-transactions-profiles` | Dual-currency orders, order status flow + refunds, inventory edits, ledger, slot capacity, barangay, permanent delete keeping approved history, public profiles, proof visibility |
| `tests/api/dashboard` | Dashboard data: quests with awaiting-review counts, completed tasks, subtitle format, wallet, ranks, notices |
| `tests/unit/patron-ads` | Sponsor banner validation (https-only links) |
| `tests/api/referrals` | Invite links + cookie, code claiming rules, one-time referrer bonus |
| `tests/api/patrons-onboarding` | Patron banner admin API, welcome-modal completion |
| `tests/api/leaderboard` | Weekly points award + lazy reset, local/national ranking, ties, viewer rank, eligibility |
| `tests/api/profile` | Name/city updates, cooldown, active-quest lock, PSGC region API |
| `tests/api/slots` | Slot listing flags, claiming, city/province geofencing, shared slots |
| `tests/api/verification-flow` | Proof upload validation, approve/reject, points, quest chaining, celebration flag, media access control |
| `tests/api/admin` | Slot create/edit, redemption fulfil/reject with refund, admin-only access |

## Project layout

```
prisma/schema.prisma          Data model (+ migrations/, seed.ts)
src/auth.ts                   Auth.js config (Google + email/password, JWT sessions)
src/lib/                      Domain logic: authz, geo/PSGC, slots, quests (approval), missions, seedlings, rewards,
                              transactions, notifications, leaderboard, achievements, public profiles, storage
src/app/(app)/                Signed-in pages: dashboard, profile, planters/[id], leaderboard, achievements, trees,
                              shop, rewards, transactions, referrals, admin/* (slots, shop, missions, verifications,
                              redemptions, rewards, patrons)
src/app/(auth)/               Login, sign-up, password reset
src/app/api/                  Route handlers (user + admin APIs, media/avatars, tree art)
src/components/               AppShell, dashboard Quests board, maps, proof modal, celebrations, admin tools
src/data/                     PSGC locations, tree species, eco-tips
tests/                        Vitest unit + DB integration tests
```

See [ECOQUEST_PLAN.md](ECOQUEST_PLAN.md) for a file-by-file breakdown.

## Known limitations

- **Media storage** is local disk (`storage/uploads`, `storage/avatars`). Replace `src/lib/storage.ts` and
  `src/lib/avatars.ts` with S3/R2/Blob before deploying to serverless hosting.
- **City boundaries and admin reverse-geocoding** use OpenStreetMap Nominatim (cached 30 days; subject to its usage policy).
  Pins are matched to PSGC best-effort and barangay names are best-effort too; the admin can correct both.
- **Not built yet:** digital certificates, About Us / Settings / Privacy Policy pages, and a `PATRON`-role portal
  (the role exists but nothing uses it; sponsor banners are managed by admins).
- **Seedling orders don't collect a delivery address or contact details**, and peso orders are cash on delivery with
  no payment integration.
- **Rewards are fulfilled manually**: points are deducted on request, an admin sends the GCash/Maya cash or voucher
  code and marks it fulfilled (or rejects it, refunding the points). There's no payout API integration or voucher stock tracking.
- **Invite-friends quests** count sign-ups, not verified plantings, so keep their rewards small.
- **Rate limiting** covers sign-up, login and password reset only.
- **Referrals** pay the referrer 100 pts when the friend's first planting is verified (not at sign-up, so fake
  accounts earn nothing without a verified planting). Invite links are `/r/<code>`; set `AUTH_URL` in production so
  links use the public domain.
- **Patron banners** use externally hosted https images; there's no impression/click tracking yet.
- **Onboarding** is a one-time welcome modal; the interactive map walkthrough isn't built.
- Leaderboards keep only the current week; past weeks' winners aren't archived.
