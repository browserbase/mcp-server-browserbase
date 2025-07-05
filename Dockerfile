# ----- Build Stage -----
FROM node:lts-alpine AS builder
WORKDIR /app

# Copy package and configuration
COPY package.json pnpm-lock.yaml tsconfig.json ./

# Copy source code
COPY src ./src

# Copy config files
COPY config.d.ts index.d.ts ./

# Install dependencies and build
RUN corepack enable && pnpm install --frozen-lockfile && pnpm build

# ----- Production Stage -----
FROM node:lts-alpine
WORKDIR /app

# Copy package.json and install production dependencies
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile --ignore-scripts

# Copy built artifacts and required files
COPY --from=builder /app/dist ./dist
COPY index.js config.d.ts index.d.ts cli.js ./

# Expose HTTP port
EXPOSE 8080

# Default command using CLI flags
CMD ["node", "cli.js", "--port", "8080"]