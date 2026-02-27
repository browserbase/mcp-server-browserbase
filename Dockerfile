FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm run build && \
    pnpm prune --prod --ignore-scripts

FROM gcr.io/distroless/nodejs22-debian12

LABEL io.modelcontextprotocol.server.name="io.github.browserbase/mcp-server-browserbase"

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/cli.js ./cli.js
COPY --from=builder /app/index.js ./index.js

CMD ["cli.js"]