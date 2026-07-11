# Delivery task list: POC to supported service

This separates what works for a demonstration from what is required before real
accident reports can be safely handled. Priorities are ordered by risk.

## Working-demo checklist

Use this checklist to make the existing POC work end to end with Hamsa. It is
the immediate task list; the P0/P1/P2 sections below are for a later production
release.

| # | Task | Done when |
|---|---|---|
| D1 | Install local prerequisites | Node 20+, npm, and the ngrok CLI are installed; `npm install` completes. |
| D2 | Configure local secret | `.env.local` exists with a strong `HAMSA_WEBHOOK_SECRET`; it is not committed to Git. |
| D3 | Prove the local demo | `npm run dev` starts successfully and `http://localhost:3000/phone` loads. |
| D4 | Prove the local webhook | With the app running, `npm run simulate:call` succeeds; `/phone` shows the call, minted links, and simulated SMS. |
| D5 | Start ngrok | `ngrok http 3000` shows an HTTPS forwarding URL; `https://<tunnel>/phone` loads. |
| D6 | Configure Hamsa webhook | Hamsa sends `POST` requests to `https://<tunnel>/api/webhook/hamsa` with `Authorization: Bearer <HAMSA_WEBHOOK_SECRET>`. |
| D7 | Subscribe Hamsa events | `call.ended` is enabled at minimum. Enable `call.started`, `call.answered`, and `transcription.update` as well for the live `/phone` story. |
| D8 | Configure Hamsa payload | On `call.ended`, Hamsa provides `outcomeResult` with `full_name`, `mobile`, `plate_number`, `declared_role`, `injuries`, and `other_party_mobile` at minimum. |
| D9 | Run public smoke test | A curl `call.started` request to the ngrok URL returns 200 and appears in the public `/phone` feed. |
| D10 | Validate a real Hamsa call | Make a call, end it, and verify `link_minted`, Party A SMS, and Party B SMS appear in `/phone`. |
| D11 | Complete both links | Open each generated link and submit Party A then Party B; `/dashboard/<reportId>` reaches `complete` (or the expected escalated result). |
| D12 | Decide SMS mode | For screen-only demos, simulated SMS is accepted. For real phone delivery, configure and test all three `TWILIO_*` variables. |
| D13 | Rehearse/reset | Complete one full rehearsal, document any missing Hamsa keys, then stop Next and clear local SQLite data before the external demo. |

### Hamsa payload acceptance example

This is enough to make the demo show both party links:

```json
{
  "eventType": "call.ended",
  "callId": "demo-call-001",
  "data": {
    "data": {
      "outcomeResult": {
        "full_name": "Demo Driver",
        "mobile": "+966551234567",
        "plate_number": "1234",
        "declared_role": "causer",
        "injuries": "no",
        "other_party_mobile": "+966509876543"
      }
    }
  }
}
```

If D8 or D10 fails, inspect `ignoredKeys` in the webhook response or `/phone` and
compare Hamsa's actual keys with [hamsa.md](hamsa.md). The full click-by-click
commands are in [run-local-hamsa.md](run-local-hamsa.md).

