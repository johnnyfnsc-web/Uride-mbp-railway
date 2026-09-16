# URide Foundation v0.5.0 — Payments + Idempotency + Receipt

This version adds the first financial lifecycle for a completed trip.

## Flow
1. Complete a trip with `PATCH /v1/trips/:tripId/complete`.
2. Capture payment with `POST /v1/payments/trip/:tripId/capture`.
3. Send a unique `Idempotency-Key` header. Repeating the same request returns the original payment and does not charge twice.
4. Successful payments create a receipt. Failed or action-required payments keep the trip completed and create a financial event for recovery.

## Foundation payment provider
The current provider is `MOCK`; no real card data is stored. This allows the end-to-end state machine to be tested safely before Stripe is connected.

Request body examples:
- `{}` -> success
- `{ "simulate": "failed" }` -> declined payment path
- `{ "simulate": "action_required" }` -> payment requires follow-up

## Endpoints
- `POST /v1/payments/trip/:tripId/capture`
- `GET /v1/payments/trip/:tripId`
- `GET /v1/payments/:paymentId/receipt`
