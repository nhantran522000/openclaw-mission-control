# ============================================
# Stage 1: Dependencies
# Install all dependencies (including devDependencies for Prisma generation)
# ============================================
FROM node:20-alpine AS deps

# Install necessary build tools for native modules
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies needed for Prisma generation)
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# ============================================
# Stage 2: Builder
# Build the Next.js application
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variable for build
ENV NEXT_TELEMETRY_DISABLED=1

# Generate Prisma client again to ensure it's in the correct location
RUN npx prisma generate

# Build the Next.js application
RUN npm run build

# ============================================
# Stage 3: Production Runner
# Minimal production image with only necessary files
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the entire built application
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Copy Prisma schema and generated client for runtime
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Switch to non-root user
USER nextjs

# Expose port 3000
EXPOSE 3000

# Set the port environment variable
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application using npm run start
CMD ["npm", "run", "start"]
