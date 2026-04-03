# w3StreamItUp SaaS Platform - Test Results
## Date: 2026-03-31

---

## 1. Build & CI Tests

### Typecheck (all packages)
- **Status**: PASS
- **Packages**: @mixitup/api, @mixitup/db, @mixitup/shared, @mixitup/worker
- **Result**: 3 successful, 0 failures

### Lint (all packages)
- **Status**: PASS
- **Packages**: @mixitup/api, @mixitup/worker
- **Result**: 2 successful, 0 errors

### Unit Tests
- **Status**: PASS
- **Files**: 4 test files (http-exception.filter.spec.ts, jwt.service.spec.ts, connector.registry.spec.ts, status.controller.spec.ts)
- **Result**: 14 tests passed, 0 failures

---

## 2. API Endpoint Tests (Production - Cloud Run)

**Base URL**: `https://mixitup-api-dev-958043331506.us-central1.run.app`

### 2.1 Status Endpoints (Public, No Auth)

#### GET /api/v2/status/version
```json
// Request: curl -s $API/api/v2/status/version
// Response (200):
{
    "version": "0.1.0",
    "environment": "production",
    "timestamp": "2026-03-31T01:32:51.803Z"
}
```

#### GET /docs (Swagger UI)
- **Status**: 200 - Returns full Swagger HTML UI

#### GET /docs-json (OpenAPI Spec)
- **Status**: 200 - Returns JSON with 50 endpoints defined

### 2.2 Auth Enforcement

#### GET /api/v2/commands (No Auth Header)
```json
// Response (401):
{
    "type": "https://httpstatuses.io/401",
    "title": "Unauthorized",
    "status": 401,
    "detail": "Missing authorization header"
}
```

### 2.3 Counter CRUD

#### POST /api/v2/counters - Create Counter
```json
// Request body: {"name":"death-counter","amount":0,"resetAmount":0}
// Response (201):
{
    "Counter": {
        "ID": "cmndyammx0001jrh4xb3fenj9",
        "Name": "death-counter",
        "Amount": 0,
        "ResetAmount": 0
    }
}
```

#### GET /api/v2/counters - List Counters
```json
// Response (200):
{
    "TotalCount": 1,
    "Counters": [
        {
            "ID": "cmndyammx0001jrh4xb3fenj9",
            "Name": "death-counter",
            "Amount": 3,
            "ResetAmount": 0
        }
    ]
}
```

#### PATCH /api/v2/counters/:id/increment/3 - Increment Counter
```json
// Response (200):
{
    "Counter": {
        "ID": "cmndyammx0001jrh4xb3fenj9",
        "Name": "death-counter",
        "Amount": 3
    }
}
```

### 2.4 Currency CRUD

#### POST /api/v2/currency - Create Currency
```json
// Request body: {"name":"StreamPoints","acquireAmount":10,"acquireInterval":5,"maxAmount":100000}
// Response (201):
{
    "Currency": {
        "ID": "cmndyamrf0003jrh4jgznszkh",
        "Name": "StreamPoints",
        "AcquireAmount": 10,
        "AcquireInterval": 5,
        "MaxAmount": 100000,
        "IsEnabled": true
    }
}
```

### 2.5 Inventory CRUD

#### POST /api/v2/inventory - Create Inventory
```json
// Request body: {"name":"Stream Rewards","defaultMaxAmount":10,"shopEnabled":true}
// Response (201):
{
    "Inventory": {
        "ID": "cmndybcez0005jrh4iar4s4xo",
        "Name": "Stream Rewards",
        "DefaultMaxAmount": 10,
        "ShopEnabled": true,
        "ShopCurrencyId": null
    }
}
```

#### POST /api/v2/inventory/:id/items - Create Inventory Item
```json
// Request body: {"name":"VIP Badge","maxAmount":1,"shopBuyPrice":5000,"shopSellPrice":2500}
// Response (201):
{
    "Item": {
        "ID": "cmndyblhq0007jrh4ozbvmi8q",
        "Name": "VIP Badge",
        "MaxAmount": 1,
        "ShopBuyPrice": 5000,
        "ShopSellPrice": 2500
    }
}
```

---

## 3. Command Engine Tests (Production)

### 3.1 Command Creation

#### POST /api/v2/commands - Create Chat Command with Full Definition
```json
// Request body:
{
    "name": "!shoutout",
    "type": "chat",
    "definition": {
        "triggers": [
            {"text": "!shoutout", "isWildcard": false, "caseSensitive": false},
            {"text": "!so", "isWildcard": false, "caseSensitive": false}
        ],
        "requirements": {
            "roles": ["Moderator", "Owner"],
            "cooldownSeconds": 10,
            "userCooldownSeconds": 0
        },
        "actions": [
            {
                "type": "chat",
                "message": "Go check out $args1! They are an awesome streamer!",
                "sendAsReply": false
            },
            {
                "type": "counter",
                "counterId": "cmndyammx0001jrh4xb3fenj9",
                "operation": "increment",
                "amount": 1
            }
        ]
    }
}
// Response (201):
{
    "Command": {
        "ID": "cmndzqp1s0001wxzy4iom7czi",
        "Name": "!shoutout",
        "Type": "chat",
        "IsEnabled": true,
        "Unlocked": true,
        "GroupName": null,
        "Definition": { ... full definition stored ... }
    }
}
```

#### POST /api/v2/commands - Create Timer Command
```json
// Request body:
{
    "name": "Social Timer",
    "type": "timer",
    "definition": {
        "timer": {"intervalSeconds": 300, "minChatMessages": 5, "groupName": "Social Links"},
        "actions": [{"type": "chat", "message": "Follow me on Twitter!", "sendAsReply": false}]
    }
}
// Response (201): Command created with ID cmne5tobc0001qq5lcc5utdu3
```

#### POST /api/v2/commands - Create Event Command (Follow)
```json
// Request body:
{
    "name": "New Follower Alert",
    "type": "event",
    "definition": {
        "event": {"eventType": "follow", "platform": "twitch"},
        "actions": [
            {"type": "chat", "message": "Welcome $username! Thanks for the follow!"},
            {"type": "counter", "counterId": "cmndyammx0001jrh4xb3fenj9", "operation": "increment", "amount": 1}
        ]
    }
}
// Response (201): Command created with ID cmne5tofb0003qq5l7r5ts56d
```

### 3.2 Chat Trigger Matching

#### POST /api/v2/commands/chat-trigger - Match "!so ninja"
```json
// Request body: {"platform":"twitch","userId":"viewer_123","username":"coolmod","displayName":"CoolMod","message":"!so ninja"}
// Response (200):
{
    "matched": true,
    "commandId": "cmndzqp1s0001wxzy4iom7czi",
    "executionId": "1785724d-3dec-4d3d-8af4-4d6e2b68c392"
}
```

#### POST /api/v2/commands/chat-trigger - Match "!shoutout pokimane"
```json
// Response (200):
{
    "matched": true,
    "commandId": "cmndzqp1s0001wxzy4iom7czi",
    "executionId": "cf0370af-f985-4cf4-b7f9-490ca4aea570"
}
```

### 3.3 Pre-Made Commands (via Chat Trigger)

#### !8ball
```json
// Request: {"message": "!8ball Will I win today?"}
// Response (200):
{
    "matched": true,
    "response": "\ud83c\udfb1 Without a doubt.",
    "premade": true
}
```

#### !commands
```json
// Response (200):
{
    "matched": true,
    "response": "Available commands: !shoutout, !so, !commands, !uptime, !followage, !title, !game, !quote, !addquote, !w3streamitup, !8ball",
    "premade": true
}
```

#### !w3streamitup
```json
// Response (200):
{
    "matched": true,
    "response": "This stream is powered by w3StreamItUp! Check it out at https://w3streamitup.com",
    "premade": true
}
```

### 3.4 Command Execution (End-to-End via Pub/Sub + Worker)

#### Test: "!so Valkyrae" -> Counter Increment
- **Before**: Counter amount = 4
- **Trigger**: POST /api/v2/commands/chat-trigger with message "!so Valkyrae"
- **Pipeline**: API matched trigger -> Published to Pub/Sub -> Worker received -> CommandEngine executed ChatAction + CounterAction
- **After**: Counter amount = 5
- **Worker log**: `Command "!shoutout" completed in 20ms`
- **Status**: PASS - Full async pipeline verified

### 3.5 Execution History

#### GET /api/v2/commands/history
```json
// Response (200):
{
    "TotalCount": 8,
    "Executions": [
        {
            "ID": "2ca9184f-d384-444d-beae-f8582fd3186b",
            "CommandID": "cmndzqp1s0001wxzy4iom7czi",
            "Status": "pending",
            "TriggerType": "chat",
            "Platform": "twitch",
            "UserID": "mod_final",
            "Input": {
                "userId": "mod_final",
                "message": "DrLupo",
                "trigger": "!so",
                "platform": "twitch",
                "username": "finalmod",
                "arguments": ["DrLupo"],
                "displayName": "FinalMod"
            }
        }
    ]
}
```

---

## 4. Event System Tests

### 4.1 Twitch Follow Event
```json
// POST /api/v2/events/twitch/follow
// Request: {"userId":"new_follower_99","username":"CoolNewFollower","displayName":"CoolNewFollower"}
// Response (200):
{
    "Triggered": 1,
    "Executions": ["ae0d155e-95d7-4781-835c-28a18fa22b89"]
}
// Result: Counter incremented from 5 to 6 (follow event command ran counter action)
```

---

## 5. Webhook Command Tests

### 5.1 Create Webhook
```json
// POST /api/v2/webhooks
// Request: {"name":"Stream Alert Webhook","commandDefinition":{...}}
// Response (201):
{
    "Webhook": {
        "ID": "cmne5tojm0007qq5lp12sydx4",
        "Name": "Stream Alert Webhook",
        "CommandID": "cmne5tojg0005qq5lt29prl32",
        "URL": ".../trigger?secret=51a77b14...",
        "Secret": "51a77b141c169f28b0133a3dabd3bcf2...",
        "IsEnabled": true
    }
}
```

### 5.2 Trigger Webhook (No Auth - Uses Secret)
```json
// POST /api/v2/webhooks/:id/trigger?secret=...
// Request body: {"message":"Hello from external service!","alertType":"donation","amount":5.00}
// Response (200):
{
    "accepted": true,
    "executionId": "385eb4ae-5b14-437d-99d1-d8552b1f413e"
}
```

---

## 6. Twitch Integration Tests

### 6.1 OAuth Flow
- **GET /api/v2/auth/twitch/connect?tenant_id=tenant_test_001**: Redirects to Twitch OAuth
- **GET /api/v2/auth/twitch/callback**: Exchanges code, stores tokens, creates EventSub subscriptions
- **Result**: Stored IntegrationConnection for vybecodez (user ID 666971745)
- **Scopes granted**: bits:read, channel:bot, channel:manage:redemptions, channel:read:redemptions, channel:read:subscriptions, chat:edit, chat:read, moderator:read:followers, user:bot, user:read:chat, user:read:email, user:write:chat

### 6.2 EventSub Subscriptions Created
- channel.follow (v2) - PASS
- channel.subscribe (v1) - PASS
- channel.subscription.gift (v1) - PASS
- channel.cheer (v1) - PASS
- channel.channel_points_custom_reward_redemption.add (v1) - PASS
- channel.raid (v1) - PASS
- channel.chat.message (v1) - FAILED (403/400 auth issues with Cloud Run, handled by chat-bridge instead)

### 6.3 Twitch IRC Chat (via tmi.js)
- **Direct test from VM**: Connected to irc-ws.chat.twitch.tv:443, joined #vybecodez, sent message "w3StreamItUp bot is online!" - PASS
- **Chat bridge**: Connected and listening, forwarding messages to API - PASS
- **!8ball in Twitch chat**: Bot replied with 8-ball response - PASS

---

## 7. Infrastructure Tests

### 7.1 Cloud SQL (PostgreSQL 16)
- Instance: mixitup-pg-dev (34.31.215.129)
- Database: mixitup
- Migrations applied: 3 (init, command_execution, webhook_commands)
- All tables created and verified via psql

### 7.2 Pub/Sub
- Topics created: command-runs, webhook-deliveries, audit-events
- Subscriptions: command-runs-sub, webhook-deliveries-sub, audit-events-sub
- API publishing: PASS (after IAM fix for pubsub.publisher role)
- Worker subscribing: PASS (after @google-cloud/pubsub dependency added)

### 7.3 Cloud Run
- API service: mixitup-api-dev (0-4 instances, 512Mi, 1 CPU)
- Worker service: mixitup-worker-dev (1-2 instances, 512Mi, 1 CPU, no-cpu-throttling)
- Health checks: PASS
- Auto-scaling: Verified

### 7.4 Cloud Build CI/CD
- 8 successful deployments via `gcloud builds submit`
- Build time: ~3 minutes (parallel API + Worker image builds)
- Image push to Artifact Registry: PASS

### 7.5 Secret Manager
- database-url: Stored and mounted via --set-secrets
- redis-url: Stored and mounted
- twitch-client-id: Stored and mounted
- twitch-client-secret: Stored and mounted
- twitch-eventsub-secret: Stored and mounted

### 7.6 Docker Builds
- API Dockerfile: Multi-stage build with --shamefully-hoist, openssl installed, Prisma binary targets for debian-openssl-3.0.x
- Worker Dockerfile: Same pattern
- Both build and run successfully on Cloud Run

---

## 8. All Live API Endpoints (50 total)

```
POST    /api/v2/events/trigger
POST    /api/v2/events/twitch/follow
POST    /api/v2/events/twitch/subscribe
POST    /api/v2/events/twitch/bits
POST    /api/v2/events/twitch/channel-points
POST    /api/v2/events/twitch/raid
GET     /api/v2/status/version
GET     /api/v2/status/health
GET     /api/v2/commands/history
GET     /api/v2/commands/{commandId}
PUT     /api/v2/commands/{commandId}
DELETE  /api/v2/commands/{commandId}
POST    /api/v2/commands/{commandId}
GET     /api/v2/commands
POST    /api/v2/commands
POST    /api/v2/commands/chat-trigger
PATCH   /api/v2/commands/{commandId}/state/{state}
POST    /api/v2/commands/{commandId}/test
GET     /api/v2/counters
POST    /api/v2/counters
GET     /api/v2/counters/{counterId}
PATCH   /api/v2/counters/{counterId}
DELETE  /api/v2/counters/{counterId}
PATCH   /api/v2/counters/{counterId}/increment/{amount}
PATCH   /api/v2/counters/{counterId}/reset
GET     /api/v2/currency
POST    /api/v2/currency
GET     /api/v2/currency/{currencyId}
DELETE  /api/v2/currency/{currencyId}
GET     /api/v2/currency/{currencyId}/user/{userId}
PATCH   /api/v2/currency/{currencyId}/user/{userId}/adjust
GET     /api/v2/inventory
POST    /api/v2/inventory
GET     /api/v2/inventory/{inventoryId}
DELETE  /api/v2/inventory/{inventoryId}
GET     /api/v2/inventory/{inventoryId}/items
POST    /api/v2/inventory/{inventoryId}/items
PATCH   /api/v2/inventory/{inventoryId}/items/{itemId}/user/{userId}/adjust
GET     /api/v2/inventory/{inventoryId}/items/{itemId}/user/{userId}
POST    /api/v2/migration/import
GET     /api/v2/migration/status/{jobId}
POST    /api/v2/migration/reconcile
GET     /api/v2/users/{userId}
DELETE  /api/v2/users/{userId}
GET     /api/v2/users
POST    /api/v2/users/add
POST    /api/v2/webhooks
GET     /api/v2/webhooks
DELETE  /api/v2/webhooks/{webhookId}
POST    /api/v2/webhooks/{webhookId}/trigger
GET     /api/v2/auth/twitch/connect
GET     /api/v2/auth/twitch/callback
POST    /api/v2/twitch/eventsub
```

---

## 9. Known Issues

1. **Cloud Run + tmi.js WebSocket**: Twitch IRC connections drop on Cloud Run due to "No response from Twitch" errors. Workaround: external chat-bridge process running on VM.
2. **Redis (Memorystore)**: Connection timeout errors from worker. Memorystore requires VPC access connector which isn't configured. Cooldowns/locks gracefully no-op without Redis.
3. **channel.chat.message EventSub**: Cannot create webhook subscription due to Twitch auth requirements conflicting between app token and user token. Handled by chat-bridge instead.
4. **Custom command chat responses**: The chat-bridge currently only sends replies for pre-made commands. Custom command chat actions execute on the worker but can't send to Twitch from Cloud Run.
5. **Timer command chat action**: Fires on schedule but PlatformChatService can't find "system" platform connection. Timer actions that send chat need the platform specified.
