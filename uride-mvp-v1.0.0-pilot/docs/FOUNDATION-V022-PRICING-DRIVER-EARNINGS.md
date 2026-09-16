# URide Foundation v0.22.0 — Pricing & Driver Earnings

## Pricing rules
Each active PricingRule now includes `platformCommissionRate`.
The active service rule controls:
- base fare;
- per-mile price;
- per-minute price;
- booking fee;
- minimum fare;
- URide platform commission.

The quote endpoint also calculates an estimated platform fee and estimated Driver earnings before tip.

When Stripe creates the final PaymentIntent, the API looks up the active PricingRule for the trip service type. If no rule exists, `URIDE_COMMISSION_RATE` remains the fallback.

## Driver earnings ledger
Successful Stripe payments create idempotent Driver ledger entries:
- TRIP_EARNING: fare subtotal minus URide platform fee;
- TIP: Passenger tip, kept separate from the platform commission;
- BONUS: earned Driver incentive;
- REFUND_REVERSAL: negative adjustment after a Stripe refund;
- ADJUSTMENT: reserved for audited manual financial adjustments.

Ledger entries use a unique `externalKey` to prevent duplicate accounting when Stripe webhooks and payment synchronization both process the same payment.

`AVAILABLE` in this Foundation means earnings recognized by URide. It does not mean the money has already reached the Driver's bank account. Stripe payout reconciliation is a later production step.

## Driver dashboard
Driver can view:
- DAY, WEEK or MONTH earnings;
- number of paid trips;
- net trip earnings;
- tips;
- bonuses;
- refund/other adjustments;
- total recognized earnings;
- recorded in-trip hours and earnings divided by recorded trip time;
- recent financial ledger entries.

The time metric is based only on recorded completed-trip duration. It is not the Driver's total online/work time.

## Driver offers
Trip offers now show:
- estimated Passenger fare;
- estimated URide commission;
- estimated Driver earnings before tip.

The estimate is recalculated from the active PricingRule.

## Bonuses
Operations can configure bonus campaigns with:
- campaign name;
- optional service type;
- target number of trips;
- reward amount;
- start/end dates;
- active/inactive state.

Only COMPLETED trips with a SUCCEEDED payment count toward a bonus.
When the target is reached, URide creates one DriverBonusAward and one idempotent BONUS ledger entry.

## Refunds
Stripe full or partial refunds create proportional negative Driver ledger adjustments using the refund ID as the idempotency key.

## Admin Finance
The Operations FINANCE tab shows active/inactive pricing rules and bonus campaigns.
The main dashboard includes total currently AVAILABLE Driver ledger value.

## Before pilot
Before commercial use:
- define pricing by market/jurisdiction and vehicle/service category;
- validate commissions and Driver earnings disclosures;
- add taxes, tolls, airport/venue fees and market-specific surcharges;
- add true online-time accounting if used for earnings metrics;
- reconcile Stripe transfers/payouts and payout failures;
- add audited manual adjustment workflows;
- add downloadable Driver statements and tax/reporting workflows where legally required.
