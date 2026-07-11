# Run locally with ngrok and Hamsa

Use this runbook to bring up the POC, expose it publicly, connect Hamsa, and
watch a real call appear in the live demo. It assumes a macOS/Linux shell, Node
20+, npm, an ngrok account/CLI, and access to the Hamsa agent configuration.

## What you will have at the end

- A Next.js server running locally.
- An HTTPS ngrok address Hamsa can call.
- A Hamsa `call.ended` webhook that mints Party A and Party B report links.
- A live view at `/phone` that shows the webhook activity and SMS results.

## 1. Install once

```bash
npm install
ngrok config add-authtoken <your-ngrok-authtoken>
```

Copy the provided environment template, then set a secret you control:

```bash
cp .env.example .env.local
```

Edit `.env.local` and set at least:

```dotenv
HAMSA_WEBHOOK_SECRET=a-long-random-secret
```

Generate a secret if needed:

```bash
openssl rand -hex 32
```

Keep `.env.local` private. Never paste its secret into a demo deck or commit it.

## 2. Start the application

In terminal 1:

```bash
npm run dev
```

Confirm the local demo loads at <http://localhost:3000/phone>. Keep this terminal
running for the rest of the session.

## 3. Create the public tunnel

In terminal 2:

```bash
ngrok http 3000
```

Copy the HTTPS forwarding address, for example:

```text
https://example.ngrok-free.app
```

Open `https://example.ngrok-free.app/phone` in the browser you will use for the
demo. This is the public live view; leave it open before placing a call.

### About `NAJM_BASE_URL`

For a real webhook delivered through ngrok, minted links automatically use the
request's public host, so the app will create `https://example.ngrok-free.app/r/...`
links even when `NAJM_BASE_URL` is unset.

Set `NAJM_BASE_URL=https://example.ngrok-free.app` and restart `npm run dev` when
you want `npm run simulate:call` to target the public tunnel, or when a reliable
fallback URL is useful. It is not a substitute for updating Hamsa's webhook URL.

## 4. Connect Hamsa

In your Hamsa agent's webhook/event settings, create or update the endpoint with:

| Setting | Value |
|---|---|
| URL | `https://example.ngrok-free.app/api/webhook/hamsa` |
| Method | `POST` |
| Content type | `application/json` |
| Authorization | `Bearer a-long-random-secret` |
| Events | At minimum `call.ended`; include lifecycle/transcription events for the full live feed. |

Configure the agent's structured call outcome to emit the fields in
[hamsa.md](hamsa.md#outcomeresult-field-contract-the-synonym-table). The minimum
useful extraction is Party A's name, mobile, plate, declared role, injury answer,
and Party B's mobile. The supplied simulator's payload is a known-good example.

## 5. Prove the connection before a real call

In terminal 3, send a harmless lifecycle event through the public URL:

```bash
curl -X POST https://example.ngrok-free.app/api/webhook/hamsa \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer a-long-random-secret' \
  -d '{"eventType":"call.started","callId":"ngrok-smoke-test"}'
```

Expected response:

```json
{"ok":true,"recorded":"call.started"}
```

You should immediately see a new feed event on `/phone`. If not, inspect the
ngrok request inspector at <http://localhost:4040> before attempting a real call.

## 6. Run the demo

1. Keep the public `/phone` screen visible.
2. Call the Hamsa agent and provide the outcome fields it is configured to extract.
3. End the call. Hamsa sends `call.ended` and Najm creates the report and links.
4. Watch the feed: `link_minted`, then `sms_partyA` and (when captured) `sms_partyB`.
5. Open the Party A link, complete the shared accident details, consent, and submit.
6. Open the Party B link, complete its own details, consent, and submit.
7. Open `/dashboard/<reportId>` from the feed to show the combined status and audit.

Without Twilio credentials, SMS is intentionally simulated in the `/phone` view;
the generated links still work. With all three `TWILIO_*` variables configured,
the adapter attempts live delivery. See [Twilio notes](twilio.md).

## Quick local-only rehearsal

No ngrok, Hamsa, or SMS provider is required for a rehearsal:

```bash
# terminal 1
npm run dev

# terminal 2
npm run simulate:call
```

Open <http://localhost:3000/phone> before running the simulator. It sends the
same lifecycle sequence and a representative `call.ended` payload to localhost.

## Troubleshooting and reset

| Symptom | Check |
|---|---|
| `401 unauthorized` | The exact same `HAMSA_WEBHOOK_SECRET` must be in `.env.local` and Hamsa's `Authorization: Bearer ...` value; restart Next after editing the env file. |
| Hamsa cannot reach the app | Confirm ngrok is still running, use its current HTTPS URL, and check the request inspector. |
| SMS link says `localhost` | Ensure Hamsa is posting to the ngrok URL; for simulation, set `NAJM_BASE_URL` to that URL and restart Next. |
| No Party B SMS | Party B needs a captured mobile number. Otherwise its link is sent after Party A submits if Party A provides B's number. |
| Unexpected blank fields | Compare Hamsa outcome keys with the synonym table; unknown keys are listed as `ignoredKeys` in the webhook response. |
| Need a clean demo | Stop Next, run `rm -f data/najm.db data/najm.db-shm data/najm.db-wal`, then start Next again. |

ngrok's free URL usually changes when the tunnel restarts. Update the Hamsa endpoint
each time, or use a reserved ngrok domain. Some free ngrok browser visits display an
interstitial; webhook POSTs are not affected.
