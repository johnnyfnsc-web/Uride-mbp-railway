# URide Foundation v0.23.0 — URide AI + Operations Intelligence

## Purpose
URide AI is an assistance layer for Passenger, Driver, Support and Operations.
In this Foundation milestone it uses a deterministic, context-aware rules engine (`FOUNDATION_RULES`) rather than an external generative-AI provider.

This is intentional: the product contracts, permissions, audit trail and safety boundaries are established before connecting an external model.

## Passenger assistant
Passenger can ask about:
- current trip status;
- Driver/location availability;
- estimated/final fare;
- payment/receipt state;
- safety and SOS guidance;
- general next steps.

The assistant verifies that a supplied trip belongs to the Passenger before reading trip context.

## Driver assistant
Driver can ask about:
- current trip status;
- recent earnings;
- bonuses;
- document/compliance status;
- general operational next steps.

The assistant verifies that a supplied trip is assigned to that Driver.

## Support Copilot
ADMIN-authenticated Support can ask URide AI to summarize a ticket.
The assistant can inspect:
- ticket category/status/messages;
- linked trip state;
- payment state;
- active safety incidents;
- requester risk level.

It recommends next steps but does not perform the action.

## Operations Intelligence
ADMIN-authenticated Operations can generate a brief containing:
- active trips;
- connected Drivers;
- open tickets;
- CRITICAL safety incidents;
- HIGH/CRITICAL Risk cases;
- pending refunds.

The response prioritizes operational attention without taking action.

## Prohibited autonomous actions
URide AI does not have authority to:
- charge a payment method;
- issue a refund;
- suspend/ban an account;
- approve Driver documents;
- change Pricing;
- contact emergency services;
- make final Risk or Safety decisions.

Requests matching these actions are logged as `BLOCKED` and return a human-action requirement.

## Audit trail
Each assistant run stores:
- audience;
- requesting user/admin ID when available;
- trip/ticket identifiers;
- input;
- response;
- run status;
- blocked action when applicable;
- minimal context snapshot;
- provider/model label.

Avoid putting secrets, full payment credentials, document images or unnecessary precise-location history into AI context.

## External model integration
`AI_PROVIDER_MODE=FOUNDATION_RULES` is the default.
`AI_ALLOW_EXTERNAL_PROVIDER=false` remains disabled in this milestone.
A future production integration can connect a vetted model provider behind the same service boundary, with redaction, authentication, authorization, retention and observability controls.

## Before pilot
- protect Passenger/Driver AI endpoints with authenticated identity rather than trusting body user IDs;
- add per-role data-access policies;
- add localization templates;
- add prompt-injection/data-exfiltration tests before external LLM use;
- add PII redaction/minimization;
- add model/version rollout controls and quality evaluation;
- keep all critical actions outside autonomous AI authority.
