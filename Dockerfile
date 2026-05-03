# Production image for the BlindSol API.
#
# The pnpm workspace publishes @blindsol/magicblock-client as raw
# TypeScript (its package.json points at .ts source), so the runtime needs
# `tsx` rather than `node dist/index.js`. We install all workspace deps
# the API depends on, then start with tsx — it transpiles on-the-fly with
# ~50ms startup overhead, which is fine for a long-running container.
#
# Built and deployed via Fly.io. See fly.toml for runtime config.

FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /repo

# Workspace metadata first for Docker-layer cache friendliness
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/agent/package.json apps/agent/
COPY apps/web/package.json apps/web/
COPY packages/magicblock-client/package.json packages/magicblock-client/

# Install only what the API needs (`...` = the package AND its workspace
# dependencies, so we skip web + agent in this image). Dev deps included
# because tsx is in api/devDependencies.
RUN pnpm install --frozen-lockfile --filter @blindsol/api...

# Source
COPY apps/api ./apps/api
COPY packages/magicblock-client ./packages/magicblock-client

ENV NODE_ENV=production
ENV API_PORT=3001
EXPOSE 3001

WORKDIR /repo/apps/api
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
