# SINT Gateway Server — Multi-stage Docker build.

# ── Stage 1: Install & Build ──
FROM node:22-slim AS builder
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config files first (for layer caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/core/package.json packages/core/
COPY packages/capability-tokens/package.json packages/capability-tokens/
COPY packages/evidence-ledger/package.json packages/evidence-ledger/
COPY packages/policy-gateway/package.json packages/policy-gateway/
COPY packages/persistence/package.json packages/persistence/
COPY apps/gateway-server/package.json apps/gateway-server/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/core/ packages/core/
COPY packages/capability-tokens/ packages/capability-tokens/
COPY packages/evidence-ledger/ packages/evidence-ledger/
COPY packages/policy-gateway/ packages/policy-gateway/
COPY packages/persistence/ packages/persistence/
COPY apps/gateway-server/ apps/gateway-server/
COPY tsconfig.base.json ./

# Build everything
RUN pnpm run build

# ── Stage 2: Production ──
FROM node:22-slim AS production
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app
ENV NODE_ENV=production

# Copy workspace structure
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --from=builder /app/packages/core/package.json packages/core/
COPY --from=builder /app/packages/core/dist/ packages/core/dist/
COPY --from=builder /app/packages/capability-tokens/package.json packages/capability-tokens/
COPY --from=builder /app/packages/capability-tokens/dist/ packages/capability-tokens/dist/
COPY --from=builder /app/packages/evidence-ledger/package.json packages/evidence-ledger/
COPY --from=builder /app/packages/evidence-ledger/dist/ packages/evidence-ledger/dist/
COPY --from=builder /app/packages/policy-gateway/package.json packages/policy-gateway/
COPY --from=builder /app/packages/policy-gateway/dist/ packages/policy-gateway/dist/
COPY --from=builder /app/packages/persistence/package.json packages/persistence/
COPY --from=builder /app/packages/persistence/dist/ packages/persistence/dist/
COPY --from=builder /app/apps/gateway-server/package.json apps/gateway-server/
COPY --from=builder /app/apps/gateway-server/dist/ apps/gateway-server/dist/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3100/v1/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "apps/gateway-server/dist/index.js"]
