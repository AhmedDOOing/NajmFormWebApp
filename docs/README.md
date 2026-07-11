# Documentation governance

The Markdown files in this directory are the source of truth. They live in Git
alongside the software so operational changes and documentation are reviewed,
versioned, and released together.

## Documentation set

| Document | Audience | Purpose |
|---|---|---|
| [run-local-hamsa.md](run-local-hamsa.md) | Demo operator | Bring up the local app, ngrok, and Hamsa safely. |
| [flow.md](flow.md) | Product, engineering, operations | System boundaries and report lifecycle. |
| [hamsa.md](hamsa.md) | Voice-agent integrator | Webhook contract and outcome fields. |
| [setup.md](setup.md) | Developer | Local development commands and pages. |
| [twilio.md](twilio.md) | Operator | Simulated and real SMS behavior. |
| [demo-script.md](demo-script.md) | Presenter | Rehearsal and live-demo narrative. |
| [admin-operations.md](admin-operations.md) | Administrator | Access, secrets, data, incidents, and release checks. |
| [task-list.md](task-list.md) | Delivery team | Work needed to support a real service. |
| [../output/pdf/najm-poc-handoff.pdf](../output/pdf/najm-poc-handoff.pdf) | Stakeholders | Portable handoff snapshot. |

## Maintaining the set

1. Make code and documentation changes in the same pull request.
2. Update the relevant Markdown document and this log when an operational process,
   contract, or risk changes.
3. Run `npm run docs:pdf`, inspect the PDF, and commit it with the Markdown source.
4. Run `npm run typecheck` before merging.

| Date | Change | Owner |
|---|---|---|
| 2026-07-11 | Initial POC handoff, flow diagrams, runbook, admin guide, roadmap, and PDF. | Engineering |

## Suggested ownership

| Area | Review trigger |
|---|---|
| Webhook contract and outcome mapping | Any Hamsa agent/schema change |
| Demo runbook | Before every external demo |
| Secrets, access, and incidents | Monthly and after access changes |
| Privacy and retention | Before real customer data is collected |
| Delivery roadmap | Weekly during productionization |

The PDF is a release artifact, not the editable master. Use Git history and the
Markdown sources to understand, review, and revise the documentation.
