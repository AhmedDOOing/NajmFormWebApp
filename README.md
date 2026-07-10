# Najm — Voice→Web Accident Report POC

A driver calls **Najm's voice agent (Hamsa)** after a traffic accident. When the call
ends, Hamsa POSTs a webhook here; the server **mints two pre-filled report links**
(Party A and Party B), **SMSes each party their link** (simulated or real Twilio), and
each driver completes *their own section* of the report on their phone in a few taps.

A live **/phone** page shows the whole thing happening in real time: incoming webhook
events on the left, phone mockups "receiving" the SMS (with tappable links) on the right
— that's the demo surface.

```
Hamsa voice call
   └─ call.ended webhook ──▶ POST /api/webhook/hamsa
                              ├─ map outcomeResult → Party A prefill (+ Party B if captured)
                              ├─ mint report + two opaque links  (/r/<slugA>, /r/<slugB>)
                              ├─ SMS each captured mobile its link (Twilio or simulated)
                              └─ everything logged to the live feed
Party A opens /r/<slugA>
   └─ language gate → injury triage (+ role declaration unless the call captured it)
     → own details (pre-filled "from the call") → shared accident details + photos
       (AI damage analysis) → consent → submit
Party B opens /r/<slugB>
   └─ language gate → own details → consent → submit
Both submitted → complete · injuries / AI signals → escalated (manual review)
Watch it live:  /phone   ·   per-report status:  /dashboard/<reportId>
```

## Model — neutral two-party

One report, **two opaque links**. Either party can start; each fills **only their own
section** (vehicle + driver). Party A additionally carries the shared accident details
(date/time, location, photos). No fault admission is required to file — Party A can
optionally declare a role (causer/affected) during triage; when the voice call already
captured it, that screen is skipped. Webhook-minted links open pre-filled; manual links
(`npm run seed` / the landing page scenarios) behave the same minus the call data.

Edge cases → flags: `INJURY` (emergency, overrides everything), `PHOTO_PENDING`,
`LOC_MANUAL`, plus the assistive `AI_FAULT_MISMATCH` / `AI_DAMAGE_INCONSISTENT`
(always route to a human — the AI never decides fault; see `src/lib/photoAnalysis.ts`).

## Quickstart

```bash
npm install
npm run dev            # http://localhost:3000
npm run simulate:call  # terminal 2 — fires a full fake Hamsa call sequence
```

Open <http://localhost:3000/phone> **before** running `simulate:call` and watch the
call land: feed events stream in, both phone frames receive their SMS, and each link
opens the real pre-filled flow. Full walkthrough: [docs/demo-script.md](docs/demo-script.md).

## Environment

| Var | Required | Purpose |
|---|---|---|
| `NAJM_BASE_URL` | for ngrok/prod | Fallback base URL for minted links (the webhook prefers the request's own host, so ngrok links Just Work). |
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
| `POST` | `/api/webhook/hamsa` | Hamsa call events. `call.ended` mints report + both party links + SMS. Idempotent per `callId`. Bearer-authed. |
| `POST` | `/api/session` | Manual mint (landing page / seed) — same result, `source:"manual"`. |
| `GET`  | `/r/:slug` | Opaque slug → SSR per-party flow, pre-filled. Expired/unknown → recovery page. |
| `POST` | `/api/report/:id/submit` | A party files their own section (slug decides which). Returns the other party's link; SMSes it if never sent. |
| `POST` | `/api/report/:id/analyze` | AI photo analysis (slug-authorized; server-side Anthropic call). |
| `GET`  | `/api/report/:id` | Full report status (dashboard). |
| `GET`  | `/api/feed?events=&sms=` | Cursor-polled live feed (the /phone page). |
| `POST` | `/api/lookup` | Registry lookup dev stub — **wire the real registry before production.** |

## Privacy & audit

- Slugs are opaque `nanoid` tokens — **no PII in any URL**; each party's data is SSR'd
  only to the holder of that party's link.
- Consent and every submission are discrete, timestamped audit rows (append-only
  `audit` table).
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
  session.ts        createSession(): mint report + both party links (+ intake)
  db.ts             SQLite schema + queries (report/link/audit/feed/sms)
  flags.ts          routeOutcome() + bilingual flag metadata
  photoAnalysis.ts  server-side Claude vision analysis (assistive, never authoritative)
  etraffic.ts       select-options config + registry lookup stub
  schema.ts i18n.ts locale.ts slug.ts config.ts types.ts
src/app/
  api/webhook/hamsa/route.ts   the Hamsa webhook
  api/feed/route.ts            live feed for /phone
  phone/                       live demo simulator (feed + phone frames)
  r/[slug]/page.tsx            SSR slug resolver → per-party flow
  dashboard/[reportId]/        per-report status view (polls 2s)
  page.tsx                     manual demo landing (call-capture scenarios)
src/components/
  PartyFlow.tsx                the per-party flow (triage → own details → accident → consent)
  AddPropertyDialog.tsx LocationStep.tsx FlagStrip.tsx RecoveryPage.tsx
scripts/
  seed.ts                      mint one manual demo report
  simulate-call.ts             fire a full fake Hamsa call at the webhook
```
