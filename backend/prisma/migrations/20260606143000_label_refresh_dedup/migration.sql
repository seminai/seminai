-- CreateEnum
CREATE TYPE "LabelRefreshStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LabelHistoryActor" AS ENUM ('USER', 'SYSTEM');

-- AlterTable
ALTER TABLE "LabelExtraction"
ADD COLUMN "normalizedProductName" TEXT,
ADD COLUMN "normalizedRegistrationNumber" TEXT,
ADD COLUMN "sourcePdfHash" TEXT,
ADD COLUMN "rawTextHash" TEXT,
ADD COLUMN "officialSourceUrl" TEXT,
ADD COLUMN "lastRefreshedAt" TIMESTAMP(3),
ADD COLUMN "lastRefreshStatus" "LabelRefreshStatus",
ADD COLUMN "lastRefreshError" TEXT,
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedReason" TEXT,
ADD COLUMN "canonicalLabelExtractionId" TEXT;

-- AlterTable
ALTER TABLE "LabelHistory"
ADD COLUMN "actorType" "LabelHistoryActor" NOT NULL DEFAULT 'USER',
ADD COLUMN "actorLabel" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "LabelAlias" (
  "id" TEXT NOT NULL,
  "labelExtractionId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "registrationNumber" TEXT NOT NULL,
  "category" "LabelCategory" NOT NULL DEFAULT 'FITO',
  "normalizedProductName" TEXT NOT NULL,
  "normalizedRegistrationNumber" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabelAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LabelAlias_category_normalizedProductName_normalizedRegistrationNumber_key"
ON "LabelAlias"("category", "normalizedProductName", "normalizedRegistrationNumber");

-- Backfill normalized keys.
UPDATE "LabelExtraction"
SET
  "normalizedProductName" = lower(regexp_replace(trim("productName"), '\s+', ' ', 'g')),
  "normalizedRegistrationNumber" = NULLIF(
    ltrim(regexp_replace(coalesce("registrationNumber", ''), '\D', '', 'g'), '0'),
    ''
  ),
  "rawTextHash" = md5(coalesce("rawText", ''));

-- Archive existing FITO duplicates by normalized registration number.
WITH ranked AS (
  SELECT
    "id",
    first_value("id") OVER label_rank AS canonical_id,
    row_number() OVER label_rank AS row_number
  FROM "LabelExtraction"
  WHERE
    "category" = 'FITO'
    AND "normalizedRegistrationNumber" IS NOT NULL
  WINDOW label_rank AS (
    PARTITION BY "category", "normalizedRegistrationNumber"
    ORDER BY
      "isVerified" DESC,
      "extractionConfidence" DESC,
      coalesce(
        jsonb_array_length(
          CASE
            WHEN jsonb_typeof("label"->'dosaggi_dettagliati') = 'array'
            THEN "label"->'dosaggi_dettagliati'
            ELSE '[]'::jsonb
          END
        ),
        0
      ) DESC,
      coalesce(
        jsonb_array_length(
          CASE
            WHEN jsonb_typeof("label"->'colture_target') = 'array'
            THEN "label"->'colture_target'
            ELSE '[]'::jsonb
          END
        ),
        0
      ) DESC,
      length(coalesce("rawText", '')) DESC,
      "updatedAt" DESC
  )
)
UPDATE "LabelExtraction" label
SET
  "isArchived" = true,
  "archivedAt" = CURRENT_TIMESTAMP,
  "archivedReason" = 'duplicate_registration_number',
  "canonicalLabelExtractionId" = ranked.canonical_id
FROM ranked
WHERE label."id" = ranked."id" AND ranked.row_number > 1;

-- Preserve all product-name aliases, including archived duplicate rows.
INSERT INTO "LabelAlias" (
  "id",
  "labelExtractionId",
  "productName",
  "registrationNumber",
  "category",
  "normalizedProductName",
  "normalizedRegistrationNumber"
)
SELECT
  md5(label."id" || ':alias'),
  coalesce(label."canonicalLabelExtractionId", label."id"),
  label."productName",
  label."registrationNumber",
  label."category",
  coalesce(label."normalizedProductName", lower(regexp_replace(trim(label."productName"), '\s+', ' ', 'g'))),
  label."normalizedRegistrationNumber"
FROM "LabelExtraction" label
ON CONFLICT DO NOTHING;

-- Repoint product summaries that referenced archived labels.
UPDATE "Product" product
SET "labelMetadata" = jsonb_set(
  product."labelMetadata"::jsonb,
  '{labelExtractionId}',
  to_jsonb(label."canonicalLabelExtractionId")
)
FROM "LabelExtraction" label
WHERE
  label."isArchived" = true
  AND label."canonicalLabelExtractionId" IS NOT NULL
  AND product."labelMetadata" IS NOT NULL
  AND product."labelMetadata"->>'labelExtractionId' = label."id";

-- CreateIndex
CREATE INDEX "LabelAlias_labelExtractionId_idx" ON "LabelAlias"("labelExtractionId");
CREATE INDEX "LabelAlias_normalizedProductName_idx" ON "LabelAlias"("normalizedProductName");
CREATE INDEX "LabelAlias_normalizedRegistrationNumber_idx" ON "LabelAlias"("normalizedRegistrationNumber");
CREATE INDEX "LabelExtraction_normalizedProductName_idx" ON "LabelExtraction"("normalizedProductName");
CREATE INDEX "LabelExtraction_normalizedRegistrationNumber_idx" ON "LabelExtraction"("normalizedRegistrationNumber");
CREATE INDEX "LabelExtraction_category_normalizedRegistrationNumber_idx"
ON "LabelExtraction"("category", "normalizedRegistrationNumber");
CREATE INDEX "LabelExtraction_isArchived_idx" ON "LabelExtraction"("isArchived");
CREATE INDEX "LabelExtraction_lastRefreshedAt_idx" ON "LabelExtraction"("lastRefreshedAt");
CREATE INDEX "LabelExtraction_canonicalLabelExtractionId_idx"
ON "LabelExtraction"("canonicalLabelExtractionId");
CREATE INDEX "LabelHistory_actorType_idx" ON "LabelHistory"("actorType");

-- Active FITO labels can only have one canonical row per ministerial registration.
CREATE UNIQUE INDEX "label_extraction_fito_reg_unique"
ON "LabelExtraction" ("category", "normalizedRegistrationNumber")
WHERE
  "isArchived" = false
  AND "normalizedRegistrationNumber" IS NOT NULL
  AND "category" = 'FITO';

-- AddForeignKey
ALTER TABLE "LabelExtraction"
ADD CONSTRAINT "LabelExtraction_canonicalLabelExtractionId_fkey"
FOREIGN KEY ("canonicalLabelExtractionId") REFERENCES "LabelExtraction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LabelAlias"
ADD CONSTRAINT "LabelAlias_labelExtractionId_fkey"
FOREIGN KEY ("labelExtractionId") REFERENCES "LabelExtraction"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
