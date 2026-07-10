"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Activity,
  Bot,
  Link2,
  MessageSquareText,
  PhoneCall,
  Radio,
  Send,
  Smartphone,
  Sparkles,
} from "lucide-react";

// ---------------------------------------------------------------------------
// /phone — live demo simulator. Left: the webhook/action feed as it happens.
// Right: one phone mockup per destination number, each SMS as a bubble with a
// tappable link (that's the demo moment — "receive" the SMS, open the flow).
// Cursor-polls GET /api/feed every 2s, same pattern as the dashboard.
// ---------------------------------------------------------------------------

interface FeedEvent {
  id: number;
  kind: "webhook" | "action";
  callId: string | null;
  eventType: string | null;
  reportId: string | null;
  summary: string;
  payload: unknown;
  at: string;
}

interface Sms {
  id: number;
  reportId: string | null;
  toParty: "A" | "B";
  toNumber: string;
  body: string;
  linkUrl: string | null;
  provider: "simulated" | "twilio";
  status: string;
  error: string | null;
  at: string;
}

const EVENT_STYLE: Record<string, { icon: typeof Radio; tone: string; label: string }> = {
  "call.started": { icon: PhoneCall, tone: "text-sky-400 border-sky-500/40", label: "call" },
  "call.answered": { icon: PhoneCall, tone: "text-sky-400 border-sky-500/40", label: "call" },
  "transcription.update": { icon: Bot, tone: "text-muted-foreground border-border", label: "transcript" },
  "tool.executed": { icon: Sparkles, tone: "text-violet-400 border-violet-500/40", label: "tool" },
  "call.ended": { icon: PhoneCall, tone: "text-amber-400 border-amber-500/40", label: "call ended" },
  link_minted: { icon: Link2, tone: "text-primary border-primary/50", label: "action" },
  sms_partyA: { icon: Send, tone: "text-primary border-primary/50", label: "sms" },
  sms_partyB: { icon: Send, tone: "text-primary border-primary/50", label: "sms" },
  party_submitted: { icon: Activity, tone: "text-primary border-primary/50", label: "action" },
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function PhoneSimClient() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [sms, setSms] = useState<Sms[]>([]);
  const cursors = useRef({ events: 0, sms: 0 });
  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const res = await fetch(
          `/api/feed?events=${cursors.current.events}&sms=${cursors.current.sms}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const j = (await res.json()) as {
          events: FeedEvent[];
          sms: Sms[];
          cursors: { events: number; sms: number };
        };
        if (stop) return;
        cursors.current = j.cursors;
        if (j.events.length) setEvents((p) => [...p, ...j.events]);
        if (j.sms.length) setSms((p) => [...p, ...j.sms]);
      } catch {
        /* poll again */
      }
    }
    void poll();
    const id = setInterval(poll, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  // Auto-scroll the feed as new events land.
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [events.length]);

  // One phone frame per destination number, newest number last.
  const phones = [...new Map(sms.map((m) => [m.toNumber, m])).keys()];

  return (
    // Ops/demo page — English LTR regardless of the app's RTL root (bubbles
    // themselves stay dir="auto" so Arabic SMS text renders correctly).
    <main dir="ltr" className="mx-auto flex min-h-[100dvh] max-w-7xl flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Hamsa webhook · live demo
          </h1>
          <p className="text-sm text-muted-foreground">
            Incoming call events → minted links → SMS delivery, as it happens.
            Fire one with <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run simulate:call</code>
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 border-primary/50 text-primary">
          <Radio className="size-3 animate-pulse" /> polling /api/feed
        </Badge>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ------------------------------------------------ feed panel */}
        <Card className="flex max-h-[80dvh] flex-col overflow-hidden">
          <CardHeader className="flex-row items-center gap-2 space-y-0 border-b border-border pb-3">
            <Activity className="size-4 text-primary" />
            <span className="font-semibold">Webhook & action feed</span>
            <Badge variant="secondary" className="ms-auto">{events.length}</Badge>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            {events.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Radio className="size-6 opacity-40" />
                Waiting for the first webhook…
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {events.map((e) => {
                  const style = EVENT_STYLE[e.eventType ?? ""] ?? {
                    icon: Radio,
                    tone: "text-muted-foreground border-border",
                    label: e.kind,
                  };
                  const Icon = style.icon;
                  const payload = e.payload as { url?: string; status?: string; error?: string };
                  return (
                    <li key={e.id} className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`gap-1 text-[10px] ${style.tone}`}>
                          <Icon className="size-3" /> {e.eventType ?? style.label}
                        </Badge>
                        <span className="ms-auto font-mono text-[10px] text-muted-foreground">
                          {timeOf(e.at)}
                        </span>
                      </div>
                      <p className="mt-1.5 leading-snug">{e.summary}</p>
                      {payload?.url && (
                        <a
                          href={payload.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block truncate font-mono text-xs text-primary hover:underline"
                        >
                          {payload.url}
                        </a>
                      )}
                      {payload?.error && (
                        <p className="mt-1 text-xs text-destructive">{payload.error}</p>
                      )}
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                          raw payload
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-muted/50 p-2 font-mono text-[10px] leading-relaxed">
                          {JSON.stringify(e.payload, null, 2)}
                        </pre>
                      </details>
                    </li>
                  );
                })}
                <div ref={feedEndRef} />
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------ phone frames */}
        <div className="flex flex-wrap items-start justify-center gap-6">
          {phones.length === 0 ? (
            <Card className="w-full">
              <CardContent className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="size-6 opacity-40" />
                Phones appear here when the first SMS is sent
              </CardContent>
            </Card>
          ) : (
            phones.map((number) => (
              <PhoneFrame
                key={number}
                number={number}
                messages={sms.filter((m) => m.toNumber === number)}
              />
            ))
          )}
        </div>
      </div>
    </main>
  );
}

function PhoneFrame({ number, messages }: { number: string; messages: Sms[] }) {
  const party = messages[messages.length - 1]?.toParty ?? "A";
  const label =
    party === "A" ? "هاتف الطرف الأول · Party A" : "هاتف الطرف الثاني · Party B";
  const bodyEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  return (
    <div className="w-[300px] shrink-0">
      {/* device shell */}
      <div className="rounded-[2.2rem] border border-border bg-black/40 p-2.5 shadow-2xl">
        <div className="flex h-[540px] flex-col overflow-hidden rounded-[1.8rem] border border-border/60 bg-background">
          {/* status bar + contact header, Messages-app style */}
          <div className="border-b border-border bg-card/80 px-4 pb-3 pt-3 text-center backdrop-blur">
            <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-muted" />
            <div className="mx-auto flex size-9 items-center justify-center rounded-full bg-primary/15">
              <MessageSquareText className="size-4 text-primary" />
            </div>
            <div className="mt-1 text-xs font-semibold">نجم · Najm</div>
            <div className="font-mono text-[10px] text-muted-foreground">{number}</div>
          </div>

          {/* messages */}
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
            {messages.map((m) => (
              <SmsBubble key={m.id} sms={m} />
            ))}
            <div ref={bodyEndRef} />
          </div>
        </div>
      </div>
      <div className="mt-2 text-center text-xs font-medium text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function SmsBubble({ sms }: { sms: Sms }) {
  // The link is rendered as its own tappable line (target=_blank → the real
  // /r/<slug> flow). Strip it from the body text so it isn't shown twice.
  const text = sms.linkUrl ? sms.body.replace(sms.linkUrl, "").trimEnd() : sms.body;
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-card px-3 py-2 shadow-sm">
        <p dir="auto" className="whitespace-pre-line text-[13px] leading-relaxed">
          {text}
        </p>
        {sms.linkUrl && (
          <a
            href={sms.linkUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 block break-all text-[12px] font-medium text-primary underline underline-offset-2"
          >
            {sms.linkUrl}
          </a>
        )}
      </div>
      <div className="flex items-center gap-1.5 ps-1 text-[10px] text-muted-foreground">
        {timeOf(sms.at)}
        <Badge
          variant="outline"
          className={`px-1 py-0 text-[9px] ${
            sms.status === "failed"
              ? "border-destructive/50 text-destructive"
              : sms.provider === "twilio"
              ? "border-sky-500/50 text-sky-400"
              : "border-border text-muted-foreground"
          }`}
        >
          {sms.provider === "simulated" ? "simulated" : `twilio · ${sms.status}`}
        </Badge>
      </div>
    </div>
  );
}
