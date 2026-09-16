# URide Foundation v0.10.0

URide MVP monorepo foundation with Passenger, Driver, Admin placeholder and NestJS API.

## v0.10.0 milestone

The Passenger and Driver placeholders are now Expo/React Native applications connected to the backend.

Passenger flow: **Auth → Quote → Request Ride → Track Trip → Mock Payment**.

Driver flow: **Auth → Online → Send Location → Accept Ride → Arriving → Arrived → Start → Complete**.

See `docs/FIRST-RIDE-V060.md` for the phone/API networking setup and current Foundation limitations.

## Commands

```bash
npm install
npm run dev:api
npm run dev:passenger
npm run dev:driver
```

PostgreSQL and Redis can be started with `docker compose up -d`. Configure the API with `.env.example`.


## v0.10.0
Passenger y Driver ahora incluyen mapas, GPS foreground y selección visual de puntos. Ver `docs/FIRST-RIDE-V070.md`.


## v0.10.0
Address search, street routing, route geometry, ETA and route-based pricing. See `docs/FIRST-RIDE-V080.md`.


## Foundation v0.11.0 — Cancellations, Wait & No-show
- Passenger and Driver cancellation endpoints and UI.
- MVP cancellation fee: passenger cancels after driver assignment = $5 pending; pre-assignment free; driver/system cancellation waived.
- Driver arrival starts a 5-minute wait clock.
- Passenger no-show can only be marked after 5 minutes and records a $5 pending fee.
- Trip event audit trail records cancellations and no-show.
- These fee amounts/windows are development defaults and must become market-configurable before commercial launch.

## Foundation v0.12.0 — Ratings, Tips, Favorites & Return Ride
- Passenger can tip during MOCK payment capture; receipt separates subtotal and tip.
- Passenger and Driver can rate each other 1–5 stars after a completed trip.
- Passenger can save the completed-trip driver as a favorite.
- “Return with this driver” creates a reversed return trip linked to the original and marks the same driver as preferred.
- Dispatch prioritizes the preferred driver when that driver is online and within the configured radius; it still falls back to other available drivers rather than leaving the passenger stranded.

## Foundation v0.13.0 — Scheduled Rides & Reservations
- Passenger can schedule a ride at least 10 minutes in advance.
- Scheduled trips remain SCHEDULED until the dispatch window opens 30 minutes before pickup.
- Passenger can optionally select a saved favorite driver for a reservation.
- Dispatch prioritizes that preferred driver but can fall back to other available drivers.
- Completed trips can create an immediate return or a scheduled return with the same driver preferred.
- Reservation reminder API produces 24-hour and 1-hour reminders and records delivery state to avoid duplicates.
- Passenger app includes basic reservation/favorite controls for development testing.
- Production push notifications and calendar-style date/time pickers remain a later integration.

## Foundation v0.14.0 — Trip Safety
- Passenger and Driver have an in-trip SOS action.
- Safety incidents are stored independently with reporter, type, location, status and timestamps.
- Passenger can save a primary trusted contact and request a shareable live trip snapshot.
- Driver GPS performs basic development heuristics for route deviation and unusual stops.
- Safety heuristics create alerts only; they never automatically cancel, suspend, or contact emergency services.
- Route deviation currently uses a straight pickup→destination corridor heuristic. Production must use map matching/route geometry.
- Real emergency-service escalation, outbound SMS/push to trusted contacts, operator acknowledgement and privacy/legal controls remain production integrations.

## Foundation v0.15.0 — Support, Lost Items, Refunds & Disputes
- Passenger and Driver can open support tickets tied to a trip.
- Tickets support categories, priority, status, threaded messages and optional agent assignment.
- Lost-item reports track item type, description, driver response, return coordination and optional return fee.
- Refund/dispute requests are stored separately with requested/approved amounts and review status.
- Trip events record support, lost-item and refund activity for auditability.
- Passenger and Driver apps include development UI to open cases and report lost items; Passenger can request refund review.
- Actual payment-provider refunds, photo upload/storage, agent authentication and outbound notifications remain later integrations.

## Foundation v0.16.0 — Admin & Operations
- New Vite/React Admin web app under `apps/admin`.
- Protected `/v1/admin/*` API with ADMIN-role JWT guard.
- Operations metrics, active trips, driver/vehicle approvals, support queue, safety incidents, refunds and audit log.
- Administrative changes are recorded in `AdminAuditLog`.
- Public auth registration still does not create ADMIN users; admin provisioning remains an internal operation.

## Foundation v0.17.0 — Driver Onboarding & Compliance
- Driver-document records for license, vehicle registration, insurance, inspection and other documents.
- Expiration dates and document review states.
- Admin document-review queue with approve/reject actions.
- Driver cannot go ONLINE if mandatory approved documents are missing or expired.
- Admin cannot approve a Driver until the license and at least one approved vehicle's registration/insurance are valid.
- Expired documents can automatically force the Driver OFFLINE during compliance checks.
- File bytes are not yet uploaded by this milestone; `storageKey` is a private-storage reference for the upcoming upload/storage integration.

## Foundation v0.18.0 — Push Notifications
- Device push-token registration for Passenger and Driver.
- Expo Push Service delivery abstraction with delivery history.
- Background Driver offer worker, so push offers do not depend on the Driver UI polling.
- Passenger ride-status notifications and cancellation alerts.
- Scheduled ride reminder worker.
- Driver document review/expiration notifications.
- Support/refund status notifications from Admin actions.
- Mobile apps include `expo-notifications` and `expo-constants`.
- A real EAS project ID and platform push credentials are still required to test remote push delivery end-to-end.

## Foundation v0.19.0 — Real Stripe Payments
- Stripe PaymentIntent + Passenger PaymentSheet flow.
- Server-side fare/tip/platform-fee/Driver split.
- Stripe Connect onboarding and connected-account readiness for Drivers.
- Destination charges when the Driver payout account is active.
- Stripe webhook signature verification and duplicate-event protection.
- Real full/partial refund API integration, including Connect transfer reversal/application-fee refund.
- Cancellation/no-show fees can use the same Stripe payment flow.
- Default Foundation commission: 20% of subtotal; tip is excluded from the platform commission.

## Foundation v0.20.0 — Advanced Safety & Operations
- Safety priorities and operational escalation levels.
- SafetyAction history for acknowledgement, notes, escalation, trusted-contact confirmation, emergency-services confirmation and resolution.
- Operations live-trip monitor with recent GPS, participants, vehicle and safety history.
- Dashboard metrics for critical and unacknowledged incidents.
- Secure, expiring trip-share links using random tokens with only SHA-256 hashes stored.
- Push alerts to ADMIN users for high/critical incidents.
- Passenger/Driver receive safety status updates from Operations.
- No automatic 911 call is performed; emergency-contact actions are explicitly operator-recorded.

## Foundation v0.21.0 — Fraud & Risk
- Rolling risk score and LOW/MEDIUM/HIGH/CRITICAL levels.
- Risk signals for failed/repeated payments, abnormal cancellations, device reuse, rapid account creation, refund abuse and Stripe chargebacks.
- Device identifiers are SHA-256 hashed before persistence.
- HIGH/CRITICAL scores open a RiskCase and notify Operations; automatic scoring does not permanently suspend an account.
- Admin RISK dashboard supports WATCH, temporary RESTRICT, CLEAR and manually reviewed SUSPEND decisions.
- Temporary trip/payment restrictions are enforced server-side.
- Risk thresholds are environment-configurable.

## Foundation v0.22.0 — Pricing + Driver Earnings
- PricingRule now includes a configurable URide commission by service type.
- Fare quotes expose estimated platform fee and estimated Driver earnings.
- Driver offers show estimated net Driver earnings instead of only Passenger fare.
- Successful Stripe payments create an idempotent Driver earnings ledger with trip earnings and tips separated.
- Stripe refunds create proportional negative Driver ledger adjustments.
- Driver app includes DAY/WEEK/MONTH earnings summaries, recent ledger history and active bonus progress.
- Bonus campaigns count only completed trips with successful payment and create a single award per Driver/campaign.
- Admin FINANCE tab manages pricing rules and bonus campaigns.

## Foundation v0.23.0 — URide AI + Operations Intelligence
- Passenger contextual assistant for trip status, Driver/location availability, fare, payment and safety guidance.
- Driver business assistant for trip state, documents, weekly ledger earnings and active bonus campaigns.
- ADMIN-protected Support Copilot summarizes ticket/trip/payment/safety context.
- ADMIN-protected Operations Intelligence summarizes active operational priorities.
- Every AI run is auditable in `AiAssistantRun`.
- Critical financial, disciplinary, Pricing, document-approval and emergency actions are explicitly blocked from AI execution.
- This milestone uses `FOUNDATION_RULES`; external model execution is intentionally disabled until production privacy/security controls are added.

## Foundation v0.24.0 — Testing & End-to-End Integration
- `npm run test:foundation` executes no-service regression tests for critical URide contracts.
- `npm run test:live` is a reusable smoke runner for a running API/PostgreSQL/Stripe test environment.
- `npm run test:pilot-gate` reports production blockers and intentionally fails until pilot prerequisites are configured.
- The regression matrix documents automated, live-service and physical-device coverage separately.
- v0.24 identifies active-trip destination change as an unresolved MVP implementation gap.

## URide MVP v1.0.0 — Pilot Candidate
- Core Passenger/Driver authentication is enforced on Trips, Drivers and Payments.
- JWT development fallback removed; production startup validates required configuration.
- Active-trip destination change is now implemented with recalculated pricing, audit event, push and realtime update.
- Authenticated E2E smoke runner updated for Passenger/Driver tokens.
- This ZIP is a pilot candidate, not a preconfigured production deployment: Stripe/EAS credentials and real Prisma migrations must be supplied in the target environment.
