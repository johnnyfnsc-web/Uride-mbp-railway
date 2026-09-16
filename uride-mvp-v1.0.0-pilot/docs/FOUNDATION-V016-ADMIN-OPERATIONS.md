# URide Foundation v0.16.0 — Admin & Operations

This milestone adds a browser-based Operations dashboard and protected Admin API.

## Dashboard
- Active trips
- Online / on-trip drivers
- Pending driver and vehicle reviews
- Open support tickets
- Open safety/SOS incidents
- Pending refund/dispute requests
- Upcoming scheduled rides

## Driver & vehicle review
Admin can approve or reject DriverProfile and Vehicle records. Non-approved drivers are forced OFFLINE.

## Operations
The dashboard lists active trips with passenger, driver, vehicle and latest location data.

## Support / Safety / Refunds
Operations can move tickets through the support workflow, acknowledge/resolve safety incidents, and review/approve/reject refund requests.

## Audit
Administrative mutations create `AdminAuditLog` records. The Admin API reads the authenticated ADMIN user ID from the Bearer token rather than trusting a client-provided identity.

## Security
All `/v1/admin/*` endpoints use `AdminGuard`, which validates the HMAC JWT signature, expiration and ADMIN role. This is still Foundation authentication; production should add refresh-token/session hardening, MFA, granular RBAC, revocation and rate limits.

## Admin account provisioning
Public registration intentionally remains limited to Passenger and Driver. ADMIN accounts must be provisioned through a controlled internal/bootstrap process rather than public sign-up.
