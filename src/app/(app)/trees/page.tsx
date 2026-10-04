import { requirePageUserId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { resolveCity } from "@/lib/psgc";
import { TREE_CATEGORY_ORDER } from "@/data/tree-species";
import { TREE_PHOTOS, treePhoto } from "@/data/tree-photos";
import TreeDirectory, { type TreeCard } from "@/components/trees/TreeDirectory";

export const metadata = { title: "Tree Directory · EcoQuest PH" };

export default async function TreeDirectoryPage() {
  const userId = await requirePageUserId();
  const { cityCode } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { cityCode: true } });
  const city = resolveCity(cityCode)?.city ?? null;

  const [species, localCounts, openSlots] = await Promise.all([
    prisma.treeSpecies.findMany({ orderBy: { sortOrder: "asc" } }),
    cityCode
      ? prisma.plantedTree.groupBy({ by: ["speciesId"], where: { psgcCode: cityCode }, _sum: { count: true } })
      : [],
    cityCode
      ? prisma.slot.groupBy({ by: ["speciesId"], where: { cityCode, status: "OPEN", deletedAt: null, speciesId: { not: null } }, _count: true })
      : [],
  ]);
  const localBySpecies = new Map(localCounts.map((r) => [r.speciesId, r._sum.count ?? 0]));
  const slotsBySpecies = new Map(openSlots.map((r) => [r.speciesId, r._count]));

  const cards: TreeCard[] = species.map((s) => {
    const openSlotsInCity = slotsBySpecies.get(s.id) ?? 0;
    const localPlanted = localBySpecies.get(s.id) ?? 0;
    const photo = treePhoto(s.slug);
    return {
      id: s.id,
      slug: s.slug,
      name: s.name,
      scientificName: s.scientificName,
      category: s.category,
      description: s.description,
      benefits: s.benefits,
      cardImage: photo?.card ?? s.imageUrl,
      fullImage: photo?.full ?? s.imageUrl,
      credit: photo?.credit ?? null,
      totalPlanted: s.totalPlanted,
      plantingGoal: s.plantingGoal,
      localPlanted,
      openSlotsInCity,
      activeIn:
        city && (openSlotsInCity > 0 || localPlanted > 0)
          ? `Active in: ${city}`
          : s.totalPlanted > 0
            ? "Active in: National"
            : "Awaiting first planting",
    };
  });

  const known = new Set<string>(TREE_CATEGORY_ORDER);
  const categoryTitles = [...TREE_CATEGORY_ORDER, ...new Set(cards.map((c) => c.category).filter((c) => !known.has(c)))];
  const categories = categoryTitles
    .map((title) => ({ title, trees: cards.filter((c) => c.category === title) }))
    .filter((c) => c.trees.length > 0);
  const planted = cards.reduce((sum, c) => sum + c.totalPlanted, 0);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-7 px-4 py-6 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-3xl p-6 text-white ring-1 ring-white/10 sm:p-10">
        {/* eslint-disable-next-line @next/next/no-img-element -- static decorative photo */}
        <img src="/trees/dao.jpg" alt="" className="eq-kenburns absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/80 to-canvas/20" />
        <div className="relative max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Philippine Tree Encyclopedia</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Plant native. <span className="eq-gradient-text">Plant for the future.</span>
          </h2>
          <p className="mt-2 text-sm text-emerald-100/80">
            {species.length} species tracked · {planted.toLocaleString("en-PH")} verified plants so far. Tap a tree to learn
            what it gives back.
          </p>
        </div>
      </section>

      {categories.length === 0 ? (
        <p className="eq-panel rounded-2xl border border-dashed border-line-strong bg-card p-8 text-center text-sm text-ink-3">
          The tree directory is empty. Run <code className="rounded bg-card-2 px-1.5 py-0.5">npm run db:seed</code> to load the
          species catalogue.
        </p>
      ) : (
        <TreeDirectory categories={categories} city={city} />
      )}

      <p className="text-center text-xs text-ink-4">
        Photos from Wikimedia Commons contributors, credited on each tree (header: Dao by {TREE_PHOTOS.dao.author},{" "}
        {TREE_PHOTOS.dao.license}). Always check with your local DENR or LGU office before planting in public spaces.
      </p>
    </div>
  );
}
