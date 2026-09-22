# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS deps
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates python3 make g++ pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/mcp/package.json packages/mcp/package.json
COPY packages/telegram-bot/package.json packages/telegram-bot/package.json
COPY evals/package.json evals/package.json
RUN npm ci --ignore-scripts

FROM deps AS build
ENV DATABASE_URL=postgresql://seminai:seminai@127.0.0.1:5432/seminai \
    DIRECT_URL=postgresql://seminai:seminai@127.0.0.1:5432/seminai \
    NODE_ENV=production
COPY . .
RUN npm rebuild canvas \
 && npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production APP_MODE=all PORT=8081 HOST=0.0.0.0 \
    DATA_DIR=/data SPA_DIR=/app/spa
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates openssl libcairo2 libpango-1.0-0 libjpeg62-turbo \
    libgif7 librsvg2-2 poppler-utils && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/backend/node_modules ./backend/node_modules
COPY --from=build /src/backend/dist ./backend/dist
COPY --from=build /src/backend/prisma ./backend/prisma
COPY --from=build /src/backend/prisma.config.ts ./backend/prisma.config.ts
COPY --from=build /src/backend/package.json ./backend/package.json
COPY --from=build /src/frontend/dist ./spa
COPY --from=build /src/package.json ./package.json
COPY scripts/deploy/prisma-alias-loader.mjs backend/prisma-alias-loader.mjs
COPY scripts/deploy/prisma-alias-register.mjs backend/prisma-alias-register.mjs
WORKDIR /app/backend
EXPOSE 8081
VOLUME ["/data"]
CMD ["sh", "-c", "npx prisma migrate deploy && node --import tsx --import ./prisma-alias-register.mjs dist/infrastructure/runtime/main.js"]
