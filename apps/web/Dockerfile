# syntax=docker/dockerfile:1
#
# Production image for apps/web. Build from the REPOSITORY ROOT, not this
# directory — the build needs the workspace manifests and the two local
# packages (@hpwd/db, @hpwd/schema, @hpwd/worker) that pnpm links:
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://ten-mien-that.vn .
#
# NEXT_PUBLIC_SITE_URL IS A BUILD ARGUMENT, not a runtime variable, and
# that is not a style choice: Next inlines every NEXT_PUBLIC_* value into
# the JavaScript during `next build`. Passing it to `docker run` instead
# does nothing at all, and the failure is silent — og:image and og:url keep
# pointing at localhost, so every link shared on Zalo, Facebook or iMessage
# renders no preview. See docs/operations.md section 2.1.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---- deps: install once, cached until a manifest or the lockfile changes ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/schema/package.json packages/schema/
# --frozen-lockfile: a build that silently resolves different versions than
# the lockfile is a build nobody can reproduce.
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/schema/node_modules ./packages/schema/node_modules
COPY . .

ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1

# The Prisma client is generated code, not a published package: without this
# the build fails on the first import of @hpwd/db.
# The corporate CA, when there is one, is passed as a BUILD SECRET rather
# than copied in:
#
#   docker build --secret id=corp_ca,src=.certs/corp-ca.pem ...
#
# `prisma generate` downloads its query engine from binaries.prisma.sh, and
# on a machine behind a TLS-intercepting proxy that fails with
# "self-signed certificate in certificate chain". The answer is to TRUST the
# proxy's CA for the duration of that one command — never to disable
# verification. A secret mount keeps the certificate out of every layer of
# the finished image, which a COPY would not; the build works unchanged
# where no such proxy exists, because a missing secret simply leaves the
# file absent and the `if` below skips it.
RUN --mount=type=secret,id=corp_ca,target=/run/secrets/corp_ca \
  sh -c 'if [ -s /run/secrets/corp_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/corp_ca; fi; \
         pnpm --filter @hpwd/db exec prisma generate'
RUN pnpm --filter @hpwd/web build

# ---- runtime ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Never root. A remote-code-execution bug in a dependency is a different
# problem when the process it lands in owns the filesystem.
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

# `output: "standalone"` (next.config.ts) traces exactly the files the server
# needs and copies them here, so the image does not carry the full
# node_modules of a pnpm workspace.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# Exec form, so the Node process is PID 1 and receives SIGTERM directly
# rather than through a shell that would not forward it.
CMD ["node", "apps/web/server.js"]
