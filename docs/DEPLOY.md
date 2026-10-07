# Cappy's Electrical deployment

Cappy's is one full-stack Cloudflare Worker. The Worker serves the React dashboard, `/api/*`, and `/twilio/*` at `cappys.blackholecapital.xyz`; there is no separate Pages project.

## Deployment verified October 7, 2026

- Live dashboard: https://cappys.blackholecapital.xyz/
- Worker: `cappys-api`; deployment `94335c1b18244757bc8210968be0d923`.
- D1: `cappys-db`, with both migrations applied.
- R2: `cappys-media`; avatar objects are created when an image is uploaded from Assistant settings.
- Queue: `cappys-jobs`, with `cappys-api` attached as its consumer.
- Seven Secrets Store bindings reference the existing shared bundle; values were not read or copied.
- Shared service bindings reference `checkout-worker`, `blackhole-video-worker`, and `blackhole-voice-worker`. Their application contracts still require end-to-end verification; binding a service does not prove the billing, phone, or video flow works.
- The assistant runtime URL is not configured. Stripe account connection and Twilio number routing still require setup.

The previous bootstrap stopped after provisioning because the platform repository removed its deployment helper. Cappy's now includes its own helper and uses its installed, pinned Wrangler version.

## Black Hole workspace

Run this on the authenticated Black Hole/EILA sidecar:

```bash
export BLACKHOLE_WORKSPACE=/mnt/eila-hot-sidecar/workspace
mkdir -p "$BLACKHOLE_WORKSPACE"
if [ -d "$BLACKHOLE_WORKSPACE/cappys/.git" ]; then
  git -C "$BLACKHOLE_WORKSPACE/cappys" pull --ff-only origin main
else
  git clone https://github.com/blackholecapital/cappys.git "$BLACKHOLE_WORKSPACE/cappys"
fi
cd "$BLACKHOLE_WORKSPACE/cappys"
bash scripts/bootstrap-blackhole.sh
```

The bootstrap is idempotent. It:

1. Uses the deployment helper included in `cappys`; no sibling repository is required.
2. Installs, type-checks, tests, and builds the dashboard.
3. Verifies the authenticated Cloudflare account and required shared Workers.
4. Creates or reuses `cappys-db`, `cappys-media`, and `cappys-jobs`.
5. Injects the D1 ID only into a temporary deployment config and restores the committed zero UUID afterward.
6. Applies D1 migrations.
7. Resolves `default_secrets_store` and binds secret names through the repository's deployment helper without reading or copying secret values. The helper uses the Wrangler version pinned in `package-lock.json`.
8. Deploys the Worker, static dashboard, and custom domain.
9. Verifies `https://cappys.blackholecapital.xyz/api/health`.

To connect a reachable Overwatch endpoint during deployment, set `CAPPYS_EILA_RUNTIME_URL` before running the bootstrap. If omitted, the operational dashboard deploys and the assistant returns its safe not-configured response.

## After first deployment

- Connect Cappy's Stripe account from Billing.
- Point the purchased Twilio number at `https://cappys.blackholecapital.xyz/twilio/voice`.
- Upload the assistant avatar from Assistant → Personality & avatar; it is stored in `cappys-media` R2.
