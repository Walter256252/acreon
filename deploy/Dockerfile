# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Shared dependency stage
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS dependencies

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/realestate-tracker/package.json artifacts/realestate-tracker/package.json

COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
COPY lib/integrations-openai-ai-react/package.json \
     lib/integrations-openai-ai-react/package.json
COPY lib/integrations-openai-ai-server/package.json \
     lib/integrations-openai-ai-server/package.json

RUN pnpm install --frozen-lockfile

COPY . .


# ---------------------------------------------------------------------------
# API build stage
# ---------------------------------------------------------------------------
FROM dependencies AS api-builder

RUN pnpm --filter @workspace/api-server build


# ---------------------------------------------------------------------------
# Frontend build stage
# ---------------------------------------------------------------------------
FROM dependencies AS web-builder

ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_CLERK_PROXY_URL=/api/__clerk
ARG BASE_PATH=/

ENV NODE_ENV=production
ENV PORT=4173
ENV BASE_PATH=${BASE_PATH}
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
ENV VITE_CLERK_PROXY_URL=${VITE_CLERK_PROXY_URL}

RUN test -n "$VITE_CLERK_PUBLISHABLE_KEY" \
    || (echo "VITE_CLERK_PUBLISHABLE_KEY build argument is required" >&2; exit 1)

RUN pnpm --filter @workspace/realestate-tracker build


# ---------------------------------------------------------------------------
# API production image
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS api

WORKDIR /app

RUN corepack enable

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=api-builder --chown=node:node /app /app

USER node

EXPOSE 3000

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]


# ---------------------------------------------------------------------------
# Frontend production image
# ---------------------------------------------------------------------------
FROM nginx:alpine AS web

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=web-builder \
    /app/artifacts/realestate-tracker/dist/public \
    /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
