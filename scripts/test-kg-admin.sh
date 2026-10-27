#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
name="gk-issue52-test-$$"
cleanup() { docker rm -f "$name-runner" "$name-db" >/dev/null 2>&1 || true; docker network rm "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker network create "$name" >/dev/null
docker run -d --name "$name-db" --network "$name" --network-alias graph-neo4j \
  -e NEO4J_AUTH=neo4j/isolated-issue52-test -e NEO4J_server_memory_heap_initial__size=128m \
  -e NEO4J_server_memory_heap_max__size=256m -e NEO4J_server_memory_pagecache_size=128m \
  --memory=768m neo4j:5.26.31-community >/dev/null
docker run --rm --name "$name-runner" --network "$name" -v "$PWD:/work" -w /work \
  -e NEO4J_READ_TIMEOUT_MS=10000 -e KG_ADMIN_ISOLATED_TEST=issue52 -e GRAPH_DEPLOYMENT=production -e GRAPH_DATASET=public-kg \
  -e NEO4J_URI=bolt://graph-neo4j:7687 -e NEO4J_DATABASE=neo4j -e NEO4J_USER=neo4j -e NEO4J_PASSWORD=isolated-issue52-test \
  node:24.21.0-bookworm-slim node node_modules/vitest/vitest.mjs run tests/kg-admin.integration.test.ts --no-file-parallelism
