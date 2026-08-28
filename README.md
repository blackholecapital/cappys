# Cappy's Electrical

Simple operations dashboard for customers, voice-created estimates, recurring billing, PayMe/Stripe checkout, an AI receptionist, and the Cappy's Overwatch assistant.

## Product principles

- Four large primary controls: Home, Customers, Billing, Assistant
- Estimates are dictated, reviewed, then explicitly approved before email
- Recurring customers arrive through validated CSV import
- Imported and manual bills remain pending until Cappy explicitly starts autopay
- Stripe is the only business-specific payment credential
- Shared voice/video/email credentials are consumed from Cloudflare Secrets Store \`default_secrets_store\`; secret values are never committed
- Call-center and assistant capabilities connect through service bindings/adapters

## Repository layout

- web/ — deliberately simple React/Vite dashboard for Cappy.
- worker/ — full-stack Cloudflare Worker, static dashboard binding, D1 migrations, queue consumer and EVC adapters.
- scripts/bootstrap-blackhole.sh — idempotent Black Hole workspace provisioning and deployment.
- customer-manifests/cappys.yaml — bootstrap declaration for the Cloudflare platform.
- docs/ — architecture and deployment handoff.

## Local verification

Run npm install, npm run check, npm test, and npm run build.

## Deployment

The source of truth is this repository. Use docs/DEPLOY.md for the one-command Black Hole deployment. The full-stack Worker deployment goes through blackholecapital/cloudflare-platform/scripts/deploy-with-secrets-store.mjs, which resolves default_secrets_store without committing a store ID or reading any secret value.
