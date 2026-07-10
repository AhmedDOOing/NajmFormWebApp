# Setup & running

## Requirements

- Node 20+ (better-sqlite3 native module builds on install)
- npm

## Install & run

```bash
npm install
npm run dev        # Next.js dev server on http://localhost:3000
```

There is no custom server — plain `next dev` / `next build` / `next start`.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (hot reload). |
| `npm run build` / `npm start` | Production build / serve. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run seed` | Mints one **manual** demo report and prints the causer link (role chooser visible — webhook-minted links skip it). |
| `npm run simulate:call` | Fires a full fake Hamsa call (started → answered → transcripts → ended) at the local webhook. Respects `NAJM_BASE_URL` + `HAMSA_WEBHOOK_SECRET`. |

## Pages

| Path | What |
|---|---|
| `/` | Demo landing — manually mint a causer link (simulates the voice agent). |
| `/phone` | **Live demo simulator** — webhook feed + phone mockups receiving the SMS. |
| `/r/<slug>` | The driver-facing flow (causer filing link or affected ack link). |
| `/dashboard/<reportId>` | Per-report status: flags, routing, parties, AI analysis, audit trail. |

## Environment variables

Create `.env.local` (Next.js loads it automatically):

```bash
NAJM_BASE_URL=http://localhost:3000   # what gets minted into links + SMS
HAMSA_WEBHOOK_SECRET=change-me        # Bearer token for /api/webhook/hamsa
ANTHROPIC_API_KEY=sk-ant-...          # optional: real AI photo analysis
TWILIO_ACCOUNT_SID=AC...              # optional: real SMS (all three needed)
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=+1...
```

Everything works with none of them set: the webhook is open, SMS is simulated,
photo analysis returns a clearly-marked stub.

## Resetting local data

All state lives in one SQLite file:

```bash
rm -f data/najm.db data/najm.db-shm data/najm.db-wal
```

The schema is recreated on the next request. `data/` is gitignored.
