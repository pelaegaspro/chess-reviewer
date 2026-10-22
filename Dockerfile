FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY client/package*.json ./client/
COPY server/package*.json ./server/

RUN npm install --prefix client \
    && npm install --prefix server

COPY client ./client
COPY server ./server

RUN npm run build --prefix client \
    && npm run build --prefix server

FROM node:22-bookworm-slim AS runtime

# Install native Linux Stockfish package with NNUE support + curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    stockfish \
    curl \
    ca-certificates \
    tar \
    && (curl -sL https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-ubuntu-x86-64-universal.tar -o /tmp/sf.tar \
        && tar -xf /tmp/sf.tar -C /tmp \
        && mv /tmp/stockfish/stockfish-ubuntu-x86-64-universal /usr/local/bin/stockfish \
        && chmod +x /usr/local/bin/stockfish \
        && rm -rf /tmp/sf* || true) \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data/pglite_db
ENV STOCKFISH_PATH=/usr/local/bin/stockfish
ENV STOCKFISH_THREADS=2
ENV STOCKFISH_HASH=128

WORKDIR /app/server

COPY server/package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/src/db/schema.sql ./dist/db/schema.sql
COPY --from=build /app/client/dist /app/client/dist

RUN mkdir -p /app/data/pglite_db

VOLUME ["/app/data/pglite_db"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
