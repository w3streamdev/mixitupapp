# w3StreamItUp SaaS Platform - Technical Documentation

## Architecture Overview

```
Browser/Twitch Chat
       |
       v
[Chat Bridge]  <-- tmi.js IRC bot on VM, reads chat, calls API, sends replies
       |
       v
[NestJS API]   <-- Cloud Run, 56 endpoints, JWT auth, tenant isolation
       |
       +---> [Cloud SQL Postgres] -- all persistent data
       +---> [Pub/Sub]            -- async command execution
       |
       v
[Worker]       <-- Cloud Run, command engine, timer scheduler, Pub/Sub consumer
```

- **API**: `https://w3s.connect3.io` (NestJS + Fastify on Cloud Run)
- **Swagger Docs**: `https://w3s.connect3.io/docs`
- **Worker**: Cloud Run (always-on, min 1 instance)
- **Chat Bridge**: Node.js + tmi.js running on GCP VM
- **Database**: Cloud SQL PostgreSQL 16
- **Frontend**: Next.js 15 (apps/web, not yet deployed to Cloud Run)

---

## Authentication

### Twitch OAuth Login
Users authenticate via Twitch. No email/password.

**Flow:**
1. User visits `/login` on the frontend
2. Clicks "Sign in with Twitch"
3. Redirected to: `GET /api/v2/auth/twitch/connect?redirect_uri={frontend_url}/dashboard`
4. Twitch OAuth screen -> user authorizes
5. Callback provisions AppUser + Tenant + TenantMembership
6. Generates JWT with tenant_id, scopes, roles
7. Redirects to `{redirect_uri}#token={JWT}`
8. Frontend stores token in localStorage

**Twitch OAuth Scopes Requested:**
- `chat:read`, `chat:edit` -- read/send chat messages
- `channel:read:subscriptions` -- view subscribers
- `moderator:read:followers` -- view followers
- `bits:read` -- view bits
- `channel:read:redemptions`, `channel:manage:redemptions` -- channel points
- `user:read:email` -- get email
- `user:read:chat`, `user:write:chat` -- new chat API
- `user:bot`, `channel:bot` -- EventSub chat
- `moderator:manage:chat_messages` -- delete messages

### JWT Token Format
```json
{
  "sub": "twitch-666971745",
  "tenant_id": "cxxxxxxxxxxxxxx",
  "scope": "commands:read commands:write counters:read counters:write ...",
  "roles": ["owner"],
  "email": "user@example.com",
  "name": "DisplayName",
  "twitch_username": "username",
  "twitch_id": "666971745",
  "exp": 1900000000,
  "iat": 1775000000
}
```

### API Scopes
All endpoints require a valid JWT with appropriate scopes:
- `commands:read` / `commands:write`
- `counters:read` / `counters:write`
- `currency:read` / `currency:write`
- `inventory:read` / `inventory:write`
- `users:read` / `users:write`
- `events:write`
- `migration:write`

---

## Command System

### Command Types

| Type | Trigger | Description |
|------|---------|-------------|
| `chat` | Chat message (e.g. `!hello`) | Triggered by text in Twitch chat |
| `timer` | Scheduled interval | Fires automatically on a timer |
| `event` | Platform event | Fires on follow, sub, bits, raid, etc. |
| `webhook` | HTTP POST | Fires from external services |

### Command Definition Structure

Every command has a `definition` JSON field:

```json
{
  "triggers": [
    { "text": "!hello", "isWildcard": false, "caseSensitive": false }
  ],
  "requirements": {
    "roles": ["Everyone"],
    "cooldownSeconds": 10,
    "userCooldownSeconds": 5,
    "currencyCost": { "currencyId": "xxx", "amount": 100 }
  },
  "deleteMessage": false,
  "actions": [ ... ],
  "timer": { ... },
  "event": { ... }
}
```

### Action Types

#### Chat Action
Sends a message to chat.
```json
{
  "type": "chat",
  "message": "Hello $username! Welcome to the stream!",
  "sendAsReply": false,
  "platform": "twitch"
}
```

#### Wait Action
Delays execution (max 25 seconds).
```json
{
  "type": "wait",
  "durationMs": 5000
}
```

#### Counter Action
Modifies a counter.
```json
{
  "type": "counter",
  "counterId": "xxx",
  "operation": "increment",
  "amount": 1
}
```
Operations: `increment`, `decrement`, `set`, `reset`

#### Currency Action
Gives or takes currency.
```json
{
  "type": "currency",
  "currencyId": "xxx",
  "operation": "give",
  "amount": 50,
  "targetUserId": "optional-user-id"
}
```

#### Web Request Action
Sends an HTTP request to an external API.
```json
{
  "type": "web_request",
  "url": "https://your-api.com/endpoint",
  "method": "POST",
  "headers": { "Content-Type": "application/json" },
  "body": "{\"message\": \"$message\", \"user\": \"$username\"}",
  "responseIdentifier": "$webrequest"
}
```

#### Conditional Action
If/else branching.
```json
{
  "type": "conditional",
  "condition": {
    "type": "counter_check",
    "field": "counter-id",
    "operator": "gt",
    "value": 10
  },
  "thenActions": [ ... ],
  "elseActions": [ ... ]
}
```
Condition types: `counter_check`, `currency_check`, `role_check`, `custom`
Operators: `eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `contains`

#### Command Reference Action
Runs another command's actions (like action groups).
```json
{
  "type": "command_ref",
  "commandId": "xxx"
}
```
Max recursion depth: 5

#### Sound Action
```json
{ "type": "sound", "soundUrl": "https://...", "volume": 0.8 }
```

#### Overlay Action
```json
{ "type": "overlay", "overlayId": "xxx", "data": {} }
```

### Special Identifiers (Variables)

These get replaced at runtime in any action's text fields:

| Variable | Value |
|----------|-------|
| `$username` | Twitch username of the triggering user |
| `$userdisplayname` | Display name |
| `$userid` | Twitch user ID |
| `$message` | Everything after the trigger text |
| `$args1` - `$args9` | Individual words from the message |
| `$allargs` | All arguments joined with spaces |
| `$argcount` | Number of arguments |
| `$date` | Current date (YYYY-MM-DD) |
| `$time` | Current time (HH:MM:SS) |
| `$datetime` | ISO 8601 timestamp |
| `$randomnumber` | Random integer 1-100 |
| `$randomnumber500` | Random integer 1-500 (any number) |
| `$counter` | Last counter value (set by counter action) |
| `$webrequest` | Response from last web request action |
| `$channel` | Twitch channel name |

### Timer Commands

Timer definition (inside the command's `definition`):
```json
{
  "timer": {
    "intervalSeconds": 300,
    "minChatMessages": 5,
    "groupName": "Social Links",
    "groupIntervalSeconds": 600
  }
}
```

- Timers without a group merge into a "mega group" and cycle one-at-a-time
- Timers in a group with `groupIntervalSeconds` run independently
- `minChatMessages` requires N chat messages since last fire before the timer triggers

### Event Commands

Event definition:
```json
{
  "event": {
    "eventType": "follow",
    "platform": "twitch"
  }
}
```

Supported event types:
- `follow` -- New follower
- `subscribe` -- New subscriber
- `resubscribe` -- Resubscription
- `subscription_gift` -- Gifted sub
- `bits` -- Bits cheer (supports exact amount and range matching)
- `channel_point_redeem` -- Channel point redemption
- `raid` -- Incoming raid

Bits range matching:
```json
{
  "event": {
    "eventType": "bits",
    "platform": "twitch",
    "bitsMin": 100,
    "bitsMax": 500
  }
}
```

### deleteMessage Flag

Add `"deleteMessage": true` to the command definition to delete the triggering message from chat after the command executes:
```json
{
  "triggers": [{ "text": "!say" }],
  "deleteMessage": true,
  "actions": [ ... ]
}
```

---

## Chat Bridge

The chat bridge (`chat-bridge.js` / `bot.js`) is a lightweight Node.js process that:

1. Connects to Twitch IRC via tmi.js
2. Listens for messages in the channel
3. Forwards `!command` messages to the API's `/api/v2/commands/chat-trigger` endpoint
4. Sends chat responses back to Twitch
5. Deletes messages when `deleteMessage: true`

### Running the Bridge

```bash
cd /tmp
NODE_PATH=/tmp/node_modules \
  TWITCH_TOKEN=<access_token> \
  TWITCH_CHANNEL=<channel_name> \
  API_URL=https://w3s.connect3.io \
  JWT_TOKEN=<jwt_token> \
  nohup node /tmp/bot.js > /dev/null 2>&1 &
```

### How It Works

```
User types "!so Ninja" in Twitch chat
  -> tmi.js receives the message
  -> Bridge POST /api/v2/commands/chat-trigger
  -> API matches "!so" trigger on the !shoutout command
  -> API resolves chat action: "Go check out Ninja! ..."
  -> API publishes to Pub/Sub for full engine execution
  -> API returns { matched: true, chatResponses: ["Go check out Ninja!..."], deleteMessage: false }
  -> Bridge sends "Go check out Ninja!..." to Twitch chat
  -> Worker receives Pub/Sub message, runs counter increment action
```

Pre-made commands (`!8ball`, `!commands`, etc.) are resolved entirely in the API and returned directly without Pub/Sub.

### Token Refresh

The Twitch OAuth token expires every ~4 hours. When it expires:
1. Re-authorize: `https://w3s.connect3.io/api/v2/auth/twitch/connect?tenant_id=<id>`
2. Restart the bridge with the new token

---

## API Endpoints Reference

### Auth
```
GET  /api/v2/auth/twitch/connect       -- Start Twitch OAuth flow
GET  /api/v2/auth/twitch/callback       -- OAuth callback (Twitch redirects here)
POST /api/v2/auth/provision             -- Provision user after auth
POST /api/v2/auth/token-info            -- Get token details
POST /api/v2/auth/dev-token             -- Generate dev token (dev mode only)
```

### Commands
```
GET    /api/v2/commands                        -- List all commands
POST   /api/v2/commands                        -- Create command
GET    /api/v2/commands/:id                    -- Get command
PUT    /api/v2/commands/:id                    -- Update command
DELETE /api/v2/commands/:id                    -- Delete command
PATCH  /api/v2/commands/:id/state/:state       -- Toggle enable (0=off, 1=on, 2=toggle)
POST   /api/v2/commands/:id                    -- Run command via API
POST   /api/v2/commands/:id/test               -- Test run (skips cooldowns)
POST   /api/v2/commands/chat-trigger           -- Process chat message
GET    /api/v2/commands/history                -- Execution history
```

### Counters
```
GET    /api/v2/counters                        -- List counters
POST   /api/v2/counters                        -- Create counter
GET    /api/v2/counters/:id                    -- Get counter
PATCH  /api/v2/counters/:id                    -- Update counter
DELETE /api/v2/counters/:id                    -- Delete counter
PATCH  /api/v2/counters/:id/increment/:amount  -- Increment
PATCH  /api/v2/counters/:id/reset              -- Reset
```

### Currency
```
GET    /api/v2/currency                        -- List currencies
POST   /api/v2/currency                        -- Create currency
GET    /api/v2/currency/:id                    -- Get currency
DELETE /api/v2/currency/:id                    -- Delete currency
GET    /api/v2/currency/:id/user/:userId       -- Get user balance
PATCH  /api/v2/currency/:id/user/:userId/adjust -- Adjust balance
```

### Inventory
```
GET    /api/v2/inventory                                           -- List inventories
POST   /api/v2/inventory                                           -- Create inventory
GET    /api/v2/inventory/:id                                       -- Get inventory
DELETE /api/v2/inventory/:id                                       -- Delete inventory
GET    /api/v2/inventory/:id/items                                 -- List items
POST   /api/v2/inventory/:id/items                                 -- Create item
PATCH  /api/v2/inventory/:id/items/:itemId/user/:userId/adjust     -- Adjust user item
GET    /api/v2/inventory/:id/items/:itemId/user/:userId            -- Get user item
```

### Users
```
GET    /api/v2/users                    -- List users
GET    /api/v2/users/:id                -- Get user
POST   /api/v2/users/add                -- Add user
DELETE /api/v2/users/:id                -- Delete user
```

### Events
```
POST   /api/v2/events/trigger                  -- Generic event trigger
POST   /api/v2/events/twitch/follow            -- Twitch follow
POST   /api/v2/events/twitch/subscribe         -- Twitch subscribe
POST   /api/v2/events/twitch/bits              -- Twitch bits
POST   /api/v2/events/twitch/channel-points    -- Channel point redemption
POST   /api/v2/events/twitch/raid              -- Twitch raid
```

### Webhooks
```
POST   /api/v2/webhooks                        -- Create webhook
GET    /api/v2/webhooks                        -- List webhooks
DELETE /api/v2/webhooks/:id                    -- Delete webhook
POST   /api/v2/webhooks/:id/trigger            -- Trigger webhook (public, uses ?secret=)
```

### Twitch EventSub
```
POST   /api/v2/twitch/eventsub                 -- EventSub webhook receiver
```

### Migration
```
POST   /api/v2/migration/import                -- Import desktop data
GET    /api/v2/migration/status/:jobId         -- Check import status
POST   /api/v2/migration/reconcile             -- Reconcile data counts
```

### Status
```
GET    /api/v2/status/version                  -- API version
GET    /api/v2/status/health                   -- Health check
```

---

## Pre-Made Commands

These work out of the box for every tenant:

| Command | Description |
|---------|-------------|
| `!8ball [question]` | Magic 8 Ball -- random response |
| `!commands` | Lists all available commands |
| `!w3streamitup` | Platform promo message |
| `!uptime` | Stream uptime (placeholder) |
| `!followage` | Follow age (placeholder) |
| `!title` | Stream title (placeholder) |
| `!game` | Stream game/category (placeholder) |
| `!quote` | Random quote (placeholder) |
| `!addquote [text]` | Add quote (Moderator+) |

---

## Command Engine (Worker)

The worker processes commands asynchronously via Pub/Sub:

1. API publishes `CommandRunMessage` to `command-runs` topic
2. Worker's `CommandRunHandler` receives it
3. `CommandEngine.executeCommand()`:
   - Loads command from DB
   - Validates enabled state
   - Checks role requirements (unless test run)
   - Checks cooldowns via Redis (unless test run)
   - Acquires command lock
   - Executes actions sequentially
   - Records audit events
   - Sets cooldowns on success
   - Releases lock (always, even on failure)

### Lock Modes
Configured via `COMMAND_LOCK_MODE` env var:
- `none` (default) -- No locking
- `per_command_type` -- One command per type at a time
- `per_action_type` -- Commands sharing action types block each other
- `visual_audio` -- Only sound/overlay actions share a lock
- `singular` -- Only one command at a time globally

### Cooldowns
Stored in Redis (Memorystore):
- Global: `cd:{tenantId}:{commandId}` with TTL
- Per-user: `cd:{tenantId}:{commandId}:{userId}` with TTL

---

## Database Schema

### Core Tables
- `Tenant` -- Multi-tenant isolation
- `AppUser` -- Authenticated users (keyed by Twitch ID)
- `TenantMembership` -- User-to-tenant mapping with roles
- `IntegrationConnection` -- OAuth tokens (Twitch, YouTube, Trovo)

### Command Tables
- `Command` -- Command definitions (type, triggers, actions, requirements)
- `CommandExecution` -- Execution history/audit trail

### Feature Tables
- `Counter` -- Named counters with amounts
- `Currency` / `CurrencyLedger` -- Virtual currency with per-user balances
- `Inventory` / `InventoryItem` / `InventoryLedger` -- Item systems
- `TenantUser` -- Platform users (viewers/subscribers)
- `Webhook` / `WebhookDelivery` -- Webhook infrastructure
- `WebhookCommand` -- Webhook-to-command mapping
- `AuditEvent` -- System audit log

---

## Deployment

### One-Command Deploy
```bash
cd ~/mixitupapp/saas
gcloud builds submit \
  --project=connect3-391119 \
  --config=cloudbuild/deploy-dev.yaml \
  --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) \
  --region=us-central1
```

### Restarting the Chat Bridge
```bash
# Get fresh token
ACCESS_TOKEN=$(psql -h 34.31.215.129 -U mixitup -d mixitup -t -A \
  -c "SELECT \"accessToken\" FROM \"IntegrationConnection\" WHERE \"tenantId\"='<tenant_id>';")

# Start bridge
cd /tmp && NODE_PATH=/tmp/node_modules \
  TWITCH_TOKEN=$ACCESS_TOKEN \
  TWITCH_CHANNEL=vybecodez \
  API_URL=https://w3s.connect3.io \
  JWT_TOKEN="<your-jwt>" \
  nohup node /tmp/bot.js > /dev/null 2>&1 &
```

### Re-authorizing Twitch
When the token expires (~4 hours), visit:
```
https://w3s.connect3.io/api/v2/auth/twitch/connect?tenant_id=<tenant_id>
```

### Environment Variables (API)
- `DATABASE_URL` -- Cloud SQL connection (Secret Manager)
- `REDIS_URL` -- Memorystore Redis (Secret Manager)
- `TWITCH_CLIENT_ID` -- Twitch app client ID (Secret Manager)
- `TWITCH_CLIENT_SECRET` -- Twitch app client secret (Secret Manager)
- `TWITCH_EVENTSUB_SECRET` -- EventSub HMAC secret (Secret Manager)
- `GOOGLE_CLOUD_PROJECT` -- GCP project ID
- `NODE_ENV` -- production

### Infrastructure
- **GCP Project**: connect3-391119
- **Region**: us-central1
- **Cloud Run**: mixitup-api-dev (API), mixitup-worker-dev (Worker)
- **Cloud SQL**: mixitup-pg-dev (PostgreSQL 16)
- **Pub/Sub Topics**: command-runs, webhook-deliveries, audit-events
- **Artifact Registry**: mixitup-services
- **Custom Domain**: w3s.connect3.io (CNAME -> ghs.googlehosted.com)
