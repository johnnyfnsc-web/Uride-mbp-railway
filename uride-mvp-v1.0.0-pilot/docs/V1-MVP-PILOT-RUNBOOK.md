# URide MVP v1.0.0 — Pilot Runbook

## What v1.0 closes in code
- Passenger/Driver core session tokens now authenticate Trips, Drivers and Payments.
- Acting Passenger/Driver identity is derived from the Bearer token on those critical flows.
- JWT no longer has a development-secret fallback.
- Production API startup fails if required secrets/provider configuration are missing.
- Production routing must be explicitly configured.
- Passenger can change destination after Driver assignment and before completion; pricing is recalculated, the event is audited, Driver is notified and realtime clients receive the change.
- End-to-end smoke tooling now supports authenticated Passenger and Driver tokens.

## Pilot infrastructure still required
Do not place real credentials in the ZIP or source repository.

1. Provision PostgreSQL and Redis.
2. Install dependencies and generate/apply real Prisma migrations.
3. Configure Stripe in test mode first:
   - secret key
   - publishable key
   - webhook secret
   - Connect configuration
4. Configure a production-grade routing provider URL.
5. Create EAS projects for Passenger and Driver and replace both projectId placeholders.
6. Configure Apple/Google push credentials and create development/release builds.
7. Generate a cryptographically random JWT secret of at least 32 characters.
8. Configure the Admin origin in CORS.
9. Provision an ADMIN user internally.
10. Complete one controlled Passenger → Driver → Payment test before inviting pilot users.

## Required test sequence
Run:
- `npm run test:foundation`
- `npm run test:pilot-gate`
- start PostgreSQL/Redis/API
- `npm run test:live`

Then verify on two physical phones:
- Passenger receives Driver assigned/arrived/start/completed push.
- Driver receives a trip offer while app is backgrounded.
- Driver loses/reconnects internet and trip recovers.
- Passenger closes/reopens app and the same trip is restored.
- destination change updates Driver navigation.
- SOS appears in Operations.
- Stripe test payment succeeds and receipt appears.
- duplicate payment/webhook does not duplicate earnings.
- refund produces the expected ledger reversal.

## Release rule
v1.0 should be opened to pilot users only after `test:pilot-gate` is green and the physical-device/provider checklist has been signed off.
