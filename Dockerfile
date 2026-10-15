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
COPY neo4j ./neo4j
COPY datasets ./datasets
COPY data/advertising ./data/advertising
COPY docs/research/phase-13-relation-model/v2/ledger.json ./docs/research/phase-13-relation-model/v2/ledger.json
COPY scripts/public-kg.ts scripts/production-readiness.mjs ./scripts/
ENV GRAPH_DATASET=public-kg GRAPH_DEPLOYMENT=production
RUN npm run build

# 運用CLIだけはtsxと受入資料を必要とする。Webへは含めない。
FROM builder AS ops
COPY fixtures/demo.json ./fixtures/demo.json
COPY db/member ./db/member
COPY scripts/member-migrate.ts scripts/member-ops.ts ./scripts/
ENV NODE_ENV=production
USER node
ENTRYPOINT ["node", "--import", "tsx", "scripts/public-kg.ts"]
CMD ["validate"]

FROM node:24.21.0-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next-public/standalone ./
COPY --from=builder --chown=node:node /app/.next-public/static ./.next-public/static
COPY --from=builder --chown=node:node /app/app/fonts/OFL.txt ./font-licenses/BIZUDPMincho-OFL.txt
COPY --chown=node:node scripts/production-readiness.mjs ./scripts/production-readiness.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=10s --start-period=20s --retries=4 CMD ["node", "scripts/production-readiness.mjs"]
CMD ["node", "server.js"]
