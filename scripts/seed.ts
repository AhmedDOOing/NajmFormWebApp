// Seeds one demo report + the causer's filing link. Run: npm run seed
import { createSession } from "../src/lib/session";

const result = createSession({
  ttl: 24 * 60 * 60 * 1000,
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
console.log("  Causer link:", result.causer.url);
console.log("  Dashboard: /dashboard/" + result.reportId);
console.log(
  "\nAdd an affected party in the form via lookup — seeded records:\n" +
    "  vehicle 4821 + id 2098765432, or vehicle 7391 + id 1122334455"
);
console.log("\nNote: start the server (npm run dev) before opening these links.");
