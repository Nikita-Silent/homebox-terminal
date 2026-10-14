# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
ENV NUXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm nuxt prepare && pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NUXT_JOURNAL_PATH=/data/journal.sqlite
COPY --from=build /app/.output ./.output
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
