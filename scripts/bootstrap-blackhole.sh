#!/usr/bin/env bash
set -Eeuo pipefail

CAPPYS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLACKHOLE_WORKSPACE="$(dirname "$CAPPYS_ROOT")"
PLATFORM_ROOT="$BLACKHOLE_WORKSPACE/cloudflare-platform"
WRANGLER_CONFIG="$CAPPYS_ROOT/worker/wrangler.toml"
ACCOUNT_ID="841893af4dee7e52549a8adbef936100"

cd "$CAPPYS_ROOT"

for command in git node npm curl; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 1; }
done

if [[ ! -d "$PLATFORM_ROOT/.git" ]]; then
  git clone https://github.com/blackholecapital/cloudflare-platform.git "$PLATFORM_ROOT"
elif git -C "$PLATFORM_ROOT" diff --quiet && git -C "$PLATFORM_ROOT" diff --cached --quiet; then
  git -C "$PLATFORM_ROOT" pull --ff-only
else
  echo "Preserving uncommitted cloudflare-platform changes; skipping its pull."
fi

echo "Installing and validating Cappy's..."
npm ci
npm run build
npm test

echo "Checking Cloudflare authentication..."
CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npx wrangler whoami >/dev/null

for service in checkout-worker blackhole-video-worker blackhole-voice-worker; do
  if ! CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npx wrangler deployments list --name "$service" --json --config "$WRANGLER_CONFIG" >/dev/null 2>&1; then
    echo "Required shared Worker is missing or inaccessible: $service" >&2
    exit 1
  fi
done

get_d1_id() {
  CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npx wrangler d1 list --json --config "$WRANGLER_CONFIG" | node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const match = JSON.parse(input).find(item => item.name === "cappys-db");
      if (match) process.stdout.write(match.uuid || match.id || "");
    });
  '
}

DATABASE_ID="$(get_d1_id)"
if [[ -z "$DATABASE_ID" ]]; then
  CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npx wrangler d1 create cappys-db --location enam --config "$WRANGLER_CONFIG"
  DATABASE_ID="$(get_d1_id)"
fi
[[ -n "$DATABASE_ID" ]] || { echo "Could not resolve cappys-db after creation." >&2; exit 1; }

if ! CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npx wrangler r2 bucket info cappys-media --config "$WRANGLER_CONFIG" >/dev/null 2>&1; then
  CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npx wrangler r2 bucket create cappys-media --location enam --config "$WRANGLER_CONFIG"
fi

if ! CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npx wrangler queues list --config "$WRANGLER_CONFIG" | grep -Fq "cappys-jobs"; then
  CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npx wrangler queues create cappys-jobs --config "$WRANGLER_CONFIG"
fi

CONFIG_BACKUP="$(mktemp)"
cp "$WRANGLER_CONFIG" "$CONFIG_BACKUP"
restore_config() {
  cp "$CONFIG_BACKUP" "$WRANGLER_CONFIG"
  rm -f "$CONFIG_BACKUP"
}
trap restore_config EXIT

node scripts/prepare-deploy-config.mjs "$DATABASE_ID" "$WRANGLER_CONFIG"

echo "Applying D1 migrations..."
CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npx wrangler d1 migrations apply cappys-db --remote --config "$WRANGLER_CONFIG"

echo "Deploying dashboard, API, centralized secret bindings, and custom domain..."
CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npm run deploy:api

echo "Waiting for the live health endpoint..."
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors \
  https://cappys.blackholecapital.xyz/api/health
echo
echo "Cappy's is live: https://cappys.blackholecapital.xyz"
