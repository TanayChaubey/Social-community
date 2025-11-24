# Defence Brats Social Network - Production-ready Dockerfile
# Multi-stage build for optimal image size and security
# Security-focused with non-root user and minimal attack surface

# ===================================
# Base Stage - Dependencies
# ===================================
FROM node:20-alpine AS deps

# Security: Update packages and install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache \
    libc6-compat \
    openssl \
    ca-certificates && \
    rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
# Security: Use npm ci for deterministic builds and skip dev dependencies
RUN npm ci --only=production && npm cache clean --force

# ===================================
# Builder Stage - Build Application
# ===================================
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Set environment variables for build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN npm run build

# ===================================
# Production Stage - Runtime
# ===================================
FROM node:20-alpine AS runner

# Security: Create non-root user
RUN addgroup --system --gid 1001 defence-brats && \
    adduser --system --uid 1001 defence-brats

# Install runtime dependencies
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    ca-certificates \
    dumb-init && \
    rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy built application from builder stage
COPY --from=builder /app/public ./public

# Set permissions
RUN mkdir .next && chown defence-brats:defence-brats .next

# Copy build artifacts
COPY --from=builder --chown=defence-brats:defence-brats /app/.next/standalone ./
COPY --from=builder --chown=defence-brats:defence-brats /app/.next/static ./.next/static

# Copy node_modules from deps stage
COPY --from=deps --chown=defence-brats:defence-brats /app/node_modules ./node_modules

# Copy package.json for reference
COPY --from=builder --chown=defence-brats:defence-brats /app/package.json ./package.json

# Switch to non-root user
USER defence-brats

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node healthcheck.js

# Expose port
EXPOSE 3000

# Security: Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]