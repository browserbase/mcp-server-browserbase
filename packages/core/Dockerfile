# Build stage
FROM node:18-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Copy TSConfig
COPY tsconfig.json ./

# Copy the source code first
COPY . .

# Install dependencies
RUN npm install

# Build the TypeScript source code
RUN npm run build

# Create the final image from a smaller Node.js runtime
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy built files from builder stage
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/cli.js /app/cli.js
COPY --from=builder /app/index.js /app/index.js
COPY --from=builder /app/index.d.ts /app/index.d.ts
COPY --from=builder /app/config.d.ts /app/config.d.ts
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json
COPY --from=builder /app/node_modules /app/node_modules

# Set environment variables (to be configured at runtime)
ENV BROWSERBASE_API_KEY=<YOUR_BROWSERBASE_API_KEY>
ENV BROWSERBASE_PROJECT_ID=<YOUR_BROWSERBASE_PROJECT_ID>

# Command to run the application with absolute path
ENTRYPOINT [ "node", "/app/cli.js" ] 