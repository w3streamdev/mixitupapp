FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY . .
RUN pnpm --filter @mixitup/db prisma:generate
RUN pnpm --filter @mixitup/worker build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/apps/worker/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/db/node_modules/.prisma ./node_modules/.prisma

EXPOSE 8080
CMD ["node", "dist/main.js"]
