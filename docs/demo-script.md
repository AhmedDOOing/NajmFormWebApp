# Demo runbook (end to end)

Two ways to run it: fully local (no external services) or with a real Hamsa call
through ngrok. Both use `/phone` as the audience-facing screen.

## A. Fully local (5 minutes, zero config)

1. **Start**: `npm run dev` → open **http://localhost:3000/phone** on the projector.
2. **Place the "call"**: in a second terminal, `npm run simulate:call`.
   - Narrate the feed as it streams: call started → live Arabic transcript →
     call ended → *"report minted, link SMSed to the causer."*
3. **Party A's phone** (frame lights up): tap the link in the SMS bubble
   (opens `/r/<slugA>` in a new tab — on a phone-shaped window if you want the effect).
   - Language gate → injuries **pre-selected No** → note there's **no
     "which driver" question** (the call captured the declared role) → own details
     **pre-filled from the call** → shared accident details: add a photo (AI damage
     read appears under the upload if `ANTHROPIC_API_KEY` is set) → share location →
     consent → **Submit**.
4. **Party B's phone**: its frame already received the second SMS at call end (the
   call captured B's mobile). Tap its link → B's own (mostly empty) section →
   fill vehicle + driver → consent → **Submit**.
5. **Close**: feed shows `Party B submitted … status complete`; open
   `/dashboard/<reportId>` for the full record — flags, routing, both parties, AI
   analysis, audit trail.

Edge-case variants worth showing: answer **Yes** to injuries (emergency screen,
call 997, filing blocked) · Party A "not agreed" on the role (inline block) ·
a Party-A-only call (no B mobile captured — B's SMS goes out when A submits, if B's
mobile was entered on the form).

## B. Real Hamsa call (via ngrok)

1. Set `HAMSA_WEBHOOK_SECRET=<secret>` in `.env.local`, then run `npm run dev`.
2. `ngrok http 3000` → copy the https URL. (Set `NAJM_BASE_URL=https://<tunnel>`
   and restart only when the simulator should use the public URL.)
3. Configure the Hamsa agent: webhook URL `https://<tunnel>/api/webhook/hamsa`,
   Bearer `<secret>`, and outcome fields per [hamsa.md](hamsa.md).
4. Open `https://<tunnel>/phone` on the projector, **call the agent's number**, and
   talk through an accident in Arabic.
5. When you hang up, the `call.ended` event lands and the flow continues exactly as
   in A.3 — with Twilio live creds set, the SMS arrives on the real handsets too.

## Reset between runs

```bash
rm -f data/najm.db*    # wipes reports, feed, SMS — /phone starts clean
```

**Stop the dev server first** (then restart it): a running server keeps the deleted
database file open and will silently continue using it.
