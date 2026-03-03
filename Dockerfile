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

# Copy Prisma schema before npm ci to enable postinstall hook
COPY prisma ./prisma/

# Install all dependencies (including devDependencies needed for Prisma generation)
RUN npm ci

# Generate Prisma client
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

# Build the Next.js application
RUN npm run build

# ============================================
# Stage 3: Production Runner
# Minimal production image with only necessary files
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# Install libc6-compat for Prisma query engine
RUN apk add --no-cache libc6-compat

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy package files and install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy Prisma schema for runtime
COPY prisma ./prisma/

# Copy generated Prisma client from deps stage
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy built Next.js application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Set proper ownership for all files
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port 3000
EXPOSE 3000

# Set the port environment variable
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application using npm run start
CMD ["npm", "run", "start"]
