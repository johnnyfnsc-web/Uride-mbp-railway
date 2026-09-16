# URide v1.0 Pilot Security Notes

Core Trips, Drivers and Payments now require authenticated Bearer tokens. The server derives the acting user identity from the signed token on these flows instead of trusting a Passenger/Driver ID submitted by the mobile client.

Admin remains protected by AdminGuard and role=ADMIN.

Before a wider commercial launch, extend the same strict identity/authorization pattern across every auxiliary endpoint (Support, Safety, Notifications, Risk, Earnings, AI, Profiles), add refresh-token/session revocation, MFA for Admin, rate limiting, centralized secret management, private document-object storage, production logging/alerting, and a full privacy/data-retention review.

URide AI remains advisory only and cannot autonomously issue refunds, charge cards, suspend accounts, approve documents, change pricing, or contact emergency services.
