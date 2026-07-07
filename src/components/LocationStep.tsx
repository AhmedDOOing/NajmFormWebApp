"use client";

import { useState } from "react";
import type { Lang, Dict } from "@/lib/i18n";

export interface LocationValue {
  lat?: number;
  lng?: number;
  accuracy?: number;
  locationLabel?: string;
  locationSource?: "gps" | "manual";
  locationManual?: boolean;
  city?: string;
  district?: string;
  landmark?: string;
}

type LocPayload = {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  label: string | null;
  source: "gps" | "manual";
};

// Stub nearby places (Riyadh). Wire to reverse-geocode later.
const NEARBY = [
  { ar: "مركز المملكة", en: "Kingdom Centre", addrAr: "العليا، الرياض", addrEn: "Al Olaya, Riyadh", lat: 24.7114, lng: 46.6745 },
  { ar: "طريق الملك فهد", en: "King Fahd Road", addrAr: "الرياض", addrEn: "Riyadh", lat: 24.6987, lng: 46.6853 },
  { ar: "سنتريا مول", en: "Centria Mall", addrAr: "العليا، الرياض", addrEn: "Al Olaya, Riyadh", lat: 24.6935, lng: 46.6857 },
  { ar: "مستشفى المملكة", en: "Kingdom Hospital", addrAr: "الرياض", addrEn: "Riyadh", lat: 24.7205, lng: 46.6699 },
];

// Abstract dark "map" drawn as SVG — always renders (no network/tiles needed).
// Swap for react-leaflet + a dark tile provider (CARTO dark_all / Mapbox dark)
// when a tile source is configured; keep this as the offline fallback.
function MapArt() {
  const line = { stroke: "var(--line)", fill: "none" as const };
  return (
    <svg viewBox="0 0 300 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="300" height="240" fill="var(--surface)" />
      <rect x="18" y="20" width="80" height="56" rx="6" fill="var(--surface-2)" />
      <rect x="196" y="26" width="86" height="48" rx="6" fill="var(--surface-2)" />
      <rect x="30" y="150" width="70" height="70" rx="6" fill="var(--surface-2)" />
      <rect x="205" y="150" width="74" height="64" rx="6" fill="var(--surface-2)" />
      <path d="M-10 110 H310" style={{ ...line, strokeWidth: 12 }} />
      <path d="M150 -10 V250" style={{ ...line, strokeWidth: 10 }} />
      <path d="M-10 40 C 90 60, 180 20, 320 70" style={{ ...line, strokeWidth: 5 }} />
      <path d="M40 250 C 120 180, 160 200, 300 150" style={{ ...line, strokeWidth: 5 }} />
    </svg>
  );
}

// Green teardrop pin.
function Pin({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2c-4.4 0-8 3.5-8 7.9 0 5.4 7 11.6 7.3 11.8.4.3 1 .3 1.4 0C13 21.5 20 15.3 20 9.9 20 5.5 16.4 2 12 2z"
        fill="var(--najm)"
        stroke="#fff"
        strokeWidth="1.4"
      />
      <circle cx="12" cy="10" r="3" fill="#fff" />
    </svg>
  );
}

export default function LocationStep({
  lang,
  t,
  value,
  onSet,
  onLocation,
}: {
  lang: Lang;
  t: Dict;
  value: LocationValue;
  onSet: (key: string, value: unknown) => void;
  onLocation: (loc: LocPayload) => void;
}) {
  const confirmed = !!value.locationLabel || value.lat != null;
  const [mode, setMode] = useState<"picker" | "confirmed">(confirmed ? "confirmed" : "picker");
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [showManual, setShowManual] = useState(!!value.locationManual && !value.locationLabel);
  const [query, setQuery] = useState("");

  const myLocationLabel = lang === "ar" ? "موقعي الحالي" : "My current location";

  function apply(patch: LocationValue, loc: LocPayload) {
    Object.entries(patch).forEach(([k, v]) => onSet(k, v));
    onLocation(loc);
    setMode("confirmed");
  }

  function capture() {
    if (!navigator.geolocation) return fail();
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);
        setStatus("idle");
        apply(
          {
            lat,
            lng,
            accuracy,
            locationLabel: myLocationLabel,
            locationSource: "gps",
            locationManual: false,
          },
          { lat, lng, accuracy, label: myLocationLabel, source: "gps" }
        );
      },
      () => fail(),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function fail() {
    // GPS off / denied / indoor -> manual path (LOC_MANUAL). Never dead-end.
    setStatus("error");
    setShowManual(true);
    onSet("locationManual", true);
    onSet("locationSource", "manual");
  }

  function selectPlace(p: (typeof NEARBY)[number]) {
    const label = lang === "ar" ? p.ar : p.en;
    apply(
      {
        lat: p.lat,
        lng: p.lng,
        accuracy: undefined,
        locationLabel: label,
        locationSource: "gps",
        locationManual: false,
      },
      { lat: p.lat, lng: p.lng, accuracy: null, label, source: "gps" }
    );
  }

  function confirmManual() {
    const label =
      [value.district, value.city].filter(Boolean).join(lang === "ar" ? "، " : ", ") ||
      value.landmark ||
      (lang === "ar" ? "موقع يدوي" : "Manual location");
    apply(
      { locationLabel: label, locationSource: "manual", locationManual: true },
      { lat: null, lng: null, accuracy: null, label, source: "manual" }
    );
  }

  // ---- confirmed (WhatsApp-style shared pin) ------------------------------
  if (mode === "confirmed") {
    const addr =
      [value.district, value.city].filter(Boolean).join(lang === "ar" ? "، " : ", ") ||
      (value.locationSource === "gps" ? (lang === "ar" ? "موقع GPS" : "GPS location") : "");
    return (
      <>
        <div className="loc-card">
          <div className="map-canvas thumb">
            <MapArt />
            <div className="map-pin">
              <Pin size={44} />
            </div>
          </div>
          <div className="lc-body">
            <div className="lc-name">{value.locationLabel || myLocationLabel}</div>
            {addr && <div className="lc-addr">{addr}</div>}
            {value.lat != null && value.lng != null && (
              <div className="lc-coord">
                {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
                {value.accuracy != null &&
                  (lang === "ar" ? ` · دقة ±${value.accuracy} م` : ` · ±${value.accuracy}m`)}
              </div>
            )}
            <div className="lc-ok">✓ {t.locationCaptured}</div>
          </div>
        </div>
        <button className="loc-change" onClick={() => { setMode("picker"); setStatus("idle"); }}>
          {t.changeLocation}
        </button>
      </>
    );
  }

  // ---- picker -------------------------------------------------------------
  const accSub =
    value.accuracy != null
      ? lang === "ar"
        ? `دقة ±${value.accuracy} م`
        : `Accurate to ${value.accuracy}m`
      : "GPS";

  return (
    <>
      <div className="loc-search">
        <span className="s-ico">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaces}
          aria-label={t.searchPlaces}
        />
      </div>

      <div className="map-canvas picker">
        <MapArt />
        <div className="loc-dot">
          <span className="halo" />
          <span className="core" />
        </div>
        <button className="recenter" onClick={capture} aria-label={t.recenter}>
          ◎
        </button>
      </div>

      <button className="send-loc" onClick={capture}>
        <span className="s-ico2">📍</span>
        <span>
          <div className="s-main">
            {status === "locating" ? t.locating2 : t.sendCurrentLocation}
          </div>
          <div className="s-sub">{accSub}</div>
        </span>
      </button>

      {showManual ? (
        <div>
          <div className="nearby-h">{t.manualTitle}</div>
          {status === "error" && <p className="muted">{t.locationFailed}</p>}
          <div className="field">
            <label>{t.city}</label>
            <input value={value.city ?? ""} onChange={(e) => onSet("city", e.target.value)} />
          </div>
          <div className="field">
            <label>{t.district}</label>
            <input value={value.district ?? ""} onChange={(e) => onSet("district", e.target.value)} />
          </div>
          <div className="field">
            <label>{t.landmark}</label>
            <input value={value.landmark ?? ""} onChange={(e) => onSet("landmark", e.target.value)} />
          </div>
          <button
            className="btn-primary wide"
            disabled={!value.city && !value.district && !value.landmark}
            onClick={confirmManual}
          >
            {t.confirmCorrect}
          </button>
        </div>
      ) : (
        <>
          <div className="nearby-h">{t.nearbyPlaces}</div>
          {NEARBY.map((p) => (
            <button key={p.en} className="place-row" onClick={() => selectPlace(p)}>
              <span className="p-pin">📍</span>
              <span>
                <div className="p-name">{lang === "ar" ? p.ar : p.en}</div>
                <div className="p-addr">{lang === "ar" ? p.addrAr : p.addrEn}</div>
              </span>
            </button>
          ))}
        </>
      )}
    </>
  );
}
