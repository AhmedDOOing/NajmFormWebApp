# Hamsa webhook integration

Hamsa (docs.tryhamsa.com) POSTs call-lifecycle events to a webhook URL configured on
the agent. This app receives them at:

```
POST /api/webhook/hamsa
Authorization: Bearer <HAMSA_WEBHOOK_SECRET>
Content-Type: application/json
```

## Configuring the Hamsa agent

In the Hamsa dashboard (or via their API), set on your voice agent:

```json
{
  "webhookUrl": "https://<your-ngrok-or-prod-host>/api/webhook/hamsa",
  "webhookAuth": { "authKey": "bearer", "authSecret": "Bearer <HAMSA_WEBHOOK_SECRET>" }
}
```

Set the same secret in this app's env (`HAMSA_WEBHOOK_SECRET`). If the env var is
unset the endpoint accepts unauthenticated posts — **local dev only**.

## Event envelope

```json
{
  "eventType": "call.started | call.answered | transcription.update | tool.executed | call.ended",
  "callId": "call_uuid_12345",
  "timestamp": "2026-01-15T14:35:00.000Z",
  "agentId": "…", "agentName": "…",
  "data": {
    "data": {
      "conversationId": "conv-…",
      "conversationRecording": "https://…mp3",
      "transcription": [ { "Agent": "…" }, { "User": "…" } ],
      "outcomeResult": { "…agent-extracted fields…" : "…" }
    }
  }
}
```

Behavior:

- **Every** event is recorded to the live feed (visible on `/phone`), including
  unrecognized ones — the endpoint never rejects on shape drift.
- Only **`call.ended`** mints a report: `outcomeResult` → Party A prefill (+ Party B
  if captured) + intake → `createSession` → two party links → SMS to each captured
  mobile.
- **Idempotent per `callId`** — Hamsa's retry behavior is undocumented, so a replayed
  `call.ended` returns the originally minted links instead of minting twice.
- Response (`call.ended`): `201 { ok, reportId, partyA: {url}, partyB: {url}, expiresAt, sms, ignoredKeys }`.

## outcomeResult field contract (the synonym table)

Configure the Hamsa agent to extract these outcomes. Key matching is tolerant —
case-insensitive, `_`/`-`/spaces ignored — and each field accepts any synonym below
(source of truth: `OUTCOME_SYNONYMS` in `src/lib/hamsa.ts`).

| Maps to | Accepted key names |
|---|---|
| Party A full name | `full_name`, `driver_name`, `name`, `caller_name`, `causer_name` |
| Party A identity number | `identity_number`, `national_id`, `id_number`, `iqama`, `personal_number` |
| Party A identity type | `identity_type`, `id_type` |
| Party A mobile | `mobile`, `driver_mobile`, `phone`, `phone_number`, `caller_phone`, `causer_mobile` |
| Party A email | `email`, `driver_email`, `causer_email` |
| Party A plate | `vehicle_number`, `plate`, `plate_number`, `vehicle_plate`, `car_plate` |
| Party A registration type | `registration_type`, `vehicle_registration_type`, `vehicle_type` |
| Party A vehicle nationality | `vehicle_nationality`, `car_nationality`, `vehicle_country` |
| Party A declared role | `declared_role`, `role`, `at_fault` — "causer"/"affected" (or متسبب/متضرر); skips the triage chooser |
| Party B mobile | `other_party_mobile`, `affected_mobile`, `other_phone`, `other_driver_mobile`, `party_b_mobile` |
| Party B name | `other_party_name`, `other_driver_name`, `party_b_name` |
| Party B identity number | `other_party_id`, `other_driver_id`, `party_b_id` |
| Party B plate | `other_plate`, `other_party_plate`, `party_b_plate` |
| injuries (bool) | `injuries`, `any_injuries`, `has_injuries` — accepts yes/no/true/false/نعم/لا |
| accident region | `governorate`, `region`, `accident_region` |
| accident city/area | `area`, `city`, `accident_city`, `accident_area` |
| accident location text | `location`, `location_text`, `accident_location`, `street`, `landmark` |
| accident date/time | `datetime`, `accident_datetime`, `accident_date`, `incident_date` |
| accident type | `accident_type`, `incident_type`, `collision_type` |

Unrecognized keys are ignored (never fatal) and echoed back in the response's
`ignoredKeys` + the feed event's payload so you can spot mapping gaps during setup.

## Testing without Hamsa

```bash
npm run simulate:call        # full started → ended sequence
```

Or a single curl:

```bash
curl -X POST http://localhost:3000/api/webhook/hamsa \
  -H "content-type: application/json" \
  -H "authorization: Bearer $HAMSA_WEBHOOK_SECRET" \
  -d '{
    "eventType": "call.ended",
    "callId": "call_curl_1",
    "data": { "data": { "outcomeResult": {
      "full_name": "محمد القحطاني",
      "national_id": "1023456789",
      "mobile": "+966551234567",
      "plate_number": "1234",
      "declared_role": "causer",
      "injuries": "no",
      "other_party_mobile": "+966509876543"
    } } }
  }'
```

The response contains both minted links; each appears as an SMS bubble on `/phone`.
