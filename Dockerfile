# syntax=docker/dockerfile:1

# Build stage: compile native deps (better-sqlite3) with toolchain present.
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# Runtime stage: slim image with ffmpeg (page WebP transcode) only.
FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app

USER node

ENV NODE_ENV=production \
    GVE_NOW_BIND=0.0.0.0 \
    GVE_NOW_ALLOW_REMOTE=1
# Point COMICS_NOW_ROOT at a mounted comics-now install, and publish the port.
EXPOSE 3100
CMD ["node", "server.js"]
