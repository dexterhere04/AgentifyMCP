# ---- build stage ----
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/gateway/package.json apps/gateway/
COPY packages/*/package.json packages/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY apps/gateway apps/gateway
COPY packages packages
RUN pnpm -r --filter @agentify/gateway run build

# ---- runtime stage ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/gateway/dist apps/gateway/dist
COPY --from=build /app/packages packages
COPY apps/gateway/package.json apps/gateway/
COPY package.json ./
EXPOSE 8787
ENV PORT=8787 BASE_URL=http://localhost:8787
CMD ["node", "apps/gateway/dist/run.js"]
