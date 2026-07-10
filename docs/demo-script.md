# Demo runbook (end to end)

Two ways to run it: fully local (no external services) or with a real Hamsa call
through ngrok. Both use `/phone` as the audience-facing screen.

## A. Fully local (5 minutes, zero config)

1. **Start**: `npm run dev` → open **http://localhost:3000/phone** on the projector.
2. **Place the "call"**: in a second terminal, `npm run simulate:call`.
   - Narrate the feed as it streams: call started → live Arabic transcript →
     call ended → *"report minted, link SMSed to the causer."*
3. **The causer's phone** (left frame lights up): tap the link in the SMS bubble
   (opens `/r/<slug>` in a new tab — on a phone-shaped window if you want the effect).
   - Language gate → injuries **pre-selected No** → note there's **no
     "which driver" question** (the call established it) → details step is
     **pre-filled from the call** → Next.
   - Add the affected party (mobile is pre-filled from the call) → accident step:
     add a photo (AI damage read appears under the upload if `ANTHROPIC_API_KEY` is
     set) → share location → fault declaration → **Submit**.
4. **The affected's phone**: back on `/phone`, a second frame has appeared with the
   ack SMS. Tap its link → read-only summary → **Accept**.
5. **Close**: feed shows `ack_accepted … report complete`; open
   `/dashboard/<reportId>` for the full record — flags, routing, fault declaration
   timestamp, AI analysis, audit trail.

Edge-case variants worth showing: answer **Yes** to injuries (emergency screen,
call 997, filing blocked) · **Reject** the ack (`FAULT_DISPUTED` → disputed/manual
review) · property-only report (no affected party → completes immediately).

## B. Real Hamsa call (via ngrok)

1. `ngrok http 3000` → copy the https URL.
2. `NAJM_BASE_URL=https://<tunnel> HAMSA_WEBHOOK_SECRET=<secret> npm run dev`
3. Configure the Hamsa agent: webhook URL `https://<tunnel>/api/webhook/hamsa`,
   Bearer `<secret>`, and outcome fields per [hamsa.md](hamsa.md).
4. Open `https://<tunnel>/phone` on the projector, **call the agent's number**, and
   talk through an accident in Arabic.
5. When you hang up, the `call.ended` event lands and the flow continues exactly as
   in A.3 — with Twilio live creds set, the SMS arrives on the real handset too.

## Reset between runs

```bash
rm -f data/najm.db*    # wipes reports, feed, SMS — /phone starts clean
```
