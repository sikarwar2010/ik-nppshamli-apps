-- CreateEnum
CREATE TYPE "AttachmentStorageStatus" AS ENUM ('PENDING_MIGRATION', 'AVAILABLE', 'FAILED');

-- AlterTable
ALTER TABLE "import_error" ADD COLUMN     "sheet" TEXT;

-- AlterTable
ALTER TABLE "import_job" ADD COLUMN     "report" JSONB;

-- AlterTable
ALTER TABLE "survey" ADD COLUMN     "assessmentYear" TEXT,
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "oldPropertyNo" TEXT,
ADD COLUMN     "propertyType" TEXT,
ADD COLUMN     "sourceRowNumber" INTEGER,
ADD COLUMN     "sourceStatus" TEXT,
ADD COLUMN     "surveyorName" TEXT;

-- AlterTable
ALTER TABLE "survey_attachment" ADD COLUMN     "checksumSha256" TEXT,
ADD COLUMN     "imageType" TEXT,
ADD COLUMN     "importJobId" TEXT,
ADD COLUMN     "migratedAt" TIMESTAMP(3),
ADD COLUMN     "migrationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "migrationError" TEXT,
ADD COLUMN     "sourceRowNumber" INTEGER,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "storageStatus" "AttachmentStorageStatus" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "survey_importJobId_idx" ON "survey"("importJobId");

-- CreateIndex
CREATE INDEX "survey_attachment_storageStatus_idx" ON "survey_attachment"("storageStatus");

-- CreateIndex
CREATE UNIQUE INDEX "survey_attachment_surveyId_sourceUrl_key" ON "survey_attachment"("surveyId", "sourceUrl");

