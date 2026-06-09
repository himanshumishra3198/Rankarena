# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and prisma schema first (better layer caching)
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts* ./

# Install all deps (prisma generate needs the CLI from devDeps)
RUN npm ci

# Generate Prisma client → src/generated/prisma/
RUN npx prisma generate

# Copy source and compile TypeScript → dist/
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy compiled output and prisma files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

EXPOSE 4000

CMD ["node", "dist/index.js"]
