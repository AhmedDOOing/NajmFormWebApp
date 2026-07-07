import { computeFlags, routeOutcome } from "../src/lib/flags";

let pass = 0, fail = 0;
function check(name: string, payload: any, expectFlag: string, expectRoute: string) {
  const flags = computeFlags(payload, new Date("2026-07-06T12:00:00Z"));
  const route = routeOutcome(flags);
  const ok = flags.includes(expectFlag as any) && route === expectRoute;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(20)} flags=[${flags.join(",")}] route=${route}`);
  ok ? pass++ : fail++;
}

check("INJURY", { injuries: true }, "INJURY", "EMERGENCY");
check("HIT_AND_RUN", { otherPartyStatus: "fled" }, "HIT_AND_RUN", "POLICE_REPORT");
check("PARKED_HIT", { otherPartyStatus: "parked" }, "PARKED_HIT", "POLICE_REPORT");
check("UNINSURED", { insuranceStatus: "expired" }, "UNINSURED", "POLICE_REPORT");
check("REG_VIOLATION", { registrationStatus: "expired" }, "REG_VIOLATION", "MANUAL_REVIEW");
check("LICENCE_INVALID", { licenceExpiry: "2020-01-01" }, "LICENCE_INVALID", "MANUAL_REVIEW");
check("OWNER_MISMATCH", { notOwner: true }, "OWNER_MISMATCH", "MANUAL_REVIEW");
check("SPECIAL_VEHICLE", { vehicleType: "rental" }, "SPECIAL_VEHICLE", "MANUAL_REVIEW");
check("MULTI_VEHICLE", { vehiclesInvolved: 3 }, "MULTI_VEHICLE", "MANUAL_REVIEW");
check("SINGLE_VEHICLE", { otherPartyStatus: "none" }, "SINGLE_VEHICLE", "AUTOMATIC");
check("PARTY_B_UNVERIFIED", { identityVerified: false }, "PARTY_B_UNVERIFIED", "MANUAL_REVIEW");
check("LOC_MANUAL", { locationManual: true }, "LOC_MANUAL", "AUTOMATIC");
check("PHOTO_PENDING", { photosPending: true }, "PHOTO_PENDING", "AUTOMATIC");
// precedence: injury overrides hit-and-run
check("PRECEDENCE", { injuries: true, otherPartyStatus: "fled" }, "INJURY", "EMERGENCY");
// clean submit -> no flags, automatic
{
  const flags = computeFlags({ insuranceStatus: "valid", otherPartyStatus: "present" } as any, new Date("2026-07-06T12:00:00Z"));
  const ok = flags.length === 0 && routeOutcome(flags) === "AUTOMATIC";
  console.log(`${ok ? "PASS" : "FAIL"}  ${"CLEAN".padEnd(20)} flags=[${flags.join(",")}] route=${routeOutcome(flags)}`);
  ok ? pass++ : fail++;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
