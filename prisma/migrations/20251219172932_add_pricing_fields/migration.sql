-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Offer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT,
    "vendor" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "tags" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priceType" TEXT NOT NULL DEFAULT 'OFFER',
    "pricingFormat" TEXT NOT NULL DEFAULT 'ACTUAL',
    "markup" DECIMAL,
    "discount" DECIMAL
);
INSERT INTO "new_Offer" ("createdAt", "endDate", "id", "startDate", "status", "tags", "vendor") SELECT "createdAt", "endDate", "id", "startDate", "status", "tags", "vendor" FROM "Offer";
DROP TABLE "Offer";
ALTER TABLE "new_Offer" RENAME TO "Offer";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
