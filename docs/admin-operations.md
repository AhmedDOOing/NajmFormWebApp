# Administration and operations guide

This guide makes the current demo safe to operate. It does not make the POC
production-ready; the production gaps are tracked in [task-list.md](task-list.md).

## Access and responsibility

| Responsibility | Administrator action |
|---|---|
| Repository | Grant least-privilege Git access; protect the default branch and require review for webhook, auth, or data changes. |
| Hamsa agent | Maintain the webhook URL, Bearer secret, subscribed events, and `outcomeResult` extraction fields. |
| ngrok | Own the account/token and reserved domain if used; do not publish the authtoken. |
| Twilio | Limit console/API access and use a dedicated sender. |
| Demo data | Use synthetic identities, phone numbers, and transcripts only. Reset local data after external demos. |

## Configuration inventory

| Item | Storage | Change action |
|---|---|---|
| `HAMSA_WEBHOOK_SECRET` | `.env.local` locally; managed secret store when deployed | Change app secret, restart/redeploy, then update Hamsa and run a smoke test. |
| `NAJM_BASE_URL` | `.env.local` when needed | Change when the simulator targets a new public host. Real ngrok webhooks derive their host. |
| `TWILIO_*` / `ANTHROPIC_API_KEY` | Managed secret store; local env only for authorized testing | Rotate via provider, update deployment secret, then test a controlled request. |
| ngrok authtoken | ngrok config / managed secret system | Rotate in ngrok and update authorized operator machines only. |

Never commit `.env.local`, tokens, real phone numbers, raw production transcripts,
or database copies. `.env.example` documents variable names without values.

## Before opening a public tunnel

- Set a non-empty `HAMSA_WEBHOOK_SECRET` and restart the application.
- Use synthetic test calls and numbers unless live SMS has explicit approval.
- Confirm the screen shows the public `/phone` URL and Hamsa has the current tunnel URL.
- Restrict access to the demo screen and ngrok inspector: feed payloads can contain webhook data.

Use [run-local-hamsa.md](run-local-hamsa.md) as the exact setup procedure.

## Routine operation

1. Start the app and tunnel; send the smoke-test event.
2. Confirm `/phone` shows it, then watch `link_minted`, `sms_partyA`, and `sms_partyB`.
3. Use `/dashboard/<reportId>` for report status, flags, and audit rows.
4. Record `ignoredKeys` from Hamsa and update the agent or mapping through a reviewed pull request.
5. Stop the tunnel and app after the demo. Reset the database only after Next stops.

## Incident response

| Situation | Immediate action | Follow-up |
|---|---|---|
| Secret exposed | Stop external access, rotate it in app and provider, restart/redeploy. | Review scope and logs without distributing PII. |
| Unexpected public traffic | Stop ngrok and inspect tunnel/feed. | Rotate the webhook secret if exposure is uncertain. |
| Bad Hamsa mapping | Preserve a redacted payload fixture. | Update mapper and docs together; add a regression test. |
| SMS failure | Report creation remains valid; inspect provider status. | Check credentials, sender rules, and country policy before retrying. |
| Clear demo data | Stop Next, delete `data/najm.db`, `data/najm.db-shm`, `data/najm.db-wal`, restart. | Confirm the demo is empty. |

## Release checklist

- [ ] Code, docs, and generated PDF are in the same reviewed pull request.
- [ ] `npm run typecheck` passes.
- [ ] A simulated call and completed two-party flow work.
- [ ] Webhook changes pass an ngrok smoke test.
- [ ] Mapping changes update both `src/lib/hamsa.ts` and `docs/hamsa.md`.
- [ ] No secret, PII, local database, or unreviewed generated file is staged.
