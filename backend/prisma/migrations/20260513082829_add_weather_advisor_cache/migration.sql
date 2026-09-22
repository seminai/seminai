-- CreateTable
CREATE TABLE "WeatherAdvisorCache" (
    "id" TEXT NOT NULL,
    "contextHash" TEXT NOT NULL,
    "thresholds" JSONB NOT NULL,
    "reasoning" TEXT,
    "confidence" TEXT NOT NULL,
    "sourceModel" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeatherAdvisorCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeatherAdvisorCache_contextHash_key" ON "WeatherAdvisorCache"("contextHash");

-- CreateIndex
CREATE INDEX "WeatherAdvisorCache_contextHash_idx" ON "WeatherAdvisorCache"("contextHash");
