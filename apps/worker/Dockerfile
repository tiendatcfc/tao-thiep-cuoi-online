# syntax=docker/dockerfile:1
#
# Production image for apps/worker (BullMQ consumer: audio transcoding and
# background removal). Build from the REPOSITORY ROOT:
#
#   docker build -f apps/worker/Dockerfile -t hpwd-worker .
#
# docs/operations.md section 3 has described this image since Phase 2; it
# did not exist until Phase 4. The two constraints it documents are both
# load-bearing and both easy to undo by accident:
#
# 1. ffmpeg must be IN the image. The worker shells out to it for every
#    uploaded track; without it every audio job fails at the first attempt
#    with ENOENT and the couple's music sits at "Đang xử lý" forever.
# 2. The CMD must exec the worker DIRECTLY. `pnpm start` puts a wrapper
#    between the supervisor and Node that does not reliably forward
#    SIGTERM, so the graceful shutdown — which waits for an in-flight
#    transcode to finish — never runs, and ffmpeg is SIGKILLed mid-write at
#    the end of the grace period.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/schema/package.json packages/schema/
RUN pnpm install --frozen-lockfile

FROM base AS runner
WORKDIR /app

# See note 1 above. `--no-install-recommends` keeps this from pulling in a
# desktop's worth of codecs and X libraries.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/schema/node_modules ./packages/schema/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY apps/worker ./apps/worker
COPY packages/db ./packages/db
COPY packages/schema ./packages/schema

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

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs worker \
  && chown -R worker:nodejs /app
USER worker

WORKDIR /app/apps/worker
# See note 2 above: exec form, tsx directly, no pnpm wrapper.
CMD ["../../node_modules/.bin/tsx", "src/index.ts"]
