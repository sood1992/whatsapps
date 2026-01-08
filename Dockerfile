# TreatForTails WhatsApp Automation
# Production Dockerfile

FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY dashboard/package.json dashboard/package-lock.json ./dashboard/

# Install dependencies
RUN npm ci
RUN cd dashboard && npm ci

# Build the application
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/dashboard/node_modules ./dashboard/node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build backend
RUN npm run build

# Build dashboard
RUN cd dashboard && npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 treatfortails

# Copy built assets with proper ownership
COPY --from=builder --chown=treatfortails:nodejs /app/dist ./dist
COPY --from=builder --chown=treatfortails:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=treatfortails:nodejs /app/package.json ./package.json
COPY --from=builder --chown=treatfortails:nodejs /app/prisma ./prisma

# Copy dashboard build
COPY --from=builder --chown=treatfortails:nodejs /app/dist/dashboard ./dist/dashboard

USER treatfortails

EXPOSE 3000

ENV PORT=3000

CMD ["npm", "start"]
