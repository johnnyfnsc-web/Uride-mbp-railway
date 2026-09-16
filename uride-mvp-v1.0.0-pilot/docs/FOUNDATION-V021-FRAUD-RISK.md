# URide Foundation v0.21.0 — Fraud & Risk

## Risk engine
URide now stores risk signals and calculates a rolling 90-day account risk score.

Default configurable thresholds:
- LOW: 0–24
- MEDIUM: 25–54
- HIGH: 55–79
- CRITICAL: 80–100

Configure with:
- RISK_MEDIUM_THRESHOLD
- RISK_HIGH_THRESHOLD
- RISK_CRITICAL_THRESHOLD

Signal weights are Foundation defaults and should later be tuned using real pilot data.

## Signals currently connected
- payment failure;
- repeated payment failures;
- excessive Passenger cancellations;
- repeated device/app identity across accounts;
- rapid account creation associated with the same device signal;
- excessive refund requests;
- Stripe chargeback/dispute events.

The data model is also ready for:
- suspicious location;
- promotion abuse;
- manual risk signals;
- other future fraud-provider signals.

## Device privacy
The API never stores the raw device identifier supplied to Risk. It stores a SHA-256 hash.
The Foundation mobile apps use the registered Expo push token as an app/device signal when available.
A production anti-fraud implementation should use a dedicated privacy-reviewed device/risk provider rather than treating this heuristic as definitive identity.

## Cases
A HIGH or CRITICAL score opens a RiskCase and alerts ADMIN users through URide Push.
Automatic scoring does NOT permanently suspend an account.

Operations can manually:
- CLEAR the case;
- WATCH the account;
- RESTRICT trip requests and/or payments for a temporary period;
- SUSPEND the account after manual review.

Restrictions are enforced server-side before Passenger trip creation and before payment creation.
Driver suspension also forces the Driver OFFLINE.

## Payment risk
Payment failures are deduplicated by URide payment ID before adding a risk signal.
Three payment failures within 24 hours can add a repeated-failure signal.
Stripe `charge.dispute.created` can add a CHARGEBACK signal and records a TripEvent.

## Cancellation risk
Foundation detects a Passenger with at least 5 trips in seven days when at least 4 were Passenger cancellations and cancellation rate is at least 60%.
This opens a signal, not an automatic ban.

## Refund risk
Four or more refund requests within 30 days can create a REFUND_ABUSE signal, deduplicated for seven days.

## Admin Operations
The new RISK tab shows:
- current risk cases;
- account score/level;
- recent risk signals;
- device count;
- temporary restrictions;
- manual review controls.

## Before pilot
Before using risk decisions commercially:
- validate thresholds and false-positive rates;
- document review/appeal procedures;
- add stronger authentication/authorization to all user-facing APIs;
- review privacy/retention rules for device and location signals;
- integrate Stripe Radar or another specialized fraud provider where appropriate;
- avoid using protected-class characteristics or opaque proxies as risk inputs.
