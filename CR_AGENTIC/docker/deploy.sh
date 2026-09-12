#!/usr/bin/env bash
#
# CR_AGENTIC single-VM deploy helper (Option A).
# Run from the CR_AGENTIC/docker directory:  ./deploy.sh
#
# Idempotent: builds images, applies DB migrations (one-shot), then
# (re)starts the full stack. Safe to re-run for upgrades.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="../.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  echo "Create it first:  cp ../.env.prod.example ../.env  && edit values."
  exit 1
fi

# docker compose (v2) vs docker-compose (v1)
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
else
  DC="docker-compose"
fi

COMPOSE="$DC --env-file $ENV_FILE -f $COMPOSE_FILE"

echo "==> Building images (no-cache so source edits always ship)..."
$COMPOSE build --no-cache

# `up` runs the one-shot `migrate` service first (app services declare
# depends_on migrate: service_completed_successfully), so migrations are
# applied before the API/workers start.
echo "==> Applying migrations and starting stack..."
$COMPOSE up -d

echo "==> Current status:"
$COMPOSE ps

echo ""
echo "Done. Agent API should be listening on :3100 (health: /health)."
echo "Tail logs with:  $COMPOSE logs -f"
