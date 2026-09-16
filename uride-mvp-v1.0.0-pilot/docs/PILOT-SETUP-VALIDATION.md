# URide MVP v1.0 — Pilot Setup Validation

Validated while building this package:
- `scripts/pilot-local-setup.sh`: shell syntax PASS.
- `services/api/prisma/pilot-seed.mjs`: Node syntax PASS.
- `tests/pilot-first-ride.mjs`: Node syntax PASS.
- `tests/live-api.smoke.mjs`: Node syntax PASS.
- 61 TypeScript/TSX files: syntax smoke PASS.
- `npm run test:foundation`: 26/26 PASS.

Not executed in this environment:
- Docker/PostgreSQL/Redis startup.
- `npm install`.
- Prisma generate/db push.
- seeded database run.
- first live API ride.
- Stripe/EAS network configuration.

Those steps require a computer/runtime with Docker, internet access and the user's external-service credentials.
