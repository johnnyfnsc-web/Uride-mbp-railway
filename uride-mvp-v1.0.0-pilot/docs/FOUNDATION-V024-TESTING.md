# URide Foundation v0.24.0 — Testing & End-to-End Integration

## What is executable now
`npm run test:foundation`

This suite uses Node's built-in test runner and requires no external services. It validates critical source contracts plus deterministic policy scenarios:
- conditional trip claim protects against double acceptance;
- payment idempotency exists in URide and is forwarded to Stripe;
- Stripe webhook signature/replay protection exists;
- Driver compliance blocks ONLINE;
- Driver earnings ledger is idempotent;
- refund reversals are idempotent;
- no-show timing rule;
- safety heuristics do not autonomously alter trips;
- Risk opens human review rather than auto-suspending;
- final suspension belongs to Admin review;
- AI blocks critical autonomous actions;
- Admin routes use AdminGuard;
- public registration cannot create ADMIN;
- scheduled reminder/background dispatch workers exist;
- secure share stores only token hash;
- happy-path and invalid trip transitions;
- cancellation fee rules;
- tip/platform commission separation;
- Risk threshold mapping.

## Live API smoke
`npm run test:live`

Required first:
- running URide API;
- migrated PostgreSQL;
- approved/compliant E2E Driver and approved Vehicle for full trip flow.

Environment:
- `URIDE_E2E_API_URL`
- `URIDE_E2E_PASSENGER_USER_ID`
- `URIDE_E2E_DRIVER_USER_ID`
- `URIDE_E2E_VEHICLE_ID`
- `URIDE_E2E_ADMIN_TOKEN` (optional Admin section)

The runner checks:
1. `/health`
2. Pricing quote
3. Trip creation
4. Trip restore after app/reconnect behavior
5. Driver online/location
6. Dispatch offer
7. Driver accept
8. second accept rejected
9. arriving → arrived → start → complete
10. Stripe PaymentIntent idempotency when Stripe test configuration is available
11. protected Admin dashboard/Operations AI when an Admin token is supplied.

## Pilot regression matrix

| Scenario | Automated Foundation | Requires live integration/device |
|---|---|---|
| Passenger → Driver → complete trip | policy + live runner | PostgreSQL/API |
| Passenger cancellation | policy/static | API/DB |
| Driver cancellation | policy/static | API/DB |
| Passenger no-show | static timing guard | API/DB + elapsed time |
| Two Drivers accept simultaneously | source contract + live second-accept | concurrent live test |
| Driver loses internet | recovery contract | physical device/network test |
| Passenger loses internet | trip restore runner | physical device/network test |
| GPS inaccurate | safety validation static | physical route test |
| Route deviation | static detector | live GPS route |
| Change destination | NOT IMPLEMENTED | product/API work required |
| Document expires | compliance contract | date-controlled DB test |
| Payment declined/action required | payment code contract | Stripe test cards/device |
| Duplicate Stripe webhook | replay contract | Stripe CLI/webhook delivery |
| Finalize trip twice | state transition contract | live API |
| Payment creation twice | idempotency contract | Stripe test mode |
| Push in background | code/config contract | EAS build + physical devices |
| Scheduled ride reminders | worker contract | clock-controlled integration |
| SOS + Operations | safety/admin contract | two-session integration |
| Fraud/Risk review | source contract | DB/Admin integration |
| Refund + Driver reversal | ledger contract | Stripe test mode |
| AI blocks critical action | automated | optional UI verification |

## Known gap found by v0.24
Destination changes during an active trip are part of the regression matrix but do not yet have a production endpoint/state flow in Foundation. This must be implemented or explicitly removed from MVP scope before pilot.

## Testing truth
Passing `test:foundation` means critical code contracts and policy references passed. It is not equivalent to a complete production build or live-service certification.
The live runner and device/provider tests remain mandatory before v1.0 Pilot.
