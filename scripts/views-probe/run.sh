#!/bin/bash
# Drives the views probe against the real Groq and Tavily, with the store
# isolated so the production record is never touched. The Upstash keys are
# unset explicitly, on top of MOSAIC_DATA_DIR (server/store.js prefers the
# directory when it is set, but belt and braces).
#
#   ./scripts/views-probe/run.sh out.json [from] [to]
#
# Then:  python3 -I scripts/views-probe/analyze.py out.json > report.txt
#        node scripts/views-probe/replay.mjs out.json     # new rules, recorded data
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$HERE/../.." && pwd)"
OUTDIR="${VIEWS_PROBE_STORE:-${TMPDIR:-/tmp}/views-probe-store}"
cd "$APP" || exit 1
exec env -u KV_REST_API_URL -u KV_REST_API_TOKEN -u KV_REST_API_READ_ONLY_TOKEN \
  -u KV_URL -u REDIS_URL -u UPSTASH_REDIS_REST_URL -u UPSTASH_REDIS_REST_TOKEN \
  MOSAIC_DATA_DIR="$OUTDIR" LLM_FALLBACK="${LLM_FALLBACK:-off}" \
  LLM_BACKEND="${LLM_BACKEND:-}" CLAUDE_MODEL="${CLAUDE_MODEL:-}" \
  node --env-file="$APP/.env" "$HERE/viewsprobe.mjs" "$@"
