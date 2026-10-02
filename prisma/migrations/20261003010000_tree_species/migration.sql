-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "speciesId" TEXT;

-- CreateTable
CREATE TABLE "TreeSpecies" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scientificName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "benefits" TEXT[],
    "imageUrl" TEXT NOT NULL,
    "totalPlanted" INTEGER NOT NULL DEFAULT 0,
    "plantingGoal" INTEGER NOT NULL DEFAULT 20000,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreeSpecies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantedTree" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "speciesId" TEXT,
    "psgcCode" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "verificationId" TEXT NOT NULL,
    "plantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlantedTree_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TreeSpecies_slug_key" ON "TreeSpecies"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TreeSpecies_name_key" ON "TreeSpecies"("name");

-- CreateIndex
CREATE INDEX "TreeSpecies_category_sortOrder_idx" ON "TreeSpecies"("category", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PlantedTree_verificationId_key" ON "PlantedTree"("verificationId");

-- CreateIndex
CREATE INDEX "PlantedTree_psgcCode_idx" ON "PlantedTree"("psgcCode");

-- CreateIndex
CREATE INDEX "PlantedTree_speciesId_psgcCode_idx" ON "PlantedTree"("speciesId", "psgcCode");

-- CreateIndex
CREATE INDEX "PlantedTree_userId_idx" ON "PlantedTree"("userId");

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "TreeSpecies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantedTree" ADD CONSTRAINT "PlantedTree_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantedTree" ADD CONSTRAINT "PlantedTree_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "TreeSpecies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantedTree" ADD CONSTRAINT "PlantedTree_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "Verification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
