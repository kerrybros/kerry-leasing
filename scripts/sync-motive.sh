#!/usr/bin/env bash
# Run Motive daily sync from repo root (e.g. Render cron).
# Usage: bash scripts/sync-motive.sh   or   ./scripts/sync-motive.sh
set -e
cd "$(dirname "$0")/../apps/api"
pnpm run sync-motive
