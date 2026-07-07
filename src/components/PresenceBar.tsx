"use client";

import type { PresenceState } from "@/lib/socketContract";
import type { Party, Presence } from "@/lib/types";
import { dict, type Lang } from "@/lib/i18n";

const key: Record<Presence, keyof (typeof dict)["en"]> = {
  connected: "p_connected",
  filling: "p_filling",
  submitted: "p_submitted",
  absent: "p_absent",
};

// Live status of both parties (brief §6). "You" is highlighted; the other
// party's dot/label update in real time over the socket.
export default function PresenceBar({
  presence,
  party,
  lang,
  timedOut,
}: {
  presence: PresenceState;
  party: Party;
  lang: Lang;
  timedOut: boolean;
}) {
  const t = dict[lang];
  const other: Party = party === "A" ? "B" : "A";

  const cell = (who: string, p: Presence, isYou: boolean) => (
    <div className="pill">
      <span className="who">
        {who} {isYou ? `(${t.you})` : ""}
      </span>
      <span>
        <span className={`dot ${p}`} />
        {p === "absent" && !isYou && other === "B" && timedOut
          ? t.p_absent
          : t[key[p]]}
      </span>
    </div>
  );

  return (
    <div className="presence" aria-label={t.presenceTitle}>
      {cell(`${t.party} ${party}`, presence[party], true)}
      {cell(`${t.party} ${other}`, presence[other], false)}
    </div>
  );
}
