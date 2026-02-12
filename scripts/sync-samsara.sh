#!/usr/bin/env bash
# Run Samsara daily sync from repo root (e.g. Render cron).
# Usage: bash scripts/sync-samsara.sh   or   ./scripts/sync-samsara.sh
set -e
cd "$(dirname "$0")/../apps/api"
pnpm run sync-samsara
