# CLAUDE.md — MixItUp Web SaaS Migration Playbook (Node + GCP)

This is the **single source of truth** for ClaudeCode execution in this repository.

---

## 1) Hard Constraints (Do Not Violate)

1. **No ASP.NET / no .NET backend runtime** for the SaaS system.
2. Backend stack is **Node.js + TypeScript**.
3. Infrastructure/deployment/security/scalability uses **Google Cloud Platform only**.
4. Keep legacy desktop code untouched unless explicitly requested.
5. All net-new SaaS work is under `saas/`.

---

## 2) Objective

Convert MixItUp from desktop-centric runtime to a cloud-native, OAuth-enabled, multi-tenant SaaS platform with:
- Web app
- Public API
- Async workers
- Provider integrations
- Migration path from existing desktop data

---

## 3) Current SaaS Scaffold Location

- `saas/apps/api` → NestJS API starter (Commands + Users modules)
- `saas/packages/db` → Prisma schema + SQL migration baseline
- `saas/infra/terraform` → GCP Terraform starter modules + `envs/dev`
- `saas/cloudbuild/ci.yaml` → CI pipeline starter
- `saas/package.json` / `saas/pnpm-workspace.yaml` / `saas/turbo.json` → monorepo tooling

---

## 4) Target Architecture (Required)

### Runtime
- Frontend: Next.js + TypeScript
- API: NestJS + Fastify
- Workers: Node.js services on Cloud Run

### GCP Services
- Cloud Run (api/workers/web)
- Cloud SQL Postgres
- Memorystore Redis
- Pub/Sub
- Cloud Tasks
- Secret Manager + KMS
- Cloud Build + Artifact Registry + Cloud Deploy
- Cloud Logging / Monitoring / Trace / Error Reporting
- Cloud Armor + HTTPS LB

---

## 5) Security & Auth Requirements

1. OAuth/OIDC Authorization Code + PKCE for users.
2. JWT bearer auth for API; mandatory scope checks on mutating endpoints.
3. Tenant isolation is mandatory (`tenant_id` context from verified auth claims).
4. No plaintext provider/client secrets in code or config files.
5. Store secrets in Secret Manager; use service account IAM least privilege.

---

## 6) Data Model Baseline (Already Added)

Current baseline entities in Prisma:
- `Tenant`
- `AppUser`
- `TenantMembership`
- `TenantUser`
- `Command`

Next required entities (planned):
- `Counter`
- `Currency`, `CurrencyLedger`
- `Inventory`, `InventoryItem`, `InventoryLedger`
- `IntegrationConnection`
- `Webhook`, `WebhookDelivery`
- `AuditEvent`

---

## 7) API Parity Plan (Initial)

### In Progress (scaffolded)
- `/api/v2/commands`
- `/api/v2/users`

### Next endpoints to add
- `/api/v2/status/version`
- `/api/v2/counters`
- `/api/v2/currency`
- `/api/v2/inventory`

All endpoints must support:
- RFC7807-like structured errors
- Pagination on list endpoints
- Validation via DTO/class-validator
- Tenant-scoped reads/writes only

---

## 8) Execution Order (ClaudeCode Must Follow)

1. Stabilize workspace toolchain (`pnpm`, `turbo`, lint/typecheck/test scripts).
2. Add robust auth module (OIDC JWT verification + scope guard + RBAC).
3. Replace header-based tenant fallback with claim-based tenant resolution.
4. Add API contracts (OpenAPI files under `openapi/`), then enforce contract tests.
5. Add DB migrations for counters/currency/inventory + ledger semantics.
6. Introduce Pub/Sub publisher in API and worker consumers.
7. Add Cloud Tasks for delayed/retry jobs.
8. Add connector abstraction for Twitch/YouTube/Trovo token lifecycle.
9. Add migration service for desktop `.miu3/.db3` imports.
10. Add full CI/CD and staged deploy automation (dev/stage/prod).

---

## 9) Definition of Done (Global)

A task is done only when:
1. Build/lint/typecheck/test pass in CI.
2. OpenAPI spec updated for API changes.
3. Authz/tenant isolation tests are included.
4. Observability added for the feature (logs + metrics at minimum).
5. No hardcoded secrets.
6. Rollback strategy documented in PR body.

---

## 10) Immediate Gaps to Fix Next

1. `UsersController` mapper currently uses `any`; replace with strict types.
2. Add `Status` module and health/version endpoints.
3. Add Prisma client provider module (single shared instance) instead of direct `PrismaClient` injection pattern.
4. Add structured exception filter for consistent error response shape.
5. Expand Terraform `envs/dev/main.tf` to compose all modules and IAM bindings.

---

## 11) Local Dev Commands (from `saas/`)

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

DB (once PostgreSQL is configured):
```bash
pnpm --filter @mixitup/db prisma:migrate
pnpm --filter @mixitup/db prisma:generate
```

API:
```bash
pnpm --filter @mixitup/api dev
```

---

## 12) Migration Policy

- Do not delete legacy desktop code during early migration.
- Build cloud parity first, then add migration tools, then cutover tenant-by-tenant.
- Cloud becomes source-of-truth only after reconciliation passes.

---

## 13) Ownership Notes

If direction conflicts between old docs and this file, **this file wins** for SaaS implementation decisions.
