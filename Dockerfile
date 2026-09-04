# ---- build stage ----
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/gateway/package.json apps/gateway/
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/*/package.json packages/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY apps apps
COPY packages packages
# gateway (server) + dashboard (React UI) builds
RUN pnpm -r --filter @agentify/gateway run build
RUN pnpm --filter @agentify/dashboard web:build

# ---- runtime stage ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
# Full workspace tree (incl. .pnpm store + per-package node_modules links) so
# both the compiled gateway and the tsx-run dashboard resolve their deps.
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages packages
COPY --from=build /app/apps apps
EXPOSE 8787 8788
ENV PORT=8787 BASE_URL=http://localhost:8787
CMD ["node", "--import", "tsx", "apps/gateway/src/run.ts"]
