CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "Tenant" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "AppUser" (
  "id" TEXT PRIMARY KEY,
  "subject" TEXT NOT NULL UNIQUE,
  "email" TEXT,
  "displayName" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "TenantMembership" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "AppUser"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("tenantId", "userId")
);

CREATE INDEX "idx_tenant_membership_tenant" ON "TenantMembership" ("tenantId");
CREATE INDEX "idx_tenant_membership_user" ON "TenantMembership" ("userId");

CREATE TABLE "TenantUser" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "platform" TEXT NOT NULL,
  "platformUserId" TEXT,
  "username" TEXT,
  "displayName" TEXT,
  "avatarLink" TEXT,
  "subscriberBadgeLink" TEXT,
  "roleBadgeLink" TEXT,
  "specialtyBadgeLink" TEXT,
  "lastActivity" TIMESTAMPTZ,
  "lastUpdated" TIMESTAMPTZ,
  "onlineViewingMinutes" INTEGER NOT NULL DEFAULT 0,
  "customTitle" TEXT,
  "isSpecialtyExcluded" BOOLEAN NOT NULL DEFAULT FALSE,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("tenantId", "platform", "platformUserId")
);

CREATE INDEX "idx_tenant_user_tenant_username" ON "TenantUser" ("tenantId", "username");
CREATE INDEX "idx_tenant_user_tenant_displayname" ON "TenantUser" ("tenantId", "displayName");

CREATE TABLE "Command" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "unlocked" BOOLEAN NOT NULL DEFAULT TRUE,
  "groupName" TEXT,
  "definition" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_command_tenant_name" ON "Command" ("tenantId", "name");
CREATE INDEX "idx_command_tenant_enabled" ON "Command" ("tenantId", "isEnabled");
