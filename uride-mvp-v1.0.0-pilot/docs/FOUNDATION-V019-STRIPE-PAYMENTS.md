# URide Foundation v0.19.0 — Stripe Payments & Connect

## Passenger payments
Passenger uses Stripe PaymentSheet. The backend creates a PaymentIntent only after a trip is COMPLETED, or when a CANCELLED/NO_SHOW trip has a pending fee.

The server calculates:
- subtotal
- tip
- URide platform fee
- Driver amount
- total

Default Foundation commission is 20% of the trip/cancellation subtotal and is configurable with `URIDE_COMMISSION_RATE`.
Tips are not included in the URide commission calculation.

## Stripe Connect
Driver can create a Stripe connected account, open the Stripe-hosted onboarding link and refresh account status.
When the connected account has payouts enabled, URide creates a destination charge with:
- `application_fee_amount` = URide commission
- `transfer_data[destination]` = Driver connected account

Set `STRIPE_REQUIRE_CONNECT=true` before production if a trip must never be charged until the Driver payout account is ready.

## Idempotency
URide keeps its own unique payment idempotency key and forwards the same idempotency key to Stripe when creating the PaymentIntent.

## Webhooks
`POST /v1/payments/stripe/webhook`
uses the raw request body and `Stripe-Signature` HMAC verification.
Webhook event IDs are stored in `StripeWebhookEvent` to prevent duplicate processing.
If processing fails, the event marker is removed so Stripe can retry safely.

Handled PaymentIntent state changes update the URide Payment record, create the receipt after success and update cancellation-fee status.

## Refunds
Admin refund requests marked PROCESSED call Stripe's Refund API.
For Connect destination charges, refunds request both transfer reversal and application-fee refund.
Partial refunds are supported.

## Required environment
- STRIPE_SECRET_KEY
- STRIPE_PUBLISHABLE_KEY
- STRIPE_WEBHOOK_SECRET
- URIDE_COMMISSION_RATE
- STRIPE_REQUIRE_CONNECT
- STRIPE_CONNECT_REFRESH_URL
- STRIPE_CONNECT_RETURN_URL

## Mobile
Passenger uses `@stripe/stripe-react-native` PaymentSheet.
Expo SDK 57 documentation recommends version 0.64.0.

## Before pilot
Use Stripe test mode first. Configure the Stripe webhook endpoint, real HTTPS callback URLs, platform Connect settings, EAS/native builds, authentication/authorization on payment endpoints, and production keys/secrets outside source control.
