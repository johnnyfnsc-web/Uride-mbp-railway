# URide Foundation v0.6.0 — Passenger + Driver apps

This release replaces the Passenger and Driver placeholders with Expo/React Native apps connected to the existing NestJS API.

## What can be exercised

1. Passenger registers/logs in, requests a pricing quote, and creates a trip.
2. Driver registers/logs in. The Foundation admin/database must mark the driver and one vehicle as `APPROVED` before the Driver can go `ONLINE`.
3. Driver sends a current coordinate, receives eligibility through Dispatch, accepts the trip, and moves it through ARRIVING → ARRIVED → IN_PROGRESS → COMPLETED.
4. Passenger polls the authoritative trip endpoint every 2.5 seconds while active, showing assigned driver, vehicle, latest GPS, trip state and payment state.
5. Passenger captures the mock payment after completion with an idempotency key.

## API URL on a real phone

`127.0.0.1` on an iPhone/Android phone points to the phone itself, not the development computer. Set `EXPO_PUBLIC_API_URL` to the computer's LAN address, for example:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.25:3000 npm run dev:passenger
EXPO_PUBLIC_API_URL=http://192.168.1.25:3000 npm run dev:driver
```

The phone and development computer must be able to reach each other on the local network.

## Current Foundation limitation

Authentication tokens are returned by Auth but authorization guards are not yet enforced on the API routes. v0.6.0 is for functional integration, not production security. Driver/vehicle approval still belongs to the future Admin workflow.

## Expo baseline

The mobile packages target Expo SDK 57 / React Native 0.86 / React 19.2.x. Use Node.js 22.13+ for the SDK 57 toolchain.
