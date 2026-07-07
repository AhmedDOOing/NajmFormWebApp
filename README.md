# Najm — Voice→Chat Accident-Report Handoff

A web app that receives an in-progress accident report from a **voice agent** and lets
**two drivers (Party A and Party B)** finish it on their phones — each via a short SMS
link that opens a **pre-filled** form. The two sessions are aware of each other in real
time over **WebSockets** (presence + a "sync barrier"): the report only advances once
both sides submit, or a timeout/escalation fires.

## The three things this gets right

1. **Link shortener** — the voice platform calls `POST /api/session`; the server mints
   one report + **two** short links (one per party) and returns them.
2. **Slug → predefined values** — each slug is an **opaque `nanoid` token** that maps
   server-side to a stored `prefill` payload. **No driver PII is ever in the URL** — the
   slug is a key, not a data carrier. The form is hydrated server-side (SSR).
3. **WebSocket presence & sync** — both parties join a room keyed by `reportId`, see each
   other's live status (connected / filling / submitted / absent), and the server
   enforces the sync barrier + grace/SLA timeouts.

## Driver flow (built for an intense roadside moment)

The form is a **confirm flow, not a fill flow** — Party A's data is already captured on
the call, so the app asks the driver to *confirm* it, not re-type it. It's an
**auto-advancing wizard**: one decision per screen, big tap targets, and tapping an
answer advances automatically (no "Next" clicks). Happy path is ~4–5 taps.

0. **Language gate** — opening `/r/<slug>` first shows a one-tap "choose your language"
   screen (العربية / English, each with an inline SVG flag). The choice sets the session
   locale + text direction and is persisted in a per-report+party cookie, so a refresh or
   resumed link never re-prompts (decided server-side in the resolver). The in-form header
   toggle still lets the driver switch afterward, and each party's language shows on the
   dashboard.
1. **Safety first** — the injury triage is the very first screen. "Yes" opens an
   emergency panel (one-tap Call 997) and flags `INJURY`; "No" auto-advances.
2. **Location** — a WhatsApp-style picker: dark map with a pulsing current-location dot,
   a **"Send my current location"** row (real GPS accuracy in metres), and a nearby-places
   list. Selecting collapses into a shared-pin card; denied/indoor falls back to manual
   entry (`LOC_MANUAL`). The captured pin is emitted live to the dashboard + other party.
   This step does **not** auto-advance — the driver sees the confirmed pin, then taps Next.
3. **Review** — Party A sees call-captured fields as green-checked confirm rows tagged
   *"from the call"*, each with an inline **Edit**. One **"Details are correct"** button
   moves on. Party B (minimal prefill) sees only the essentials to enter, required fields
   highlighted, everything else under **More details**.
4. **Photos** — one tap to add, or **Later** (flags `PHOTO_PENDING`).
5. **Confirm & send** — optional statement + a single **"I agree & submit"** button
   (the tap is the timestamped consent affirmation).

Action-changing edge cases (injury, hit-and-run, uninsured, …) surface as a compact alert
banner; low-signal `info` flags stay off the driver's screen but still drive routing and
show on the dashboard. A slim top strip shows the other party's live presence throughout.

## Branding & theme

Dark **Najm-green** theme driven entirely by CSS custom properties in one place
(`src/app/globals.css` `:root`). All component styles derive from the brand tokens —
**no hard-coded colors in components**. Swap `--najm` / `--najm-bright` (or the font) and
the whole app re-themes with no other edits:

```css
--najm: #00a650;  --najm-bright: #25c56e;  --najm-deep: #06231a;
--bg: #0c1512;  --surface: #131e19;  --line: #26352d;  --ink: #eaf3ec;  --muted: #8fa398;
```

Type is **IBM Plex Sans Arabic** via `next/font/google` (weights 400–700), applied to both
Arabic and Latin so the two scripts harmonize (`src/app/layout.tsx`). If Najm supplies a
licensed face, register it with `next/font/local` and point `--font-brand` at it — the
Google font stays as the fallback. Accessibility: visible `:focus-visible` outlines, tap
targets ≥ 44px, and `prefers-reduced-motion` disables the pulsing location halo.

## Single-device handover (primary path)

The primary flow is **one phone, one continuous session, sequential** — not two links
syncing live. Party A opens their link and it drives the whole thing:

```
Language gate → Party A fills → [LOCK & HANDOVER] → [B identity check] → Party B fills → submit
```

- **A fills** their part, then hits a hard **"hand the phone to the other driver"** screen.
- **A's zone locks** — enforced **server-side** (the submit endpoint returns `423` for any
  Party A edit once `report.phase != 'partyA'`), not just hidden.
- A light **B-identity check** (last 4 digits of B's captured mobile) gates entry to B's
  zone; B's statement/consent are **never pre-filled** and are inaccessible until it passes.
  Retry N → `PARTY_B_UNVERIFIED` → escalate (existing handling).
- **B fills** their part (can flag `SHARED_DISPUTE`) → submit → same completion + routing.
- **"The other driver isn't here"** branch → one-sided report (`PARTY_B_TIMEOUT`) + hands
  back B's remote link to send.
- **Resume**: reopening A's link after handover resumes in the B phase with A locked — it
  never reopens A's editable form. State lives in `report.phase`
  (`partyA → handover → partyB → complete`); handover + verify events are timestamped in the
  audit trail.

The two-link + Socket.IO presence path stays as the **remote fallback** (Party B's own link
still works, unchanged) — the single-device path doesn't depend on it.

Endpoints: `POST /handover`, `POST /verify-b`, `POST /absent` (all authorized by A's slug),
plus the `423` A-lock guard on the submit route.

## Stack

- **Next.js 14 (App Router, TypeScript)** — frontend + API routes + SSR form page.
- **Custom Node server (`server.ts`)** integrating **Socket.IO** for persistent WS.
- **SQLite via `better-sqlite3`** (local dev). Swap points to Redis (presence/pubsub) +
  Postgres (durable report/link) are noted in `src/lib/db.ts` and `src/lib/realtime.ts`.
- **`nanoid`** opaque slugs, **`zod`** validation. RTL-first, Arabic-primary UI.

## Run

```bash
npm install
npm run dev          # custom server + Socket.IO on http://localhost:3000
```

Open <http://localhost:3000> and click **POST /api/session** to mint a demo report, or
use the seed script / curl below.

```bash
npm run seed         # mints one demo report and prints the two links + dashboard
```

## Hamsa webhook handoff

Point Hamsa at `POST /api/hamsa/webhook`. The endpoint accepts extracted variables from
common payload locations such as `variables`, `extractedVariables`, `data.variables`,
`outcome.variables`, or each item in `outcomes`.

Important: Hamsa should capture **Party A / caller-side information only**. The webhook
always stores those values in `prefill.A` and leaves `prefill.B` empty, so Party B enters
and consents to their own details during the handover flow. If Hamsa captures
`other_party_mobile`, it is stored as Party A's `otherPartyMobile` and can be used only as
the handover identity check target; it does not pre-fill Party B's form.

Set `NAJM_HAMSA_WEBHOOK_SECRET` in production and send either
`Authorization: Bearer <secret>` or `x-hamsa-secret: <secret>`.

```bash
curl -s -X POST http://localhost:3000/api/hamsa/webhook \
  -H 'content-type: application/json' \
  -d '{
    "variables": {
      "party_a_full_name": "محمد عبدالله القحطاني",
      "party_a_national_id": "1023456789",
      "party_a_mobile": "0551234567",
      "party_a_plate": "أ ب ج 4821",
      "party_a_make_model": "تويوتا كامري",
      "party_a_insurance_status": "valid",
      "accident_city": "الرياض",
      "accident_type": "اصطدام خلفي",
      "vehicles_involved": 2,
      "injuries": false,
      "other_party_status": "present",
      "other_party_mobile": "0509876543",
      "language": "ar"
    }
  }'
```

Variables to ask Hamsa to capture:

| Variable | Prefills |
|---|---|
| `party_a_full_name` | Party A full name |
| `party_a_national_id` | Party A national / iqama ID |
| `party_a_mobile` | Party A mobile |
| `party_a_nationality` | Party A nationality |
| `party_a_licence_no` | Party A licence number |
| `party_a_licence_expiry` | Party A licence expiry date |
| `party_a_not_owner` | Whether Party A is not the vehicle owner |
| `party_a_owner_name` | Vehicle owner name |
| `party_a_plate` | Party A vehicle plate |
| `party_a_make_model` | Party A vehicle make/model |
| `party_a_year` | Party A vehicle year |
| `party_a_colour` | Party A vehicle colour |
| `party_a_vehicle_type` | `private`, `commercial`, `rental`, `government`, or `motorcycle` |
| `party_a_registration_status` | `valid` or `expired` |
| `party_a_insurance_status` | `valid`, `expired`, `none`, or `unknown` |
| `party_a_insurer` | Insurance company |
| `party_a_policy_no` | Insurance policy number |
| `party_a_coverage_type` | Coverage type |
| `accident_city` | Accident city |
| `accident_district` | Accident district |
| `accident_landmark` | Accident landmark |
| `accident_lat` / `accident_lng` | Accident coordinates, if Hamsa has them |
| `accident_location_label` | Human-readable accident location |
| `accident_date` | Accident date |
| `accident_type` | Accident type |
| `vehicles_involved` | Number of vehicles |
| `accident_description` | Short incident description |
| `damage_location` | Damage location on Party A's vehicle |
| `damage_severity` | `minor`, `moderate`, or `severe` |
| `injuries` | `true` / `false` |
| `other_party_status` | `present`, `fled`, `parked`, or `none` |
| `other_party_mobile` | Optional Party A-provided other-party mobile for handover verification only |
| `language` | `ar` or `en` language hint |

## Simulate the voice agent (exact curl)

Party A's prefill is rich (captured on the call); Party B's is minimal (they never spoke
to the agent — just their phone number).

```bash
curl -s -X POST http://localhost:3000/api/session \
  -H 'content-type: application/json' \
  -d '{
    "ttl": 86400000,
    "prefill": {
      "A": {
        "fullName": "محمد عبدالله القحطاني",
        "nationalId": "1023456789",
        "mobile": "0551234567",
        "licenceNo": "L8842190",
        "licenceExpiry": "2027-03-01",
        "plate": "أ ب ج 4821",
        "makeModel": "تويوتا كامري",
        "vehicleType": "private",
        "registrationStatus": "valid",
        "insuranceStatus": "valid",
        "accidentType": "اصطدام خلفي",
        "vehiclesInvolved": 2,
        "otherPartyStatus": "present",
        "injuries": false,
        "_agentFilledFields": ["fullName","nationalId","mobile","licenceNo","plate","makeModel","vehicleType","insuranceStatus","accidentType","otherPartyStatus"]
      },
      "B": { "mobile": "0509876543", "_agentFilledFields": ["mobile"] }
    }
  }'
```

Response:

```json
{
  "reportId": "NJM-26-4821",
  "expiresAt": "...",
  "partyA": { "url": "http://localhost:3000/r/<opaque-slug>" },
  "partyB": { "url": "http://localhost:3000/r/<opaque-slug>" }
}
```

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/session` | Voice agent mints report + two slugs → returns two short URLs. |
| `POST` | `/api/hamsa/webhook` | Hamsa Party-A-only extracted-variable webhook → maps variables to prefill and returns two short URLs. |
| `GET`  | `/r/:slug` | Opaque slug → SSR form for that report+party with `prefill` injected. Expired/unknown → recovery page (never a raw 404). |
| `POST` | `/api/report/:reportId/party/:party/submit` | Validates token↔report↔party, stores answers, computes edge-case flags, broadcasts over the socket. Body: `{ slug, answers }`. |
| `GET`  | `/api/report/:reportId` | Status + flags + presence + audit trail (agent/dashboard). |

## WebSocket contract (Socket.IO, room = `reportId`)

**Client → server:** `join {reportId, party, slug}` (slug validated against report+party),
`status {presence: 'filling'|'submitted'}`.
**Server → client:** `presence {A, B}`, `party:submitted {party}`, `sync:complete {reportId}`,
`party:timeout {party}`, `report:flags {flags, status}`.

- On disconnect, a **60s grace timer** runs before broadcasting `absent` (survives dropped
  mobile connections). Configurable via `NAJM_GRACE_MS`.
- If Party B never joins within the **SLA (15 min, `NAJM_PARTY_B_SLA_MS`)**, the server emits
  `party:timeout`, flags `PARTY_B_TIMEOUT`, and allows Party-A-only progression.

## Edge-case flags → routing (brief §7)

Flags are computed on submit (and shown live in the form's status strip). Routing precedence:

- `INJURY` → **EMERGENCY** (997 + traffic police) — overrides all.
- `HIT_AND_RUN` / `PARKED_HIT` / `UNINSURED` → **POLICE_REPORT**.
- `REG_VIOLATION` / `LICENCE_INVALID` / `OWNER_MISMATCH` / `SPECIAL_VEHICLE` /
  `MULTI_VEHICLE` / `PARTY_B_TIMEOUT` / `PARTY_B_UNVERIFIED` → **MANUAL_REVIEW**.
- otherwise → **AUTOMATIC**.

Other flags: `SINGLE_VEHICLE` (skip Party B), `LOC_MANUAL` (GPS fallback),
`PHOTO_PENDING` (photos outstanding), `LINK_EXPIRED` (recovery page).

## Privacy & audit

- Slugs opaque; **no PII in URL/query string ever**.
- `join` and `submit` both re-validate the slug/token matches the report+party.
- Consent stored as a discrete, timestamped record per party (`consent` table).
- Every meaningful step timestamped in an append-only `audit` table (insurance disputes).
- Links are single-report-scoped with a TTL; expired links render a recovery page.

## Project map

```
server.ts                     custom Node server: Next + Socket.IO, join/status/disconnect
src/lib/
  config.ts                   TTLs, SLA, grace-timer knobs
  db.ts                       SQLite schema + queries (swap notes for Redis/Postgres)
  slug.ts                     opaque nanoid slug + report id
  session.ts                  createSession(): mint report + two slugs
  flags.ts                    computeFlags() + routeOutcome() + bilingual flag metadata
  schema.ts                   zod: session + submit payloads
  realtime.ts                 in-memory presence store, grace/SLA timers, io bridge
  socketContract.ts           typed Socket.IO events
  hamsa.ts                    Hamsa Party-A-only outcome variable mapper
  i18n.ts                     Arabic (primary, RTL) / English strings
src/app/
  page.tsx                    demo landing ("simulate the voice agent")
  api/session/route.ts        POST /api/session
  api/hamsa/webhook/route.ts  POST /api/hamsa/webhook
  api/report/[reportId]/...   status + submit routes
  r/[slug]/page.tsx           SSR slug resolver → form (or recovery page)
  dashboard/[reportId]/...    live presence + flags (agent/demo view)
src/components/
  AccidentForm.tsx            the 8-section form, conditional logic, live flag strip
  FlagStrip.tsx PresenceBar.tsx RecoveryPage.tsx useReportSocket.ts
scripts/seed.ts               seed one demo report
```
