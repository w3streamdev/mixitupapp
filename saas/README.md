# w3StreamItUp SaaS (Node + GCP)

Cloud-native, multi-tenant streaming platform API built with NestJS, Prisma, and Google Cloud Platform.

## Quick Start (Local Dev)

```bash
cd saas/
pnpm install
pnpm --filter @mixitup/db prisma:generate

# Run all checks
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# Start API dev server (port 8080)
pnpm --filter @mixitup/api dev
```

## Architecture

```
saas/
├── apps/
│   ├── api/          NestJS + Fastify REST API (Cloud Run)
│   └── worker/       Pub/Sub consumer workers (Cloud Run)
├── packages/
│   └── db/           Prisma schema + migrations (Cloud SQL Postgres)
├── infra/terraform/  IaC for GCP (dev/staging/prod)
├── cloudbuild/       CI/CD pipeline configs
└── openapi/          OpenAPI v2 spec
```

## Deployment Guide

### Prerequisites

1. **GCP Project** with billing enabled
2. **gcloud CLI** authenticated (`gcloud auth login`)
3. **Terraform** >= 1.7.0 installed
4. **Node.js** >= 22, **pnpm** >= 10

### Step 1: Create GCP Infrastructure

```bash
cd saas/infra/terraform/envs/dev
terraform init
terraform plan -var="project_id=YOUR_PROJECT_ID"
terraform apply -var="project_id=YOUR_PROJECT_ID"
```

This provisions:
- Cloud SQL Postgres 16 instance
- Memorystore Redis 7.0 (HA)
- Artifact Registry (Docker)
- Pub/Sub topics + subscriptions
- Cloud Tasks queues
- Secret Manager secrets (empty -- you populate them)
- Cloud Run services (API + Worker)
- IAM service accounts with least-privilege bindings

### Step 2: Populate Secrets

```bash
PROJECT_ID=YOUR_PROJECT_ID

# Database URL (get from Cloud SQL instance)
echo -n "postgresql://user:pass@/mixitup?host=/cloudsql/PROJECT:REGION:mixitup-pg-dev" | \
  gcloud secrets versions add database-url --data-file=- --project=$PROJECT_ID

# Redis URL (get from Memorystore instance)
echo -n "redis://REDIS_IP:6379" | \
  gcloud secrets versions add redis-url --data-file=- --project=$PROJECT_ID

# OIDC config (your identity provider)
echo -n "https://your-idp.example.com" | \
  gcloud secrets versions add oidc-issuer --data-file=- --project=$PROJECT_ID

echo -n "your-api-audience" | \
  gcloud secrets versions add oidc-audience --data-file=- --project=$PROJECT_ID

echo -n "https://your-idp.example.com/.well-known/jwks.json" | \
  gcloud secrets versions add oidc-jwks-uri --data-file=- --project=$PROJECT_ID

# Platform credentials (Twitch, YouTube, Trovo)
echo -n "your-twitch-client-id" | \
  gcloud secrets versions add twitch-client-id --data-file=- --project=$PROJECT_ID
# ... repeat for each secret
```

### Step 3: Run Database Migrations

```bash
# Set DATABASE_URL to your Cloud SQL connection string
export DATABASE_URL="postgresql://..."
cd saas/
pnpm --filter @mixitup/db prisma:deploy
```

### Step 4: Build & Push Container Images

```bash
PROJECT_ID=YOUR_PROJECT_ID
REGION=us-central1

# Build API
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/mixitup-services/api:latest \
  -f apps/api/Dockerfile .

# Build Worker
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/mixitup-services/worker:latest \
  -f apps/worker/Dockerfile .

# Push
docker push $REGION-docker.pkg.dev/$PROJECT_ID/mixitup-services/api:latest
docker push $REGION-docker.pkg.dev/$PROJECT_ID/mixitup-services/worker:latest
```

### Step 5: Deploy to Cloud Run

```bash
# Deploy API
gcloud run deploy mixitup-api-dev \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/mixitup-services/api:latest \
  --region=$REGION \
  --service-account=mixitup-api-dev@$PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars="NODE_ENV=development,GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --platform=managed

# Deploy Worker
gcloud run deploy mixitup-worker-dev \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/mixitup-services/worker:latest \
  --region=$REGION \
  --service-account=mixitup-worker-dev@$PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars="NODE_ENV=development,GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --platform=managed
```

### Step 6: Verify

```bash
# Get the API URL
API_URL=$(gcloud run services describe mixitup-api-dev --region=$REGION --format='value(status.url)')

# Health check (no auth required)
curl $API_URL/api/v2/status/health

# Version check (no auth required)
curl $API_URL/api/v2/status/version

# Swagger docs
open $API_URL/docs
```

## CI/CD Pipelines

| Pipeline | Trigger | File |
|---|---|---|
| CI (lint/test/build) | All pushes | `cloudbuild/ci.yaml` |
| Deploy Dev | Push to `main` | `cloudbuild/deploy-dev.yaml` |
| Deploy Staging | Push to `release/*` | `cloudbuild/deploy-staging.yaml` |
| Deploy Prod | Git tag `v*` | `cloudbuild/deploy-prod.yaml` |

### Setting Up Cloud Build Triggers

```bash
# CI on all pushes
gcloud builds triggers create github \
  --repo-name=mixitupapp --repo-owner=w3streamdev \
  --branch-pattern=".*" \
  --build-config=saas/cloudbuild/ci.yaml

# Deploy dev on main
gcloud builds triggers create github \
  --repo-name=mixitupapp --repo-owner=w3streamdev \
  --branch-pattern="^main$" \
  --build-config=saas/cloudbuild/deploy-dev.yaml

# Deploy staging on release branches
gcloud builds triggers create github \
  --repo-name=mixitupapp --repo-owner=w3streamdev \
  --branch-pattern="^release/.*" \
  --build-config=saas/cloudbuild/deploy-staging.yaml

# Deploy prod on version tags (canary)
gcloud builds triggers create github \
  --repo-name=mixitupapp --repo-owner=w3streamdev \
  --tag-pattern="^v.*" \
  --build-config=saas/cloudbuild/deploy-prod.yaml
```

### Production Canary Promotion

The prod pipeline deploys a canary revision with 25% traffic. To promote to 100%:

```bash
gcloud run services update-traffic mixitup-api-prod \
  --to-latest --region=us-central1
```

To rollback:

```bash
gcloud run services update-traffic mixitup-api-prod \
  --to-tags=canary=0 --region=us-central1
```

## Environment Configuration

All secrets are stored in **Secret Manager** (never in env files or code).

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | Cloud SQL Postgres connection string | Yes |
| `REDIS_URL` | Memorystore Redis URL | Yes |
| `OIDC_ISSUER` | OIDC identity provider issuer URL | Yes (prod) |
| `OIDC_AUDIENCE` | Expected JWT audience | Yes (prod) |
| `OIDC_JWKS_URI` | JWKS endpoint for JWT verification | Yes (prod) |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | Yes |
| `GOOGLE_CLOUD_LOCATION` | GCP region | Yes |
| `TWITCH_CLIENT_ID` | Twitch OAuth app client ID | For Twitch |
| `TWITCH_CLIENT_SECRET` | Twitch OAuth app client secret | For Twitch |
| `YOUTUBE_CLIENT_ID` | YouTube/Google OAuth client ID | For YouTube |
| `YOUTUBE_CLIENT_SECRET` | YouTube/Google OAuth client secret | For YouTube |
| `TROVO_CLIENT_ID` | Trovo OAuth app client ID | For Trovo |
| `TROVO_CLIENT_SECRET` | Trovo OAuth app client secret | For Trovo |

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v2/status/health` | Public | Health check |
| GET | `/api/v2/status/version` | Public | Version info |
| GET | `/api/v2/commands` | `commands:read` | List commands |
| GET | `/api/v2/commands/:id` | `commands:read` | Get command |
| PATCH | `/api/v2/commands/:id/state/:s` | `commands:write` | Toggle command |
| POST | `/api/v2/commands/:id` | `commands:write` | Run command |
| GET | `/api/v2/users` | `users:read` | List users |
| GET | `/api/v2/users/:id` | `users:read` | Get user |
| POST | `/api/v2/users/add` | `users:write` | Add user |
| DELETE | `/api/v2/users/:id` | `users:write` | Delete user |
| GET | `/api/v2/counters` | `counters:read` | List counters |
| GET | `/api/v2/counters/:id` | `counters:read` | Get counter |
| POST | `/api/v2/counters` | `counters:write` | Create counter |
| PATCH | `/api/v2/counters/:id` | `counters:write` | Update counter |
| PATCH | `/api/v2/counters/:id/increment/:n` | `counters:write` | Increment |
| PATCH | `/api/v2/counters/:id/reset` | `counters:write` | Reset counter |
| DELETE | `/api/v2/counters/:id` | `counters:write` | Delete counter |
| GET | `/api/v2/currency` | `currency:read` | List currencies |
| GET | `/api/v2/currency/:id` | `currency:read` | Get currency |
| POST | `/api/v2/currency` | `currency:write` | Create currency |
| GET | `/api/v2/currency/:id/user/:uid` | `currency:read` | Get balance |
| PATCH | `/api/v2/currency/:id/user/:uid/adjust` | `currency:write` | Adjust balance |
| DELETE | `/api/v2/currency/:id` | `currency:write` | Delete currency |
| GET | `/api/v2/inventory` | `inventory:read` | List inventories |
| GET | `/api/v2/inventory/:id` | `inventory:read` | Get inventory |
| POST | `/api/v2/inventory` | `inventory:write` | Create inventory |
| DELETE | `/api/v2/inventory/:id` | `inventory:write` | Delete inventory |
| GET | `/api/v2/inventory/:id/items` | `inventory:read` | List items |
| POST | `/api/v2/inventory/:id/items` | `inventory:write` | Create item |
| POST | `/api/v2/migration/import` | `owner`/`admin` | Import desktop data |
| GET | `/api/v2/migration/status/:id` | `owner`/`admin` | Import job status |
| POST | `/api/v2/migration/reconcile` | `owner`/`admin` | Reconcile counts |

Full OpenAPI spec: `openapi/v2.yaml`
