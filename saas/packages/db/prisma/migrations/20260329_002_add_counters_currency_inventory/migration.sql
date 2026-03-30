-- Counter
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "resetAmount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Counter_tenantId_name_key" ON "Counter"("tenantId", "name");
CREATE INDEX "Counter_tenantId_idx" ON "Counter"("tenantId");
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Currency
CREATE TABLE "Currency" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "acquireAmount" INTEGER NOT NULL DEFAULT 1,
    "acquireInterval" INTEGER NOT NULL DEFAULT 60,
    "maxAmount" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Currency_tenantId_name_key" ON "Currency"("tenantId", "name");
CREATE INDEX "Currency_tenantId_idx" ON "Currency"("tenantId");
ALTER TABLE "Currency" ADD CONSTRAINT "Currency_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CurrencyLedger
CREATE TABLE "CurrencyLedger" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "currencyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CurrencyLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CurrencyLedger_currencyId_userId_key" ON "CurrencyLedger"("currencyId", "userId");
CREATE INDEX "CurrencyLedger_currencyId_idx" ON "CurrencyLedger"("currencyId");
CREATE INDEX "CurrencyLedger_userId_idx" ON "CurrencyLedger"("userId");
ALTER TABLE "CurrencyLedger" ADD CONSTRAINT "CurrencyLedger_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Inventory
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultMaxAmount" INTEGER NOT NULL DEFAULT -1,
    "shopEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shopCurrencyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Inventory_tenantId_name_key" ON "Inventory"("tenantId", "name");
CREATE INDEX "Inventory_tenantId_idx" ON "Inventory"("tenantId");
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- InventoryItem
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "inventoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxAmount" INTEGER NOT NULL DEFAULT -1,
    "shopBuyPrice" INTEGER NOT NULL DEFAULT 0,
    "shopSellPrice" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryItem_inventoryId_name_key" ON "InventoryItem"("inventoryId", "name");
CREATE INDEX "InventoryItem_inventoryId_idx" ON "InventoryItem"("inventoryId");
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- InventoryLedger
CREATE TABLE "InventoryLedger" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryLedger_itemId_userId_key" ON "InventoryLedger"("itemId", "userId");
CREATE INDEX "InventoryLedger_itemId_idx" ON "InventoryLedger"("itemId");
CREATE INDEX "InventoryLedger_userId_idx" ON "InventoryLedger"("userId");
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- IntegrationConnection
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "platformUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationConnection_tenantId_platform_key" ON "IntegrationConnection"("tenantId", "platform");
CREATE INDEX "IntegrationConnection_tenantId_idx" ON "IntegrationConnection"("tenantId");
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Webhook
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Webhook_tenantId_idx" ON "Webhook"("tenantId");
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WebhookDelivery
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "requestBody" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");
CREATE INDEX "WebhookDelivery_webhookId_event_idx" ON "WebhookDelivery"("webhookId", "event");
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AuditEvent
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt");
CREATE INDEX "AuditEvent_tenantId_entityType_entityId_idx" ON "AuditEvent"("tenantId", "entityType", "entityId");
CREATE INDEX "AuditEvent_tenantId_action_idx" ON "AuditEvent"("tenantId", "action");
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
