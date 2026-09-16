# URide First Ride v0.8.0 — Addresses, Street Route & ETA

## New in this version
- Passenger can type a destination address and geocode it on-device with Expo Location.
- Passenger can still tap the map to choose a destination.
- `POST /v1/routing/route` returns street-route distance, duration and route geometry.
- Passenger draws the returned route with `Polyline`.
- Pricing now consumes route distance/duration instead of the old straight-line estimate.
- Pickup can use the phone's current GPS and reverse geocoding.

## Routing provider
Development defaults to the public OSRM demo endpoint via `ROUTING_BASE_URL`.
This is for local development only. Before pilot/production, replace it with a production routing provider with SLA, API keys, rate limits and billing owned by URide.

If routing is unavailable, the API returns a clearly labeled `FALLBACK` estimate so development can continue. The fallback must not be used as the production fare authority.

## Test flow
1. Start PostgreSQL and the API.
2. Set `EXPO_PUBLIC_API_URL` to the computer's LAN address for both mobile apps.
3. Start Passenger and allow foreground location.
4. Type a destination address or tap the map.
5. Confirm a route line, miles, ETA and estimated fare appear.
6. Request the ride.
7. Start Driver, connect + GPS, enter the Trip ID and accept.
8. Advance arriving → arrived → start → complete.
9. Passenger sees the driver location and can pay with the MOCK provider.
