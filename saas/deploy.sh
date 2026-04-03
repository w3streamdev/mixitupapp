#!/usr/bin/env bash
###############################################################################
# w3StreamItUp SaaS — One-Shot Deploy Script (GCP)
#
# This script provisions ALL infrastructure and deploys the full SaaS stack
# to Google Cloud Platform. It uses gcloud directly (no Terraform needed).
#
# Prerequisites:
#   1. Run: gcloud auth login
#   2. Run: ./deploy.sh <PROJECT_ID> [REGION]
#
# Example:
#   ./deploy.sh connect3-391119 us-central1
###############################################################################
set -euo pipefail

# ─── Args ────────────────────────────────────────────────────────────────────
PROJECT_ID="${1:?Usage: ./deploy.sh <PROJECT_ID> [REGION]}"
REGION="${2:-us-central1}"
ENV_NAME="dev"

# ─── Derived names ───────────────────────────────────────────────────────────
REPO_NAME="mixitup-services"
SQL_INSTANCE="mixitup-pg-${ENV_NAME}"
DB_NAME="mixitup"
DB_USER="mixitup"
DB_PASS="$(openssl rand -base64 24 | tr -d '=/+')"
REDIS_NAME="mixitup-redis-${ENV_NAME}"
API_SERVICE="mixitup-api-${ENV_NAME}"
WORKER_SERVICE="mixitup-worker-${ENV_NAME}"
API_SA="mixitup-api-${ENV_NAME}"
WORKER_SA="mixitup-worker-${ENV_NAME}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }
step() { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

# ─── Pre-flight checks ──────────────────────────────────────────────────────
step "Pre-flight checks"

if ! command -v gcloud &>/dev/null; then
  err "gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

if ! command -v docker &>/dev/null; then
  err "Docker not found."
  exit 1
fi

# Check auth
ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || true)
if [[ -z "$ACCOUNT" ]]; then
  err "Not authenticated. Run: gcloud auth login"
  exit 1
fi
log "Authenticated as: $ACCOUNT"

# Set project
gcloud config set project "$PROJECT_ID" --quiet
log "Project: $PROJECT_ID | Region: $REGION"

# ─── Enable required APIs ───────────────────────────────────────────────────
step "Enabling GCP APIs (this takes a minute)"

APIS=(
  "run.googleapis.com"
  "sqladmin.googleapis.com"
  "redis.googleapis.com"
  "pubsub.googleapis.com"
  "secretmanager.googleapis.com"
  "cloudtasks.googleapis.com"
  "cloudbuild.googleapis.com"
  "artifactregistry.googleapis.com"
  "iam.googleapis.com"
  "compute.googleapis.com"
  "vpcaccess.googleapis.com"
)

for api in "${APIS[@]}"; do
  gcloud services enable "$api" --project="$PROJECT_ID" --quiet 2>/dev/null && log "Enabled $api" || warn "Could not enable $api (may already be enabled)"
done

# ─── Artifact Registry ──────────────────────────────────────────────────────
step "Creating Artifact Registry repository"

if gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  log "Repository $REPO_NAME already exists"
else
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --quiet
  log "Created repository: $REPO_NAME"
fi

# Configure Docker auth for Artifact Registry
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet 2>/dev/null
log "Docker configured for Artifact Registry"

# ─── Cloud SQL Postgres ──────────────────────────────────────────────────────
step "Provisioning Cloud SQL (PostgreSQL 16)"

if gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" &>/dev/null; then
  log "SQL instance $SQL_INSTANCE already exists"
else
  warn "Creating Cloud SQL instance (this takes 5-10 minutes)..."
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 \
    --edition=ENTERPRISE \
    --tier=db-f1-micro \
    --region="$REGION" \
    --storage-type=SSD \
    --storage-size=10GB \
    --backup-start-time="03:00" \
    --enable-point-in-time-recovery \
    --project="$PROJECT_ID" \
    --quiet
  log "Created SQL instance: $SQL_INSTANCE"
fi

# Create database
gcloud sql databases create "$DB_NAME" \
  --instance="$SQL_INSTANCE" \
  --project="$PROJECT_ID" \
  --quiet 2>/dev/null && log "Created database: $DB_NAME" || log "Database $DB_NAME already exists"

# Create user
gcloud sql users create "$DB_USER" \
  --instance="$SQL_INSTANCE" \
  --password="$DB_PASS" \
  --project="$PROJECT_ID" \
  --quiet 2>/dev/null && log "Created DB user: $DB_USER" || warn "DB user $DB_USER may already exist (password unchanged)"

# Get connection name
SQL_CONNECTION_NAME=$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" --format="value(connectionName)")
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?host=/cloudsql/${SQL_CONNECTION_NAME}"
log "SQL connection: $SQL_CONNECTION_NAME"

# ─── Memorystore Redis ──────────────────────────────────────────────────────
step "Provisioning Memorystore Redis"

if gcloud redis instances describe "$REDIS_NAME" --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  log "Redis instance $REDIS_NAME already exists"
  REDIS_HOST=$(gcloud redis instances describe "$REDIS_NAME" --region="$REGION" --project="$PROJECT_ID" --format="value(host)")
else
  warn "Creating Redis instance (takes 3-5 minutes)..."
  gcloud redis instances create "$REDIS_NAME" \
    --size=1 \
    --region="$REGION" \
    --redis-version=redis_7_0 \
    --project="$PROJECT_ID" \
    --quiet
  REDIS_HOST=$(gcloud redis instances describe "$REDIS_NAME" --region="$REGION" --project="$PROJECT_ID" --format="value(host)")
  log "Created Redis: $REDIS_NAME at $REDIS_HOST"
fi
REDIS_URL="redis://${REDIS_HOST}:6379"

# ─── Pub/Sub Topics & Subscriptions ─────────────────────────────────────────
step "Creating Pub/Sub topics and subscriptions"

TOPICS=("command-runs" "webhook-deliveries" "audit-events")
for topic in "${TOPICS[@]}"; do
  gcloud pubsub topics create "$topic" --project="$PROJECT_ID" --quiet 2>/dev/null \
    && log "Created topic: $topic" \
    || log "Topic $topic already exists"

  gcloud pubsub subscriptions create "${topic}-sub" \
    --topic="$topic" \
    --ack-deadline=30 \
    --project="$PROJECT_ID" \
    --quiet 2>/dev/null \
    && log "Created subscription: ${topic}-sub" \
    || log "Subscription ${topic}-sub already exists"
done

# ─── Cloud Tasks Queues ─────────────────────────────────────────────────────
step "Creating Cloud Tasks queues"

QUEUES=("command-runs" "webhook-deliveries")
for queue in "${QUEUES[@]}"; do
  gcloud tasks queues create "$queue" \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --quiet 2>/dev/null \
    && log "Created queue: $queue" \
    || log "Queue $queue already exists"
done

# ─── Secret Manager ─────────────────────────────────────────────────────────
step "Storing secrets in Secret Manager"

store_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    echo -n "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID" --quiet
    log "Updated secret: $name"
  else
    echo -n "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic --project="$PROJECT_ID" --quiet
    log "Created secret: $name"
  fi
}

store_secret "database-url" "$DATABASE_URL"
store_secret "redis-url" "$REDIS_URL"

# Placeholder secrets for OIDC (you'll update these when you set up your auth provider)
for secret_name in "oidc-issuer" "oidc-audience" "oidc-jwks-uri"; do
  if ! gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &>/dev/null; then
    echo -n "PLACEHOLDER" | gcloud secrets create "$secret_name" --data-file=- --replication-policy=automatic --project="$PROJECT_ID" --quiet
    warn "Created placeholder secret: $secret_name (update when you configure OAuth)"
  fi
done

# ─── Service Accounts + IAM ─────────────────────────────────────────────────
step "Setting up service accounts and IAM"

# API service account
gcloud iam service-accounts create "$API_SA" \
  --display-name="w3StreamItUp API ($ENV_NAME)" \
  --project="$PROJECT_ID" --quiet 2>/dev/null \
  && log "Created SA: $API_SA" || log "SA $API_SA already exists"

API_SA_EMAIL="${API_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

API_ROLES=(
  "roles/cloudsql.client"
  "roles/pubsub.publisher"
  "roles/secretmanager.secretAccessor"
  "roles/cloudtasks.enqueuer"
  "roles/logging.logWriter"
  "roles/cloudtrace.agent"
  "roles/monitoring.metricWriter"
)

for role in "${API_ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${API_SA_EMAIL}" \
    --role="$role" \
    --condition=None \
    --quiet 2>/dev/null
done
log "IAM roles bound for API SA"

# Worker service account
gcloud iam service-accounts create "$WORKER_SA" \
  --display-name="w3StreamItUp Worker ($ENV_NAME)" \
  --project="$PROJECT_ID" --quiet 2>/dev/null \
  && log "Created SA: $WORKER_SA" || log "SA $WORKER_SA already exists"

WORKER_SA_EMAIL="${WORKER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

WORKER_ROLES=(
  "roles/cloudsql.client"
  "roles/pubsub.subscriber"
  "roles/secretmanager.secretAccessor"
  "roles/logging.logWriter"
  "roles/cloudtrace.agent"
  "roles/monitoring.metricWriter"
)

for role in "${WORKER_ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${WORKER_SA_EMAIL}" \
    --role="$role" \
    --condition=None \
    --quiet 2>/dev/null
done
log "IAM roles bound for Worker SA"

# ─── Build Docker Images ────────────────────────────────────────────────────
step "Building Docker images"

IMAGE_TAG="$(date +%Y%m%d-%H%M%S)"
API_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/api"
WORKER_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/worker"

log "Building API image..."
docker build \
  -t "${API_IMAGE}:${IMAGE_TAG}" \
  -t "${API_IMAGE}:latest" \
  -f "${SCRIPT_DIR}/apps/api/Dockerfile" \
  "${SCRIPT_DIR}" 2>&1 | tail -5

log "Building Worker image..."
docker build \
  -t "${WORKER_IMAGE}:${IMAGE_TAG}" \
  -t "${WORKER_IMAGE}:latest" \
  -f "${SCRIPT_DIR}/apps/worker/Dockerfile" \
  "${SCRIPT_DIR}" 2>&1 | tail -5

# ─── Push Docker Images ─────────────────────────────────────────────────────
step "Pushing images to Artifact Registry"

docker push "${API_IMAGE}:${IMAGE_TAG}"
docker push "${API_IMAGE}:latest"
log "Pushed API image"

docker push "${WORKER_IMAGE}:${IMAGE_TAG}"
docker push "${WORKER_IMAGE}:latest"
log "Pushed Worker image"

# ─── Run Database Migrations ────────────────────────────────────────────────
step "Running database migrations"

# Use Cloud SQL Auth Proxy for migration
warn "Downloading Cloud SQL Auth Proxy..."
if [[ ! -f /tmp/cloud-sql-proxy ]]; then
  curl -sSL "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.3/cloud-sql-proxy.linux.amd64" -o /tmp/cloud-sql-proxy
  chmod +x /tmp/cloud-sql-proxy
fi

# Start proxy in background
/tmp/cloud-sql-proxy "$SQL_CONNECTION_NAME" --port=5433 --quiet &
PROXY_PID=$!
sleep 3

# Run migration
MIGRATION_DB_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5433/${DB_NAME}"
cd "${SCRIPT_DIR}/packages/db"
DATABASE_URL="$MIGRATION_DB_URL" npx prisma migrate deploy 2>&1
log "Database migrations applied"

# Stop proxy
kill $PROXY_PID 2>/dev/null || true
cd "${SCRIPT_DIR}"

# ─── Deploy to Cloud Run ────────────────────────────────────────────────────
step "Deploying API to Cloud Run"

gcloud run deploy "$API_SERVICE" \
  --image="${API_IMAGE}:${IMAGE_TAG}" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --platform=managed \
  --service-account="$API_SA_EMAIL" \
  --add-cloudsql-instances="$SQL_CONNECTION_NAME" \
  --set-env-vars="NODE_ENV=production,PORT=8080,LOG_LEVEL=info,APP_REGION=${REGION},GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION},CORS_ORIGIN=*,APP_VERSION=0.1.0" \
  --set-secrets="DATABASE_URL=database-url:latest,REDIS_URL=redis-url:latest" \
  --min-instances=0 \
  --max-instances=4 \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --allow-unauthenticated \
  --quiet

API_URL=$(gcloud run services describe "$API_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format="value(status.url)")
log "API deployed: $API_URL"

step "Deploying Worker to Cloud Run"

gcloud run deploy "$WORKER_SERVICE" \
  --image="${WORKER_IMAGE}:${IMAGE_TAG}" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --platform=managed \
  --service-account="$WORKER_SA_EMAIL" \
  --add-cloudsql-instances="$SQL_CONNECTION_NAME" \
  --set-env-vars="NODE_ENV=production,PORT=8080,LOG_LEVEL=info,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION}" \
  --set-secrets="DATABASE_URL=database-url:latest,REDIS_URL=redis-url:latest" \
  --min-instances=0 \
  --max-instances=2 \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --no-allow-unauthenticated \
  --quiet

WORKER_URL=$(gcloud run services describe "$WORKER_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format="value(status.url)")
log "Worker deployed: $WORKER_URL"

# ─── Verify ─────────────────────────────────────────────────────────────────
step "Verifying deployment"

sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/health" || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
  log "Health check passed!"
else
  warn "Health check returned HTTP $HTTP_CODE (service may still be starting)"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
step "DEPLOYMENT COMPLETE"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           w3StreamItUp SaaS — Deployment Summary             ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC} API URL:      ${CYAN}${API_URL}${NC}"
echo -e "${GREEN}║${NC} Swagger Docs: ${CYAN}${API_URL}/docs${NC}"
echo -e "${GREEN}║${NC} Health:       ${CYAN}${API_URL}/health${NC}"
echo -e "${GREEN}║${NC} Version:      ${CYAN}${API_URL}/status/version${NC}"
echo -e "${GREEN}║${NC} Worker URL:   ${CYAN}${WORKER_URL}${NC}"
echo -e "${GREEN}║${NC} Database:     ${CYAN}${SQL_INSTANCE} (${SQL_CONNECTION_NAME})${NC}"
echo -e "${GREEN}║${NC} Redis:        ${CYAN}${REDIS_HOST}:6379${NC}"
echo -e "${GREEN}║${NC} Project:      ${CYAN}${PROJECT_ID}${NC}"
echo -e "${GREEN}║${NC} Region:       ${CYAN}${REGION}${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC} ${YELLOW}NEXT STEPS:${NC}"
echo -e "${GREEN}║${NC}  1. Set up OAuth provider (Auth0/Firebase Auth/etc)${NC}"
echo -e "${GREEN}║${NC}  2. Update secrets: oidc-issuer, oidc-audience, oidc-jwks-uri${NC}"
echo -e "${GREEN}║${NC}  3. Configure Twitch/YouTube/Trovo OAuth apps${NC}"
echo -e "${GREEN}║${NC}  4. Point your domain at the API URL${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "DB password stored in Secret Manager. To retrieve:"
echo -e "  gcloud secrets versions access latest --secret=database-url --project=$PROJECT_ID"
echo ""
