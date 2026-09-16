# URide Foundation v0.17.0 — Driver Onboarding & Compliance

## Required compliance
A Driver cannot go ONLINE unless:
- Driver status is APPROVED.
- An approved, unexpired DRIVER_LICENSE exists.
- At least one Vehicle is APPROVED.
- That vehicle has an approved, unexpired VEHICLE_REGISTRATION.
- That vehicle has an approved, unexpired VEHICLE_INSURANCE.

## Document workflow
Driver submits document metadata and a private storage reference. New submissions enter PENDING_REVIEW.
Admin can approve or reject each document. Rejected documents store a correction reason.

Document types:
- DRIVER_LICENSE
- VEHICLE_REGISTRATION
- VEHICLE_INSURANCE
- VEHICLE_INSPECTION
- OTHER

## Expiration
The compliance endpoint marks expired documents EXPIRED and forces the Driver OFFLINE when expired documents make the account non-compliant.
Admin dashboard counts approved documents expiring within 30 days.

## Approval rule
Admin cannot approve the Driver profile until a valid approved license and at least one fully compliant approved vehicle exist.

## Storage note
This Foundation milestone stores `storageKey` references only. Actual photo/PDF upload, private object storage, signed URLs, malware scanning and OCR/document verification are production integrations to add later.
