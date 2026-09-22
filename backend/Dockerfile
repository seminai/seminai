FROM node:22-alpine AS node-base
FROM oven/bun:1.2-alpine

# Copy Node.js 22 from official image (Alpine's npm pulls nodejs-current v21 which Prisma rejects)
COPY --from=node-base /usr/local/bin/node /usr/local/bin/node
COPY --from=node-base /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Build-time dependencies (canvas needs native deps)
# poppler-utils provides pdftoppm for PDF to image conversion (needed for OCR with GPT Vision)
RUN apk add --no-cache \
  build-base \
  ca-certificates \
  curl \
  git \
  python3 \
  cairo-dev \
  jpeg-dev \
  pango-dev \
  giflib-dev \
  pkgconf \
  openssl \
  pixman-dev \
  freetype-dev \
  libpng-dev \
  poppler-utils

RUN update-ca-certificates

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY bun.lock* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install dependencies (use npm to avoid TLS issues observed with bun install)
# TODO: pulire in modo pulito  allineare pdf-parse alla versione richiesta (1.1.1) o aggiornare @langchain/community ad una versione che accetti pdf-parse 2.x
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_DIR=/etc/ssl/certs
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
RUN npm config set cafile /etc/ssl/certs/ca-certificates.crt && npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npx tsc

# Copy public folder to dist
RUN mkdir -p ./dist/infrastructure/http/public && \
    cp -r ./src/infrastructure/http/public/* ./dist/infrastructure/http/public/

# Expose port
EXPOSE 8080

# Start via bootstrap (registers error handlers before loading server module)
# Use Bun runtime because dist emits ESM imports not resolvable by plain Node (e.g. directory imports).
CMD ["bun", "./dist/infrastructure/http/bootstrap.js"]