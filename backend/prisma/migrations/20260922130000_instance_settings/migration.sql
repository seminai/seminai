-- Encrypted instance-wide settings (setup wizard, LLM provider, access, email).
CREATE TABLE "InstanceSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstanceSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstanceSetting_key_key" ON "InstanceSetting"("key");
