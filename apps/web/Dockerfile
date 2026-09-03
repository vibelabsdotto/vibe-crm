# syntax=docker/dockerfile:1
# Build-Kontext: Repo-Root (Contract §7)
#   docker build -f apps/web/Dockerfile -t vibe-crm-web .

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
# weitere Workspace-Manifeste, damit npm ci den Lockfile konsistent auflöst
COPY apps/api/package.json apps/api/package.json
RUN npm ci
# npm hoistet je nach Tree alles ins Root — COPY unten braucht das Verzeichnis.
RUN mkdir -p /app/apps/web/node_modules

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# npm workspaces hoisten NICHT jede Dep ins Root — workspace-lokale Pakete
# (z.B. better-auth) muessen mitkopiert werden (gleicher Fix wie API-Dockerfile).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY package.json ./
COPY apps/web ./apps/web
# Build-Args werden als NEXT_PUBLIC_* ins Bundle gebacken (Contract §7)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WEB_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL
RUN npm run build --workspace apps/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
# Next standalone output (Monorepo: server.js liegt unter apps/web/)
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
