// Seeds the Tree Directory, keeps planting stats consistent, and stocks the seedling shop.
// Safe to run repeatedly.
//   npm run db:seed        (runs `prisma db seed`, which runs this file with tsx)
import { prisma } from "@/lib/prisma";
import { seedTreeData } from "@/lib/species";
import { seedSeedlingProducts } from "@/lib/seedlings";
import { seedStarterMissions } from "@/lib/missions";

async function main() {
  const result = await seedTreeData(prisma);
  console.log(
    `Tree species: ${result.species} upserted · slots linked to species: ${result.linkedSlots} · past plantings back-filled: ${result.backfilled}`,
  );
  const products = await seedSeedlingProducts(prisma);
  console.log(
    `Seedling products: ${products.created} created · peso prices filled: ${products.pesosFilled} (admin-edited prices and stock are kept)`,
  );
  const missions = await seedStarterMissions(prisma);
  console.log(`Daily/side quests: ${missions} starter quest(s) added${missions ? "" : " (missions already exist — left unchanged)"}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
