-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "qdcSyncEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "QdcAzienda" (
    "id" TEXT NOT NULL,
    "qdcId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "piva" TEXT,
    "cf" TEXT,
    "validaDa" TIMESTAMP(3),
    "validaA" TIMESTAMP(3),
    "companyId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QdcAzienda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QdcUnita" (
    "id" TEXT NOT NULL,
    "qdcAziendaId" TEXT NOT NULL,
    "qdcId" INTEGER NOT NULL,
    "anno" INTEGER NOT NULL,
    "coltura" TEXT,
    "varieta" TEXT,
    "superficie" DOUBLE PRECISION,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QdcUnita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QdcOperazione" (
    "id" TEXT NOT NULL,
    "qdcAziendaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "qdcId" INTEGER NOT NULL,
    "dataOperazione" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QdcOperazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QdcGiacenza" (
    "id" TEXT NOT NULL,
    "qdcAziendaId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "prodotto" TEXT NOT NULL,
    "qta" DOUBLE PRECISION,
    "udm" TEXT,
    "raw" JSONB NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QdcGiacenza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QdcScadenza" (
    "id" TEXT NOT NULL,
    "qdcAziendaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QdcScadenza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QdcSyncRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "counters" JSONB,
    "error" TEXT,

    CONSTRAINT "QdcSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QdcAzienda_qdcId_key" ON "QdcAzienda"("qdcId");

-- CreateIndex
CREATE INDEX "QdcAzienda_companyId_idx" ON "QdcAzienda"("companyId");

-- CreateIndex
CREATE INDEX "QdcAzienda_piva_idx" ON "QdcAzienda"("piva");

-- CreateIndex
CREATE INDEX "QdcUnita_qdcAziendaId_idx" ON "QdcUnita"("qdcAziendaId");

-- CreateIndex
CREATE UNIQUE INDEX "QdcUnita_qdcAziendaId_anno_qdcId_key" ON "QdcUnita"("qdcAziendaId", "anno", "qdcId");

-- CreateIndex
CREATE INDEX "QdcOperazione_qdcAziendaId_tipo_idx" ON "QdcOperazione"("qdcAziendaId", "tipo");

-- CreateIndex
CREATE INDEX "QdcOperazione_dataOperazione_idx" ON "QdcOperazione"("dataOperazione");

-- CreateIndex
CREATE UNIQUE INDEX "QdcOperazione_qdcAziendaId_tipo_qdcId_key" ON "QdcOperazione"("qdcAziendaId", "tipo", "qdcId");

-- CreateIndex
CREATE INDEX "QdcGiacenza_qdcAziendaId_categoria_idx" ON "QdcGiacenza"("qdcAziendaId", "categoria");

-- CreateIndex
CREATE INDEX "QdcScadenza_qdcAziendaId_tipo_idx" ON "QdcScadenza"("qdcAziendaId", "tipo");

-- CreateIndex
CREATE INDEX "QdcSyncRun_status_idx" ON "QdcSyncRun"("status");

-- CreateIndex
CREATE INDEX "QdcSyncRun_startedAt_idx" ON "QdcSyncRun"("startedAt");

-- AddForeignKey
ALTER TABLE "QdcAzienda" ADD CONSTRAINT "QdcAzienda_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdcUnita" ADD CONSTRAINT "QdcUnita_qdcAziendaId_fkey" FOREIGN KEY ("qdcAziendaId") REFERENCES "QdcAzienda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdcOperazione" ADD CONSTRAINT "QdcOperazione_qdcAziendaId_fkey" FOREIGN KEY ("qdcAziendaId") REFERENCES "QdcAzienda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdcGiacenza" ADD CONSTRAINT "QdcGiacenza_qdcAziendaId_fkey" FOREIGN KEY ("qdcAziendaId") REFERENCES "QdcAzienda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdcScadenza" ADD CONSTRAINT "QdcScadenza_qdcAziendaId_fkey" FOREIGN KEY ("qdcAziendaId") REFERENCES "QdcAzienda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
