-- CreateTable
CREATE TABLE "WebhookCommand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookCommand_secret_key" ON "WebhookCommand"("secret");

-- CreateIndex
CREATE INDEX "WebhookCommand_tenantId_idx" ON "WebhookCommand"("tenantId");

-- CreateIndex
CREATE INDEX "WebhookCommand_secret_idx" ON "WebhookCommand"("secret");

-- AddForeignKey
ALTER TABLE "WebhookCommand" ADD CONSTRAINT "WebhookCommand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
