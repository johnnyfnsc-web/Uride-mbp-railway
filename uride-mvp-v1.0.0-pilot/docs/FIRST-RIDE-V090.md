# URide Foundation v0.9.0 — Driver Navigation

This milestone adds driver-focused navigation on top of the v0.8 routing service.

## Driver flow

1. Driver signs in, goes ONLINE and enables live GPS.
2. Driver opens or accepts a trip.
3. Before trip start, navigation targets the passenger pickup.
4. Route card shows remaining distance, ETA and the next maneuver.
5. While GPS is active, the route/ETA refreshes periodically.
6. After `IN_PROGRESS`, navigation switches automatically to the passenger destination.
7. On completion, the active navigation route is cleared.

## Routing endpoint

`POST /v1/routing/route` now returns `steps` in addition to provider, distance, duration and geometry. The development provider is OSRM when available, with an offline-friendly fallback.

## Production note

OSRM public infrastructure and the simplified maneuver text are development aids. Before a commercial pilot, configure a production routing/navigation provider, usage limits, caching, localization, turn-by-turn voice guidance and provider licensing/terms.
