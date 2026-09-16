# URide Pilot Readiness Gate

Run:
`npm run test:pilot-gate`

The pilot gate intentionally fails while production prerequisites remain unresolved.

Current expected blockers in Foundation:
- real Stripe environment/secrets are not configured;
- Passenger/Driver EAS project IDs are placeholders;
- routing still defaults to the public OSRM demo server;
- JWT has a development fallback secret;
- several Passenger/Driver/payment endpoints trust supplied user IDs rather than enforcing authenticated identity;
- v0.13+ Prisma migrations include reference migration files that must be generated/applied against the real schema.

Additional operational gates before a public pilot:
- MFA/strong Admin authentication and session revocation;
- rate limiting and abuse controls on public endpoints;
- real private document storage and signed access;
- production push credentials and physical-device tests;
- Stripe Connect onboarding and payout reconciliation;
- emergency/safety procedures by launch jurisdiction;
- privacy/data-retention review;
- crash monitoring, logs, metrics and alerting;
- backup/restore test;
- App Store/Play production configuration.
