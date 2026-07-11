"""Create the portable Najm POC documentation snapshot.

Markdown under docs/ is the editable, version-controlled master. This script
generates output/pdf/najm-poc-handoff.pdf for offline stakeholder sharing.
"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "najm-poc-handoff.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

S = getSampleStyleSheet()
S.add(ParagraphStyle(name="Cover", parent=S["Title"], fontSize=27, leading=34,
                     alignment=TA_CENTER, textColor=colors.HexColor("#005C4B")))
S.add(ParagraphStyle(name="H1x", parent=S["Heading1"], fontSize=18, leading=23,
                     spaceBefore=8, spaceAfter=8, textColor=colors.HexColor("#005C4B")))
S.add(ParagraphStyle(name="H2x", parent=S["Heading2"], fontSize=12, leading=16,
                     spaceBefore=7, spaceAfter=5, textColor=colors.HexColor("#00735C")))
S.add(ParagraphStyle(name="Bodyx", parent=S["BodyText"], fontSize=9.4, leading=14, spaceAfter=6))
S.add(ParagraphStyle(name="Smallx", parent=S["BodyText"], fontSize=8, leading=11))

def p(text, style="Bodyx"):
    return Paragraph(text, S[style])

def bullets(items):
    return [p("- " + item) for item in items]

def tbl(headers, rows, widths):
    data = [[p(x, "Smallx") for x in headers]] + [[p(x, "Smallx") for x in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#005C4B")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F4F8F6")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#B8CEC8")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#555555"))
    canvas.drawString(1.7 * cm, 1.1 * cm, "Najm Voice-to-Web Accident Report POC - controlled documentation snapshot")
    canvas.drawRightString(A4[0] - 1.7 * cm, 1.1 * cm, f"Page {doc.page}")
    canvas.restoreState()

story = [Spacer(1, 4.5 * cm), p("Najm POC", "Cover"), p("Voice-to-Web Accident Report", "Cover"),
         Spacer(1, 0.8 * cm), p("Operational handoff, system flow, administration guide, and delivery roadmap", "Bodyx"),
         Spacer(1, 1.6 * cm), p("Version: 2026-07-11", "H2x"),
         p("Editable source: repository docs/*.md. This PDF is a generated release artifact.", "Smallx"), PageBreak()]

story += [p("1. Purpose and system flow", "H1x"),
          p("Najm is a proof of concept that receives a Hamsa voice-agent outcome, mints two private report links, and lets each accident party complete its own web section. It is demonstration-ready, not approved for real customer data or production operation."),
          p("End-to-end lifecycle", "H2x"),
          p("Driver calls Hamsa -> Hamsa sends lifecycle webhooks -> Najm records the live feed -> call.ended maps outcomeResult -> report and two opaque links are created -> SMS adapter sends the links -> parties complete their own web sections -> submissions update status, flags, and audit trail."),
          p("Key rules", "H2x")] + bullets([
              "Every valid-looking webhook event is recorded; only call.ended mints a report.",
              "A repeated call.ended with the same callId returns the original report and links.",
              "Party A supplies shared accident details; both parties supply their own driver and vehicle details.",
              "Injury and assistive AI signals escalate a report; the app never decides fault automatically.",
          ]) + [p("Operational surfaces", "H2x"), tbl(["Surface", "Use"], [
              ["/phone", "Live webhook feed and simulated SMS phone frames. Open before a call."],
              ["/r/&lt;slug&gt;", "Driver-facing flow, reached via opaque per-party link."],
              ["/dashboard/&lt;reportId&gt;", "Report status, flags, parties, AI analysis, and audit trail."],
              ["localhost:4040", "ngrok inspector for inbound webhook troubleshooting."],
          ], [4.0*cm, 12.3*cm]), PageBreak()]

story += [p("2. Run locally with ngrok and Hamsa", "H1x"),
          p("Prerequisites: Node 20+, npm, ngrok CLI/account, and Hamsa agent configuration access."),
          p("Start", "H2x"), p("1. npm install<br/>2. cp .env.example .env.local<br/>3. Set HAMSA_WEBHOOK_SECRET to a long random value.<br/>4. npm run dev<br/>5. Confirm http://localhost:3000/phone loads."),
          p("Expose", "H2x"), p("In terminal two run ngrok http 3000. Copy its HTTPS forwarding address and open https://&lt;tunnel&gt;/phone. Real webhook requests mint public links from this incoming host. NAJM_BASE_URL is primarily needed when the simulator must target the public tunnel."),
          p("Configure Hamsa", "H2x"), tbl(["Setting", "Value"], [
              ["URL", "https://&lt;tunnel&gt;/api/webhook/hamsa"], ["Method / type", "POST / application/json"],
              ["Authorization", "Bearer followed by the same HAMSA_WEBHOOK_SECRET"],
              ["Events", "call.ended at minimum; lifecycle/transcription events for the live feed"],
          ], [4.1*cm, 12.2*cm]), Spacer(1, 0.35*cm),
          p("Smoke test", "H2x"), p("POST a call.started event with the Bearer header to the public webhook. Expect {ok:true, recorded:call.started} and confirm the event appears in /phone. Inspect localhost:4040 first if it does not."),
          p("Outcome contract", "H2x"), p("Hamsa should return structured outcomeResult values on call.ended. The minimum useful capture is Party A name, mobile, plate, declared role, injury answer, and Party B mobile. Detailed synonyms and a sample payload are in docs/hamsa.md."), PageBreak()]

story += [p("3. Administration and safety", "H1x"),
          p("Use synthetic data for demonstrations. Raw webhook envelopes are retained in the live feed for debugging, so this POC is not a production data store."),
          tbl(["Area", "Administrator action"], [
              ["Secrets", "Keep .env.local private. Use a managed secret store in deployed environments and rotate at app and provider together."],
              ["Tunnel", "Set a webhook secret before exposing ngrok. Update Hamsa whenever the free tunnel URL changes."],
              ["SMS", "SMS failure does not block report creation. Check provider status and country/sender rules before retrying."],
              ["Data", "Stop Next before deleting the local SQLite files for a clean demo. Never commit data copies or real transcripts."],
              ["Changes", "Review code, Markdown source, and generated PDF together in one pull request."],
          ], [3.1*cm, 13.2*cm]), Spacer(1, 0.35*cm),
          p("First actions during an incident", "H2x")] + bullets([
              "Secret exposed: stop external access, rotate it in the app and provider, restart/redeploy, then review scope without spreading PII.",
              "Unexpected traffic: stop ngrok, inspect tunnel/feed, and rotate the webhook secret if exposure is uncertain.",
              "Bad mapping: preserve a redacted example, update mapper and docs together, and add a regression fixture.",
          ]) + [p("The complete operator guide is docs/admin-operations.md.", "Smallx"), PageBreak()]

story += [p("4. Working-demo checklist", "H1x"),
          p("This is the immediate operational work needed to demonstrate the existing POC end to end with Hamsa."),
          tbl(["Task", "Done when"], [
              ["D1 - D4: local setup", "Node/npm/ngrok are available; .env.local has HAMSA_WEBHOOK_SECRET; npm run dev and npm run simulate:call work; /phone shows events and links."],
              ["D5: public tunnel", "ngrok http 3000 supplies an HTTPS URL and its /phone page loads."],
              ["D6 - D8: Hamsa setup", "Hamsa POSTs to /api/webhook/hamsa with the matching Bearer secret, call.ended enabled, and the required outcomeResult fields."],
              ["D9: smoke test", "A public call.started request returns 200 and appears in /phone."],
              ["D10: real call", "A completed Hamsa call shows link_minted and Party A/Party B SMS entries."],
              ["D11: complete flow", "Both generated links submit and the dashboard reaches complete or expected escalation."],
              ["D12 - D13: rehearse", "Decide simulated vs real Twilio SMS, rehearse fully, then reset local demo data."],
          ], [4.1*cm, 12.2*cm]), Spacer(1, 0.4*cm),
          p("Minimum Hamsa fields", "H2x"),
          p("full_name, mobile, plate_number, declared_role, injuries, and other_party_mobile. If fields do not prefill, inspect ignoredKeys and compare the actual payload with docs/hamsa.md."), PageBreak()]

story += [p("5. Productionization roadmap", "H1x"),
          p("Do not proceed to real customer use until the P0 work below is complete."),
          tbl(["Priority", "Required outcome"], [
              ["P0", "Privacy/threat model, production auth, managed secrets, managed encrypted data, verified webhook/replay defenses, observability, real integrations, and CI test suite."],
              ["P1", "Reliable SMS, supportable link lifecycle, Arabic/RTL accessibility QA, human review operation, retention automation, and deployment pipeline."],
              ["P2", "Complex multi-party cases, governed photo analysis, operational reporting, and load/resilience testing."],
          ], [2.0*cm, 14.3*cm]), Spacer(1, 0.4*cm), p("Recommended first two weeks", "H2x")] + bullets([
              "Name technical, product, security/privacy, and Hamsa-integration owners.",
              "Complete privacy/threat modeling and confirm Hamsa authentication first.",
              "Stand up managed secrets, database, and observability in staging.",
              "Use the simulator payload as the first automated webhook regression fixture.",
          ]) + [p("The full backlog and acceptance criteria are in docs/task-list.md.", "Smallx"), PageBreak()]

story += [p("6. Documentation control", "H1x"),
          p("Markdown under docs/ is the editable master and Git history is the version record. This PDF is regenerated for stakeholders who need a portable, offline snapshot."),
          tbl(["Source document", "Purpose"], [
              ["docs/run-local-hamsa.md", "Setup, ngrok, Hamsa, smoke test, demo, and troubleshooting."],
              ["docs/flow.md", "Architecture, lifecycle diagrams, safety boundaries, and operational surfaces."],
              ["docs/admin-operations.md", "Access, secrets, routine operations, incidents, and release checks."],
              ["docs/task-list.md", "POC-to-production backlog and sequence."],
              ["docs/README.md", "Catalog, ownership, review cadence, and update process."],
          ], [5.1*cm, 11.2*cm]), Spacer(1, 0.5*cm), p("Regenerate: npm run docs:pdf", "H2x"),
          p("Before merging, inspect output/pdf/najm-poc-handoff.pdf and run npm run typecheck. Commit the generated PDF with its source Markdown changes.")]

doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=1.7*cm, rightMargin=1.7*cm, topMargin=1.6*cm, bottomMargin=1.8*cm, title="Najm POC handoff")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
