# URide Foundation v0.20.0 — Advanced Safety & Operations

## Incident priority
Safety incidents now carry operational priority:
- CRITICAL: SOS, medical emergency, accident
- HIGH: harassment, route deviation
- MEDIUM: unusual stop, vehicle issue
- LOW: other reports

## Operations response
Admin/Operations can:
- acknowledge an incident;
- assign the responding admin automatically through the authenticated admin identity;
- add escalation events and increase incident priority;
- record that a trusted contact was informed;
- record that emergency services were contacted manually;
- resolve or reopen an incident;
- retain an immutable SafetyAction history and AdminAuditLog entry.

Important: marking “emergency services contacted” records an action already performed by an operator. URide Foundation does not automatically call 911 or other emergency services.

## Live trip monitor
Operations can open a safety monitor with:
- Passenger and Driver account/contact information;
- vehicle details;
- pickup and destination;
- latest 30 GPS samples;
- active/historical safety incidents;
- recent safety-related TripEvents;
- trusted contacts available to the authenticated operations team.

## Operations metrics
Dashboard adds critical incidents, unacknowledged incidents, and age in minutes of the oldest open incident.

## Secure trip sharing
Passenger and Driver can generate a random, time-limited trip-share token.
Only a SHA-256 hash is stored in the database. The raw token is returned once to the app.
The public share snapshot intentionally exposes a reduced data set and no passenger email/phone.

Share links default to four hours, can be configured from 15 minutes up to 24 hours, and can be revoked by the owner.

## Notifications
High/critical safety reports create Operations push alerts for active ADMIN users with registered push tokens.
The counterpart in the trip also receives a safety-state notification.
When Operations acknowledges, escalates, or resolves a case, Passenger/Driver can receive status notifications.

## Automatic detections
Existing route-deviation and unusual-stop detectors remain Foundation heuristics:
- route deviation gets HIGH priority;
- unusual stop gets MEDIUM priority.
They do not cancel trips, suspend accounts, or contact emergency services automatically.

## Before pilot
Production work still includes local emergency protocols, legal/privacy review, dedicated safety staffing, external SMS/voice provider integration, stronger operator RBAC/MFA, map-matched anomaly detection, data-retention rules, and incident-response drills.
