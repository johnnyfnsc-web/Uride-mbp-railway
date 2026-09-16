# URide Foundation v0.10.0 — Automatic Driver Offers

This increment removes the normal need for a Driver to type a Trip ID.

## New dispatch flow

1. Passenger creates a trip; it remains `SEARCHING`.
2. Driver is `APPROVED`, has an `APPROVED` vehicle, turns `ONLINE`, and sends GPS.
3. Driver app polls `GET /v1/dispatch/drivers/:driverUserId/next-offer` every 3 seconds.
4. Backend chooses a nearby searching trip and creates a 20-second `TripOffer`.
5. Driver sees pickup, destination, estimated fare, trip length, pickup distance, and countdown.
6. Reject marks only that offer `REJECTED`; the passenger trip keeps searching.
7. Accept atomically claims the trip. Other pending offers for that trip become `CANCELLED`.
8. Expired offers become `EXPIRED` and cannot be accepted.

## Notification behavior

For v0.10.0 the Driver app provides an in-app alert and vibration when a new offer arrives. Production push notifications will be added with a push provider/device-token lifecycle later; the dispatch state remains server-authoritative.

## New endpoints

- `GET /v1/dispatch/drivers/:driverUserId/next-offer?radiusMiles=20&ttlSeconds=20`
- `POST /v1/dispatch/offers/:offerId/reject`
- Existing `POST /v1/trips/:tripId/accept` now accepts an optional `offerId`.

## Database

Run Prisma migration after installing dependencies because v0.10.0 introduces `TripOffer` and `TripOfferStatus`.
