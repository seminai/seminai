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
COPY packages/desktop/package.json packages/desktop/package.json
COPY packages/telegram-bot/package.json packages/telegram-bot/package.json
COPY evals/package.json evals/package.json
RUN npm ci --ignore-scripts

FROM deps AS build
ENV DATABASE_URL=postgresql://seminai:seminai@127.0.0.1:5432/seminai \
    DIRECT_URL=postgresql://seminai:seminai@127.0.0.1:5432/seminai \
    NODE_ENV=production
COPY . .
RUN npm rebuild canvas \
 && npm run codegen \
 && npm run build --workspace @seminai/backend \
 && npm run build --workspace @seminai/frontend \
 && npm run build --workspace @seminai/mcp-connector

FROM deps AS production-deps
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    --workspace @seminai/backend --workspace @seminai/mcp-connector \
 && npm rebuild canvas \
 && mkdir -p backend/node_modules packages/mcp/node_modules \
 && rm -rf node_modules/@seminai

FROM postgres:16-bookworm AS postgres-tools

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production APP_MODE=all PORT=8081 HOST=0.0.0.0 \
    DATA_DIR=/data SPA_DIR=/app/spa
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates openssl libcairo2 libpango-1.0-0 libjpeg62-turbo \
    libgif7 librsvg2-2 poppler-utils libldap-2.5-0 libssl3 libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=postgres-tools /usr/lib/postgresql/16/bin/pg_dump /usr/local/bin/pg_dump
COPY --from=postgres-tools /usr/lib/postgresql/16/bin/pg_restore /usr/local/bin/pg_restore
COPY --from=postgres-tools /usr/lib/*/libpq.so.5* /usr/local/lib/
COPY --from=postgres-tools /usr/share/doc/postgresql-client-16/copyright ./licenses/PostgreSQL-client.txt
RUN ldconfig
COPY --from=production-deps /src/node_modules ./node_modules
COPY --from=production-deps /src/backend/node_modules ./backend/node_modules
COPY --from=production-deps /src/packages/mcp/node_modules ./packages/mcp/node_modules
COPY --from=build /src/backend/dist ./backend/dist
COPY --from=build /src/backend/prisma ./backend/prisma
COPY --from=build /src/backend/prisma.config.ts ./backend/prisma.config.ts
COPY --from=build /src/backend/package.json ./backend/package.json
COPY --from=build /src/backend/tsconfig.json ./backend/tsconfig.json
COPY --from=build /src/backend/dataset ./backend/dataset
COPY --from=build /src/packages/mcp/dist ./packages/mcp/dist
COPY --from=build /src/packages/mcp/package.json ./packages/mcp/package.json
COPY --from=build /src/frontend/dist ./spa
COPY --from=build /src/package.json ./package.json
COPY LICENSE NOTICE ./
COPY scripts/deploy/prisma-alias-loader.mjs backend/prisma-alias-loader.mjs
COPY scripts/deploy/prisma-alias-register.mjs backend/prisma-alias-register.mjs
COPY scripts/deploy/server-*.cjs ./scripts/deploy/
WORKDIR /app/backend
EXPOSE 8081
VOLUME ["/data"]
CMD ["node", "/app/scripts/deploy/server-start.cjs"]
