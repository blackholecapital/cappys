# Cappy's Electrical deployment

Run from the Black Hole server where Wrangler is already authenticated and the cappys and cloudflare-platform repositories exist beside each other.

## Validation

1. npm install
2. npm run check
3. npm test
4. npm run build

## One-time Cloudflare resources

1. npx wrangler d1 create cappys-db
2. npx wrangler r2 bucket create cappys-media
3. npx wrangler queues create cappys-jobs
4. npx wrangler pages project create cappys-electrical

Copy only the returned D1 database ID into worker/wrangler.toml, replacing the zero UUID. Do not add secret values.

Apply the database with npm run db:migrate:remote.

Deploy the API through the centralized Secrets Store helper with npm run deploy:api.

Build and deploy the dashboard with npm run build:web and npm run deploy:web.

Then route cappys.blackholecapital.xyz/api/* and cappys.blackholecapital.xyz/twilio/* to cappys-api, and the remaining hostname to the cappys-electrical Pages project.

## External setup still intentionally required

- Connect Cappy's own Stripe account from the Billing screen.
- Attach the purchased Twilio number to /twilio/voice.
- Set EILA_RUNTIME_URL to the Runtime-C/Overwatch OpenAI-compatible endpoint.
- Confirm the existing service names checkout-worker, blackhole-video-worker, and blackhole-voice-worker in the target Cloudflare account before the first production deploy.
