# Cappy's Electrical

Simple operations dashboard for customers, voice-created estimates, recurring billing, PayMe/Stripe checkout, an AI receptionist, and the Cappy's Overwatch assistant.

## Product principles

- Four large primary controls: Home, Customers, Billing, Assistant
- Estimates are dictated, reviewed, then explicitly approved before email
- Recurring customers arrive through validated CSV import
- Stripe is the only business-specific payment credential
- Shared voice/video/email credentials are consumed from Cloudflare Secrets Store \`default_secrets_store\`; secret values are never committed
- Call-center and assistant capabilities connect through service bindings/adapters

## Repository layout

- web/ — deliberately simple React/Vite dashboard for Cappy.
- worker/ — dedicated Cloudflare API Worker, D1 migrations, queue consumer and EVC adapters.
- customer-manifests/cappys.yaml — bootstrap declaration for the Cloudflare platform.
- docs/ — architecture and deployment handoff.

## Local verification

Run npm install, npm run check, npm test, and npm run build.

## Deployment

The source of truth is this repository. Use docs/DEPLOY.md for the exact Cloudflare resource and deployment order. API deployment goes through blackholecapital/cloudflare-platform/scripts/deploy-with-secrets-store.mjs, which resolves default_secrets_store without committing a store ID or reading any secret value.
