#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== URide MVP v1.0 Local Pilot Setup =="

command -v docker >/dev/null || { echo "Docker is required."; exit 1; }
command -v npm >/dev/null || { echo "Node/npm is required (Node >=22.13 recommended)."; exit 1; }

if [ ! -f .env ]; then
  cp .env.pilot.local.example .env
  echo "Created .env from .env.pilot.local.example"
  echo "Edit .env and set the PILOT_* passwords before continuing."
  exit 2
fi

set -a
source .env
set +a

: "${JWT_ACCESS_SECRET:?Set JWT_ACCESS_SECRET in .env}"
: "${PILOT_PASSENGER_PASSWORD:?Set PILOT_PASSENGER_PASSWORD in .env}"
: "${PILOT_DRIVER_PASSWORD:?Set PILOT_DRIVER_PASSWORD in .env}"
: "${PILOT_ADMIN_PASSWORD:?Set PILOT_ADMIN_PASSWORD in .env}"

docker compose up -d postgres redis
npm install
npm --workspace @uride/api run db:generate

echo "Applying schema with prisma db push for LOCAL PILOT ONLY."
echo "Do not use db push as the production migration strategy."
npm --workspace @uride/api exec -- prisma db push

node services/api/prisma/pilot-seed.mjs

echo
echo "Local database and pilot accounts are ready."
echo "Next terminal: npm run dev:api"
echo "Then run: npm run pilot:first-ride"
