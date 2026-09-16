# URide Foundation v0.18.0 — Push Notifications

## Device registration
Passenger and Driver apps request notification permission, obtain an Expo push token and register it with the URide API.
The backend stores active tokens by user, platform and app variant.

## Push events
- Driver: new trip offer.
- Passenger: driver assigned, arriving, arrived, trip started and trip completed.
- Passenger/Driver: trip cancellation.
- Passenger: scheduled ride reminders at approximately 24 hours and 1 hour.
- Driver: document review and document-expiration reminders.
- Passenger/Driver: support and refund status updates where applicable.

## Background dispatch
`DispatchService` now contains a Foundation dispatch worker. It checks ONLINE drivers every few seconds and can create/send offers without requiring the Driver screen to poll first.
For multi-instance production deployments this should move to a dedicated queue/worker with distributed locking.

## Scheduled notification worker
The notification service periodically processes scheduled-ride reminders and document-expiration reminders. Manual processing endpoints are also included for testing.

## Provider
The backend sends Expo push messages through Expo Push Service. `EXPO_ACCESS_TOKEN` is supported when enhanced push security is enabled.

## Mobile configuration required
Replace `REPLACE_WITH_EAS_PROJECT_ID` in each app config with the real EAS project ID and create development/release builds with push credentials configured.

Important: remote push notifications are not a reliable Expo Go testing path. Use a development build/release build and a device/supported simulator environment.

## Production follow-up
Before pilot launch add:
- Push receipt reconciliation/retry queue.
- Strong device-token authentication and token ownership checks.
- Per-event localization templates.
- Notification preferences and quiet-hours rules where appropriate.
- Dedicated workers/queues for horizontal scaling.
