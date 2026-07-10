// Simulates a Hamsa voice-agent call against the local webhook — fires the
// same event sequence Hamsa would (started → answered → transcription updates
// → ended with the extracted outcome). Run with the dev server up:
//
//   npm run dev          # terminal 1
//   npm run simulate:call  # terminal 2  (watch it land on /phone)
//
// Env: NAJM_BASE_URL (default http://localhost:3000), HAMSA_WEBHOOK_SECRET.

const BASE = process.env.NAJM_BASE_URL || "http://localhost:3000";
const SECRET = process.env.HAMSA_WEBHOOK_SECRET || "";
const WEBHOOK = `${BASE}/api/webhook/hamsa`;

const callId = `call_demo_${Date.now().toString(36)}`;

const headers: Record<string, string> = { "content-type": "application/json" };
if (SECRET) headers.authorization = `Bearer ${SECRET}`;

async function post(body: object) {
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  console.log(`→ ${(body as { eventType: string }).eventType}  [${res.status}]`, JSON.stringify(j));
  return j as { url?: string; reportId?: string };
}

const envelope = (eventType: string, data?: object) => ({
  eventType,
  callId,
  timestamp: new Date().toISOString(),
  agentId: "agent_najm_demo",
  agentName: "Najm Accident Intake",
  data: { data: data ?? {} },
});

const transcript = [
  { Agent: "مرحباً، معك نجم. هل الجميع بخير؟ هل توجد إصابات؟" },
  { User: "الحمد لله لا توجد إصابات." },
  { Agent: "ممتاز. أحتاج رقم لوحة مركبتك ورقم هويتك." },
  { User: "اللوحة ١٢٣٤ والهوية ١٠٢٣٤٥٦٧٨٩." },
  { Agent: "وما رقم جوال الطرف الآخر؟" },
  { User: "جواله ٠٥٠٩٨٧٦٥٤٣." },
  { Agent: "شكراً، سأرسل لك رابط إكمال البلاغ برسالة نصية." },
];

async function main() {
  console.log(`Simulating Hamsa call ${callId} → ${WEBHOOK}\n`);

  await post(envelope("call.started"));
  await sleep(800);
  await post(envelope("call.answered"));

  for (let i = 1; i <= transcript.length; i++) {
    await sleep(900);
    await post(envelope("transcription.update", { conversationId: callId, transcription: transcript.slice(0, i) }));
  }

  await sleep(1200);
  const ended = await post(
    envelope("call.ended", {
      conversationId: callId,
      conversationRecording: "https://storage.tryhamsa.com/recordings/demo.mp3",
      transcription: transcript,
      outcomeResult: {
        // keys deliberately vary in style — the mapper is tolerant
        full_name: "محمد عبدالله القحطاني",
        national_id: "1023456789",
        causer_mobile: "+966551234567",
        plate_number: "1234",
        registration_type: "PRIVATE",
        vehicle_nationality: "السعودية · Saudi Arabia",
        identity_type: "الهوية الوطنية · National ID",
        email: "mohammed@example.com",
        injuries: "no",
        other_party_mobile: "+966509876543",
        accident_city: "الرياض · Riyadh",
        governorate: "الرياض · Riyadh",
        location: "طريق الملك فهد، مخرج ١٠",
        accident_type: "اصطدام خلفي",
      },
    })
  );

  console.log(`\n✔ Done. Causer link: ${ended.url ?? "(none)"}\n  Watch: ${BASE}/phone`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => {
  console.error("Simulation failed:", e.message ?? e);
  console.error(`Is the dev server running at ${BASE}?`);
  process.exit(1);
});
