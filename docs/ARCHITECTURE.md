# Cappy's Electrical — service architecture

## User-facing surface

Four sections only: Home, Customers, Billing, Assistant. The create-estimate voice action is also available from Home.

## Production services

- **cappys-api** — customer, estimate, recurring-billing and activity API backed by D1.
- **cappys-jobs** — queue consumer for email delivery, CSV import, payment reconciliation and call summaries.
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

## CSV import

Upload → bounded parse/normalize → validation counts → batched customer insert. Invalid rows are counted and nothing is silently discarded. A confirmation screen and downloadable rejection report can be layered on without changing the import contract.

## Runtime boundary

Cloudflare owns customer, estimate, billing, call and audit state. Runtime-C/Tracer can resolve policy and lease voice/video execution, but neither becomes the system of record. Transport workers attach after caller, tenant, purpose and state have been resolved.
