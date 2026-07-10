# SMS: simulated vs real (Twilio)

SMS delivery is **simulated-first**. Every outbound message is recorded in the
`sms_message` table and rendered as a bubble on `/phone` — that's the primary demo
surface, and it works with zero configuration.

## Modes

| TWILIO_* env | Behavior |
|---|---|
| not set (default) | Row recorded with `provider: simulated`. Nothing leaves the machine. |
| all three set | The app **also** calls Twilio's REST API (`Messages.json`, direct fetch — no SDK dependency) and records `sid` + status (`queued`/`sent`/`failed` + error). |

```bash
TWILIO_ACCOUNT_SID=AC…
TWILIO_AUTH_TOKEN=…
TWILIO_FROM=+1…            # your Twilio number (or magic test number)
```

**SMS never blocks the flow.** A Twilio failure is recorded on the row (shown as a
red `failed` pill on /phone) and the webhook/submit request still succeeds.

## Twilio test credentials

Twilio's **test credentials** (Console → Account → API keys & tokens → Test
credentials) exercise the API without sending anything or charging:

- From `+15005550006` — the magic "valid from" number; messages are accepted
  (`queued`) but **never delivered**.
- To any real-looking number — accepted; certain magic "to" numbers trigger specific
  errors (e.g. `+15005550001` → invalid number) for failure testing.

So with test creds you'll see `twilio · queued` pills on /phone but no phone will
buzz. For a live demo where a real handset receives the SMS, use **live credentials**
+ a purchased/verified number, and note trial accounts can only text **verified**
numbers and prefix messages with "Sent from a Twilio trial account".

KSA note: sending to +9665… numbers generally requires a registered alphanumeric
sender ID or approved number — treat real delivery as a production task, and demo
with the simulator.

## Message templates

Bilingual bodies live in `SMS_TEMPLATES` (`src/lib/sms.ts`):

- **partyLink** — a party's own link. Sent on `call.ended` to every mobile the call
  captured, and again from the submit route to the other party if they were never
  texted (e.g. their number was only entered on the form).

Where it's triggered: `src/app/api/webhook/hamsa/route.ts` and
`src/app/api/report/[reportId]/submit/route.ts`.
