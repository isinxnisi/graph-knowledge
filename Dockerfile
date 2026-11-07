FROM node:24.21.0-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS builder
COPY tsconfig.json next.config.ts proxy.ts ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY db/member ./db/member
COPY migrations/knowledge-foundation ./migrations/knowledge-foundation
COPY vocabulary ./vocabulary
COPY neo4j ./neo4j
COPY datasets ./datasets
COPY data/advertising ./data/advertising
COPY data/ai-lab/initial.json ./data/ai-lab/initial.json
# Formal discovery starts without beta/test theme pins. The public recent list
# still comes from the formal knowledge catalogue.
COPY data/theme-discovery.production.json ./data/theme-discovery.json
COPY docs/research/phase-13-relation-model/v2/ledger.json ./docs/research/phase-13-relation-model/v2/ledger.json
COPY scripts/public-kg.ts scripts/production-readiness.mjs scripts/generate-contribution-roles.ts scripts/build-publication-probe.mjs scripts/publication-compatibility.ts scripts/knowledge-mission-client.ts ./scripts/
ENV GRAPH_DATASET=public-kg GRAPH_DEPLOYMENT=production
RUN npm run roles:check && node scripts/build-publication-probe.mjs && NODE_OPTIONS=--max-old-space-size=3072 npm run build -- --webpack

# 運用CLIだけはtsxと受入資料を必要とする。Webへは含めない。
FROM builder AS ops
COPY fixtures/demo.json ./fixtures/demo.json
COPY scripts/member-migrate.ts scripts/member-ops.ts scripts/community-safety.ts scripts/community-recovery.ts scripts/ai-identity-ops.ts scripts/official-profile-ops.ts ./scripts/
ENV NODE_ENV=production
USER node
ENTRYPOINT ["node", "--import", "tsx", "scripts/public-kg.ts"]
CMD ["validate"]

# Common knowledge maintenance and bounded resident workers. No private profile,
# API key or beta state is built into this image; Compose supplies read-only files.
FROM ops AS knowledge-ops
USER root
COPY scripts/knowledge-migrate.ts scripts/knowledge-review-worker.ts scripts/knowledge-publication-worker.ts scripts/knowledge-patrol-worker.ts scripts/knowledge-collection-worker.ts scripts/knowledge-collection-reader.ts ./scripts/
# Local launchers load this file. Production values arrive only through runtime
# environment variables, so the compatibility file is deliberately empty.
RUN install -m 0444 /dev/null /app/.env.public
USER node
ENTRYPOINT ["node", "--import", "tsx"]
CMD ["scripts/knowledge-migrate.ts"]

# One-shot public-artifact validator/publisher. No KG/member env or model runtime.
FROM dependencies AS lab-artifact-ops
COPY lib/domain ./lib/domain
COPY lib/server/ai-lab-artifact.ts ./lib/server/ai-lab-artifact.ts
COPY scripts/ai-lab-artifact.ts ./scripts/ai-lab-artifact.ts
COPY data/ai-lab/initial.json ./data/ai-lab/initial.json
ENV NODE_ENV=production
USER node
ENTRYPOINT ["node", "--import", "tsx", "scripts/ai-lab-artifact.ts"]

FROM node:24.21.0-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next-public/standalone ./
COPY --from=builder --chown=node:node /app/.next-public/static ./.next-public/static
COPY --from=builder --chown=node:node /app/db/member ./db/member
COPY --from=builder --chown=node:node /app/migrations/knowledge-foundation ./migrations/knowledge-foundation
COPY --from=builder --chown=node:node /app/.local/publication-probe/publication-probe.cjs ./publication-probe.cjs
COPY --from=builder --chown=node:node /app/app/fonts/BIZUDPMincho-OG.woff ./app/fonts/BIZUDPMincho-OG.woff
COPY --from=builder --chown=node:node /app/app/fonts/OFL.txt ./font-licenses/BIZUDPMincho-OFL.txt
COPY --from=builder /app/data/ai-lab/initial.json ./data/ai-lab/initial.json
COPY --chown=node:node public/ai-lab/apprentice-profile.png ./public/ai-lab/apprentice-profile.png
COPY --chown=node:node public/ai ./public/ai
RUN chown root:root /app /app/data /app/data/ai-lab /app/data/ai-lab/initial.json \
    && chmod 0555 /app/data /app/data/ai-lab && chmod 0444 /app/data/ai-lab/initial.json
COPY --chown=node:node scripts/production-readiness.mjs ./scripts/production-readiness.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=10s --start-period=20s --retries=4 CMD ["node", "scripts/production-readiness.mjs"]
CMD ["node", "server.js"]
