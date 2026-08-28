# Cappy's Electrical — service architecture

## User-facing surface

Four sections only: Home, Customers, Billing, Assistant. The create-estimate voice action is also available from Home.

## Production services

- **cappys-api** — customer, estimate, recurring-billing and activity API backed by D1.
- **cappys-jobs** — queue consumer for approved-estimate email delivery; additional background jobs can use the same bounded contract.
- **PayMe service binding** — Stripe onboarding, checkout, invoices, subscriptions and webhooks.
- **Voice/call-center service bindings** — inbound receptionist, bill lookup, call capture and human escalation.
- **Overwatch runtime adapter** — text/voice assistant with tools scoped to Cappy's tenant. Overwatch reads operational context but D1 remains authoritative.
- **Video service binding** — Buddy-style LiveKit/avatar session creation; avatar image and personality are tenant settings.

## Shared secret bindings

Consume through Cloudflare Secrets Store `default_secrets_store` and the `blackholecapital/cloudflare-platform` deployment tooling:

- `XYZ_DEMO_LIVEKIT_API_KEY`
- `XYZ_DEMO_LIVEKIT_API_SECRET`
- `XYZ_DEMO_DEEPGRAM_API_KEY`
- `XYZ_DEMO_RESEND_API_KEY`
- `XYZ_DEMO_TWILIO_ACCOUNT_SID`
- `XYZ_DEMO_TWILIO_AUTH_TOKEN`
- `XYZ_DEMO_EILA_RUNTIME_TOKEN`

Never commit or copy secret values. Stripe credentials are Cappy's business-specific setup and are stored only after account onboarding.

## Estimate approval invariant

Voice transcript → structured draft → visible editable estimate → explicit approval → queued email. The assistant and receptionist cannot send an estimate without the approval record.

Draft estimates are listed on Home under Needs Your Attention. Approval checks for a real customer email before queueing delivery; Cappy can still approve a record without sending it.

## Recurring billing invariant

CSV import or manual entry → pending local schedule → explicit Start Autopay action → PayMe-hosted customer authorization → active subscription. Saving or importing a schedule never charges a card.

`cappys-api` talks only to the `checkout-worker` service binding. The adapter contract is:

- `POST /api/stripe/connect` — begin Cappy's Stripe onboarding.
- `POST /api/recurring/setup` — create a customer authorization session from a tenant-scoped external ID, amount, currency and interval.
- `PATCH /api/recurring/:providerSubscriptionId` — change amount, cadence or active/paused state.

This boundary keeps Cappy's dashboard independent from a particular PayMe frontend or database version.

## CSV import

Upload → bounded parse/normalize → validation counts → batched customer insert. Invalid rows are counted and nothing is silently discarded. A confirmation screen and downloadable rejection report can be layered on without changing the import contract.

## Runtime boundary

Cloudflare owns customer, estimate, billing, call and audit state. Runtime-C/Tracer can resolve policy and lease voice/video execution, but neither becomes the system of record. Transport workers attach after caller, tenant, purpose and state have been resolved.
