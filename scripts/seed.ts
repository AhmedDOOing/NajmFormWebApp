// Seeds one demo report + its two party links. Run: npm run seed
import { createSession } from "../src/lib/session";

const result = createSession({
  ttl: 24 * 60 * 60 * 1000,
  // Party A's registered details (any prefill).
  causer: {
    vehicle: { nationality: "سعودية · Saudi", number: "1234", registrationType: "PRIVATE" },
    driver: {
      identityType: "الهوية الوطنية · National ID",
      identityNumber: "1023456789",
      fullName: "محمد عبدالله القحطاني",
      mobile: "0551234567",
      email: "mohammed@example.com",
    },
  },
});

console.log("Seeded report:", result.reportId);
console.log("  Party A link:", result.partyA.url);
console.log("  Party B link:", result.partyB.url);
console.log("  Dashboard: /dashboard/" + result.reportId);
console.log("\nEither party can start; each fills only their own section.");
console.log("Note: start the server (npm run dev) before opening these links.");
