// Seeds one demo report + two links directly (bypasses HTTP). Run: npm run seed
import { createSession } from "../src/lib/session";

const result = createSession({
  ttl: 24 * 60 * 60 * 1000,
  prefill: {
    A: {
      city: "الرياض",
      district: "العليا",
      fullName: "محمد عبدالله القحطاني",
      nationalId: "1023456789",
      nationality: "سعودي",
      mobile: "0551234567",
      licenceNo: "L8842190",
      licenceExpiry: "2027-03-01",
      plate: "أ ب ج 4821",
      makeModel: "تويوتا كامري",
      year: "2022",
      colour: "أبيض",
      vehicleType: "private",
      registrationStatus: "valid",
      insuranceStatus: "valid",
      insurer: "التعاونية",
      accidentType: "اصطدام خلفي",
      vehiclesInvolved: 2,
      description: "توقفت عند الإشارة واصطدمت بي المركبة الخلفية.",
      otherPartyStatus: "present",
      injuries: false,
      _agentFilledFields: [
        "city", "district", "fullName", "nationalId", "nationality", "mobile",
        "licenceNo", "licenceExpiry", "plate", "makeModel", "year", "colour",
        "vehicleType", "registrationStatus", "insuranceStatus", "insurer",
        "accidentType", "vehiclesInvolved", "description", "otherPartyStatus",
      ],
    },
    B: {
      mobile: "0509876543",
      _agentFilledFields: ["mobile"],
    },
  },
});

console.log("Seeded report:", result.reportId);
console.log("  Party A:", result.partyA.url);
console.log("  Party B:", result.partyB.url);
console.log("  Dashboard: /dashboard/" + result.reportId);
console.log("\nNote: start the server (npm run dev) before opening these links.");
