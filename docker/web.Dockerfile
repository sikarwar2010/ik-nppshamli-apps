FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app

FROM base AS pruner
RUN npm install --global turbo@2.10.12
COPY . .
RUN turbo prune web --docker

FROM base AS installer
ARG API_INTERNAL_URL=http://shamli-api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL
# Municipality whose website is built into this image (inlined at build time).
ARG NEXT_PUBLIC_SITE_ID=shamli
ENV NEXT_PUBLIC_SITE_ID=$NEXT_PUBLIC_SITE_ID
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# Workspace packages export dist/ only; .dockerignore excludes **/dist.
RUN pnpm --filter @workspace/types build
RUN pnpm --filter @workspace/api-client build
# NFT copies @swc/helpers but omits esm/; Next 16 requires those files at runtime.
RUN pnpm --filter web build \
  && src="$(find /app/node_modules/.pnpm -type d -path '*/@swc+helpers@*/node_modules/@swc/helpers' | head -n 1)" \
  && dest="$(find /app/apps/web/.next/standalone -type d -path '*/@swc+helpers@*/node_modules/@swc/helpers' | head -n 1)" \
  && test -n "$src" && test -d "$src/esm" && test -n "$dest" \
  && cp -a "$src/." "$dest/"

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001
ENV API_INTERNAL_URL=http://shamli-api:4000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
