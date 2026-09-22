FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .

RUN npm run build:docker

FROM node:22-alpine AS build-hub

WORKDIR /app/marketing

ARG PUBLIC_POSTHOG_KEY
ARG PUBLIC_POSTHOG_HOST
ARG HUB_API_BASE_URL
ENV PUBLIC_POSTHOG_KEY=${PUBLIC_POSTHOG_KEY}
ENV PUBLIC_POSTHOG_HOST=${PUBLIC_POSTHOG_HOST}
ENV HUB_API_BASE_URL=${HUB_API_BASE_URL}

COPY marketing/package*.json ./
RUN npm ci

COPY marketing/ .

# The public Knowledge Hub is built as a standalone Astro static site and
# deployed under /hub on the same domain as the main app (see docker/nginx.conf).
# Rule pages are fetched from the public API at build time (see src/lib/api.ts).
RUN npm run build

FROM nginx:1.27-alpine AS runtime

ENV API_PROXY_PASS=https://seminai-be-v2-661301438659.europe-west1.run.app

COPY docker/nginx.conf /etc/nginx/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build-hub /app/marketing/dist /usr/share/nginx/html/hub

EXPOSE 8080

CMD ["/bin/sh", "-c", "envsubst '${API_PROXY_PASS}' < /etc/nginx/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
