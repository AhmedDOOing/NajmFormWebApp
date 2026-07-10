# Exposing the webhook with ngrok

Hamsa needs a **public HTTPS** URL to deliver webhooks. For local testing, tunnel the
dev server with ngrok.

## Steps

```bash
# terminal 1 — start the tunnel
ngrok http 3000
# → Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000

# terminal 2 — start the app WITH the tunnel URL as its base
NAJM_BASE_URL=https://abc123.ngrok-free.app npm run dev
```

**`NAJM_BASE_URL` matters:** it's baked into every minted link and SMS body. Without
it, the causer would receive `http://localhost:3000/r/…` — useless on a real phone.

Then configure the Hamsa agent (see [hamsa.md](hamsa.md)):

```
webhookUrl: https://abc123.ngrok-free.app/api/webhook/hamsa
authSecret: Bearer <your HAMSA_WEBHOOK_SECRET>
```

## Smoke test

```bash
curl -X POST https://abc123.ngrok-free.app/api/webhook/hamsa \
  -H "content-type: application/json" \
  -H "authorization: Bearer $HAMSA_WEBHOOK_SECRET" \
  -d '{"eventType":"call.started","callId":"call_ngrok_test"}'
# → {"ok":true,"recorded":"call.started"}   … and a row appears on /phone
```

## Gotchas

- **The URL changes on every ngrok restart** (free tier). Re-set `NAJM_BASE_URL`,
  restart the dev server, and update the Hamsa agent's webhookUrl each time. A paid
  ngrok domain (`--domain=najm-poc.ngrok.app`) avoids this.
- **Free-tier browser interstitial**: ngrok shows a warning page on first browser
  visit. API POSTs (Hamsa) are unaffected; a driver tapping the SMS link sees it
  once — click through, or add the `ngrok-skip-browser-warning` header via a paid
  plan / use a reserved domain.
- **Set `HAMSA_WEBHOOK_SECRET`** before exposing the endpoint publicly — unset means
  the webhook accepts unauthenticated posts.
- ngrok's request inspector (`http://localhost:4040`) is handy for replaying Hamsa's
  actual payloads while tuning the synonym table.
