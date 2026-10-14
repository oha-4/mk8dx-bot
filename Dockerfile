# syntax=docker/dockerfile:1

FROM litestream/litestream:0.5.17@sha256:4b02b9859a6b6b4087d8b8944e15f7e984bd7957cba322bbeee38b0e27b9656a AS litestream

FROM node:26.11.1-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS base
WORKDIR /app
# .npmrc の ignore-scripts と min-release-age をイメージのビルドでも効かせる
COPY package.json package-lock.json .npmrc ./

FROM base AS deps
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS build
RUN npm ci
COPY tsconfig.json tsdown.config.ts ./
COPY src ./src
RUN npm run build

FROM node:26.11.1-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS runtime
ENV NODE_ENV=production \
    DATABASE_PATH=/data/bot.db
WORKDIR /app
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY drizzle ./drizzle
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
# /replica はローカル検証（deploy/compose.local.yaml）の file レプリカ用
RUN mkdir -p /data /replica && chown node:node /data /replica
USER node
VOLUME ["/data"]
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
