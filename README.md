# Cappy's Electrical

Simple operations dashboard for customers, voice-created estimates, recurring billing, PayMe/Stripe checkout, an AI receptionist, and the Cappy's Overwatch assistant.

## Product principles

- Four large primary controls: Home, Customers, Billing, Assistant
- Estimates are dictated, reviewed, then explicitly approved before email
- Recurring customers arrive through validated CSV import
- Stripe is the only business-specific payment credential
- Shared voice/video/email credentials are consumed from Cloudflare Secrets Store \`default_secrets_store\`; secret values are never committed
- Call-center and assistant capabilities connect through service bindings/adapters

## Current milestone

The first private dashboard checkpoint is deployed. The UI and interaction contracts are complete; production persistence and service bindings are the next wiring pass.
