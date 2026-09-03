# syntax=docker/dockerfile:1
# Build context: repo root (Coolify: base_directory "/", dockerfile_location "/apps/api/Dockerfile")

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace apps/api

FROM deps AS build
COPY apps/api/nest-cli.json apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/api/scripts apps/api/scripts
COPY apps/api/drizzle apps/api/drizzle
RUN npm run build --workspace apps/api

FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --omit=dev --workspace apps/api \
  && npm cache clean --force
# npm hoistet je nach Tree alles ins Root — dann fehlt apps/api/node_modules
# und das COPY unten würde fehlschlagen. Leeres Verzeichnis ist ok (Require
# löst über /app/node_modules auf).
RUN mkdir -p /app/apps/api/node_modules

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3100 \
    DATABASE_PATH=/data/vibe-crm.sqlite
WORKDIR /app
# npm workspaces hoisten NICHT jede Dep ins Root — workspace-lokale Pakete
# (z.B. better-auth) liegen in apps/api/node_modules und müssen mitkopiert
# werden, sonst findet require() sie zur Laufzeit nicht.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/drizzle ./apps/api/drizzle
# SQLite database lives on this volume (contract §7)
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT||3100}/health`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/api/dist/src/main.js"]
