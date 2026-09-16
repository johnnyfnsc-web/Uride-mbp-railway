# URide v0.4.0 — Dispatch + Live Location test flow

1. Register a Passenger and Driver.
2. Approve the Driver and one Vehicle in the database/admin workflow.
3. Put Driver ONLINE with `PATCH /v1/drivers/:userId/availability`.
4. Send Driver GPS with `PATCH /v1/drivers/:userId/location`.
5. Passenger requests a trip with `POST /v1/trips`.
6. Find nearby eligible drivers with `GET /v1/dispatch/trips/:tripId/candidates`.
7. Passenger app opens `GET /v1/trips/:tripId/stream` as an SSE connection.
8. Driver accepts with `POST /v1/trips/:tripId/accept`.
9. Driver keeps sending GPS; active-trip points are stored and emitted live as `DRIVER_LOCATION`.
10. Advance the trip through arriving → arrived → start → complete.
11. If the Passenger reconnects, call `GET /v1/trips/:tripId`; it returns current trip state and latest driver location.

Production follow-up: authentication guards, WebSocket/Redis fan-out, routing/ETA provider, dispatch offer timeout/retry strategy, payments, idempotency keys, and observability.
