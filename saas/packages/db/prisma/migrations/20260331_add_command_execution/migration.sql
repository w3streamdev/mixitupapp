-- CreateTable
CREATE TABLE "CommandExecution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "platform" TEXT,
    "userId" TEXT,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommandExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommandExecution_tenantId_createdAt_idx" ON "CommandExecution"("tenantId", "createdAt");
CREATE INDEX "CommandExecution_tenantId_commandId_idx" ON "CommandExecution"("tenantId", "commandId");
CREATE INDEX "CommandExecution_commandId_status_idx" ON "CommandExecution"("commandId", "status");
