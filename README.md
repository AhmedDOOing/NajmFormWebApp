# Najm — Voice→Web Accident Report POC

A driver calls **Najm's voice agent (Hamsa)** after a traffic accident. When the call
ends, Hamsa POSTs a webhook here; the server **mints a pre-filled accident-report
link**, **SMSes it to the at-fault driver** (simulated or real Twilio), and the driver
completes the report on their phone in a few taps. Each affected party then gets an
**acknowledgment link** to accept or reject the fault admission — they never fill a form.

A live **/phone** page shows the whole thing happening in real time: incoming webhook
events on the left, phone mockups "receiving" the SMS (with tappable links) on the right
— that's the demo surface.

```
Hamsa voice call
   └─ call.ended webhook ──▶ POST /api/webhook/hamsa
                              ├─ map outcomeResult → causer prefill + intake
                              ├─ mint report + opaque causer link  (/r/<slug>)
                              ├─ SMS the link (Twilio or simulated)
                              └─ everything logged to the live feed
Causer opens /r/<slug>
   └─ language gate → injury triage → confirm details (pre-filled "from the call")
     → add affected parties / properties → accident details + photos (AI analysis)
     → fault declaration → submit
        ├─ ack link minted + SMSed per affected party
        └─ affected opens /r/<ack-slug> → Accept | Reject (no data entry)
             all accept → complete · any reject → FAULT_DISPUTED → manual review
Watch it live:  /phone   ·   per-report status:  /dashboard/<reportId>
```

## eTraffic model

Mirrors Bahrain's eTraffic "Report Traffic Accidents": **only the causer (at-fault
driver) files.** Affected parties are added to the report and receive an acknowledgment
link — accept/reject only. Webhook-minted links skip the "which driver are you?"
chooser (the voice agent already established the roles); manually minted links
(`npm run seed` or the landing page) keep it for demo purposes.

Edge cases → flags: `INJURY` (emergency, overrides everything), `FAULT_DISPUTED`,
`AFFECTED_LOOKUP_FAILED`, `PROPERTY_ONLY`, `PHOTO_PENDING`, `LOC_MANUAL`, plus the
assistive `AI_FAULT_MISMATCH` / `AI_DAMAGE_INCONSISTENT` (always route to a human —
the AI never decides fault; see `src/lib/photoAnalysis.ts`).

## Quickstart

```bash
npm install
npm run dev            # http://localhost:3000
npm run simulate:call  # terminal 2 — fires a full fake Hamsa call sequence
```

Open <http://localhost:3000/phone> **before** running `simulate:call` and watch the
call land: feed events stream in, the causer's phone frame receives the SMS, and the
link in the bubble opens the real pre-filled flow. Full walkthrough:
[docs/demo-script.md](docs/demo-script.md).

## Environment

| Var | Required | Purpose |
|---|---|---|
| `NAJM_BASE_URL` | for ngrok/prod | Base URL minted into links + SMS bodies. Default `http://localhost:3000`. |
| `HAMSA_WEBHOOK_SECRET` | recommended | Bearer token the webhook requires. Unset = open (local dev only). |
| `ANTHROPIC_API_KEY` | optional | Enables real AI photo analysis (`claude-sonnet-5`); otherwise a marked stub. |
| `TWILIO_ACCOUNT_SID` `TWILIO_AUTH_TOKEN` `TWILIO_FROM` | optional | All three set → real SMS send attempts; otherwise simulated. Never blocks the flow. |
| `PORT` | optional | Dev server port (default 3000). |

## Docs

- [docs/setup.md](docs/setup.md) — install, run, seed, reset, page index
- [docs/hamsa.md](docs/hamsa.md) — webhook contract + configuring the Hamsa agent
- [docs/ngrok.md](docs/ngrok.md) — expose the webhook for real Hamsa calls
- [docs/twilio.md](docs/twilio.md) — simulated vs real SMS
- [docs/demo-script.md](docs/demo-script.md) — end-to-end demo runbook

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/webhook/hamsa` | Hamsa call events. `call.ended` mints report + causer link + SMS. Idempotent per `callId`. Bearer-authed. |
| `POST` | `/api/session` | Manual mint (landing page / seed) — same result, `source:"manual"`. |
| `GET` | `/r/:slug` | Opaque slug → SSR causer flow (pre-filled) or affected ack page. Expired/unknown → recovery page. |
| `POST` | `/api/report/:id/submit` | Causer files (slug-authorized). Mints + SMSes ack links, computes flags/routing. |
| `POST` | `/api/report/:id/analyze` | AI photo analysis (causer slug only; server-side Anthropic call). |
| `POST` | `/api/ack/:ackSlug` | Affected party accepts/rejects the fault admission. |
| `GET` | `/api/report/:id` | Full report status (dashboard). |
| `GET` | `/api/feed?events=&sms=` | Cursor-polled live feed (the /phone page). |
| `POST` | `/api/lookup` | Registry lookup dev stub — **wire the real registry before production.** |

## Privacy & audit

- Slugs are opaque `nanoid` tokens — **no PII in any URL**; report data is SSR'd only
  to the link holder.
- The fault declaration and every accept/reject are discrete, timestamped audit rows
  (append-only `audit` table).
- The webhook stores the raw envelope in the feed for demo/debug — prune this for
  production or scrub transcripts.

## Stack

Next.js 14 (App Router, TypeScript) · SQLite via `better-sqlite3` (dev; swap notes in
`src/lib/db.ts`) · zod · shadcn/ui + Tailwind, dark Najm-green theme via CSS custom
properties (`src/app/globals.css`) · Arabic-primary RTL, IBM Plex Sans Arabic.

## Project map

```
src/lib/
  hamsa.ts          webhook envelope parsing + tolerant outcomeResult mapping (synonym table)
  sms.ts            simulated-first SMS; real Twilio REST when TWILIO_* set
  session.ts        createSession(): mint report + causer link (+ intake)
  db.ts             SQLite schema + queries (report/link/affected/audit/feed/sms)
  flags.ts          routeOutcome() + bilingual flag metadata
  photoAnalysis.ts  server-side Claude vision analysis (assistive, never authoritative)
  etraffic.ts       property/registration config + registry lookup stub
  schema.ts i18n.ts locale.ts slug.ts config.ts types.ts
src/app/
  api/webhook/hamsa/route.ts   the Hamsa webhook
  api/feed/route.ts            live feed for /phone
  phone/                       live demo simulator (feed + phone frames)
  r/[slug]/page.tsx            SSR slug resolver → causer flow | affected ack
  dashboard/[reportId]/        per-report status view (polls 2s)
  page.tsx                     manual demo landing (mints a causer link)
src/components/
  CauserFlow.tsx               the filing flow (triage → details → accident → declaration)
  AffectedAck.tsx AddAffectedDialog.tsx AddPropertyDialog.tsx LocationStep.tsx
scripts/
  seed.ts                      mint one manual demo report
  simulate-call.ts             fire a full fake Hamsa call at the webhook
```
