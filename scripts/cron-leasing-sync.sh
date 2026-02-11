#!/usr/bin/env bash
# Run every 15 min: call sync-check first; only run full sync when Domo actually changed (don't full-sync every 15 min).
# Usage: set API_BASE_URL and optionally LEASING_SYNC_WEBHOOK_SECRET (env or .env), then:
#   ./scripts/cron-leasing-sync.sh
# Crontab: */15 * * * * /path/to/stoagroupDB/scripts/cron-leasing-sync.sh

set -e
cd "$(dirname "$0")/.."

# Load .env if present
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

API_BASE_URL="${API_BASE_URL:-}"
SECRET="${LEASING_SYNC_WEBHOOK_SECRET:-}"
if [ -z "$API_BASE_URL" ]; then
  echo "API_BASE_URL not set" >&2
  exit 1
fi

BASE="${API_BASE_URL%/}"
CHECK_URL="$BASE/api/leasing/sync-check"
SYNC_URL="$BASE/api/leasing/sync-from-domo"

# Check for changes (lightweight: Domo metadata vs last sync)
if [ -n "$SECRET" ]; then
  CHECK_RESULT=$(curl -sS -H "X-Sync-Secret: $SECRET" "$CHECK_URL")
else
  CHECK_RESULT=$(curl -sS "$CHECK_URL")
fi
if ! echo "$CHECK_RESULT" | grep -q '"changes":true'; then
  echo "No Domo changes; skipping full sync."
  exit 0
fi

echo "Domo changes detected; running sync-from-domo..."
# Run sync
if [ -n "$SECRET" ]; then
  curl -sS -X POST -H "Content-Type: application/json" -H "X-Sync-Secret: $SECRET" "$SYNC_URL"
else
  curl -sS -X POST -H "Content-Type: application/json" "$SYNC_URL"
fi
