# Cappy's Electrical deployment

Cappy's is one full-stack Cloudflare Worker. The Worker serves the React dashboard, `/api/*`, and `/twilio/*` at `cappys.blackholecapital.xyz`; there is no separate Pages project.

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

1. Keeps `cappys` and `cloudflare-platform` beside each other.
2. Installs, type-checks, tests, and builds the dashboard.
3. Verifies the authenticated Cloudflare account and required shared Workers.
4. Creates or reuses `cappys-db`, `cappys-media`, and `cappys-jobs`.
5. Injects the D1 ID only into a temporary deployment config and restores the committed zero UUID afterward.
6. Applies D1 migrations.
7. Binds `default_secrets_store` through the platform deployment helper without reading or copying secret values.
8. Deploys the Worker, static dashboard, and custom domain.
9. Verifies `https://cappys.blackholecapital.xyz/api/health`.

To connect a reachable Overwatch endpoint during deployment, set `CAPPYS_EILA_RUNTIME_URL` before running the bootstrap. If omitted, the operational dashboard deploys and the assistant returns its safe not-configured response.

## After first deployment

- Connect Cappy's Stripe account from Billing.
- Point the purchased Twilio number at `https://cappys.blackholecapital.xyz/twilio/voice`.
- Upload the assistant avatar from Assistant → Personality & avatar; it is stored in `cappys-media` R2.
