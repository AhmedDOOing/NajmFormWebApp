import { NextRequest, NextResponse } from "next/server";
import { getFeedSince, getSmsSince } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/feed?events=<id>&sms=<id> — cursor-polled by the /phone simulator.
// Returns feed events + SMS rows newer than the given cursors, plus the new
// cursors. Payload JSON strings are parsed server-side so the client stays dumb.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const eventsSince = Number(sp.get("events")) || 0;
  const smsSince = Number(sp.get("sms")) || 0;

  const events = getFeedSince(eventsSince).map((e) => ({
    ...e,
    payload: JSON.parse(e.payload) as unknown,
  }));
  const sms = getSmsSince(smsSince);

  return NextResponse.json({
    events,
    sms,
    cursors: {
      events: events.length ? events[events.length - 1].id : eventsSince,
      sms: sms.length ? sms[sms.length - 1].id : smsSince,
    },
  });
}
