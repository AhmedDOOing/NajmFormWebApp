import PhoneSimClient from "./PhoneSimClient";

export const dynamic = "force-dynamic";

// Live demo surface: incoming Hamsa webhooks + the actions the server took on
// the left; per-number phone mockups receiving the SMS (with tappable links)
// on the right. Poll-driven — open it before firing `npm run simulate:call`.
export default function PhonePage() {
  return <PhoneSimClient />;
}
