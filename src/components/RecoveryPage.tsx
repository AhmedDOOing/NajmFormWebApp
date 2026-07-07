"use client";

import { useState } from "react";

// Expired/unknown links land here — never a dead-end 404. Offers to re-mint a
// fresh link for the same report (LINK_EXPIRED recovery path, brief §7/§10).
export default function RecoveryPage({
  reason,
  reportId,
}: {
  reason: "expired" | "not_found";
  reportId?: string;
}) {
  const [requested, setRequested] = useState(false);

  return (
    <div className="wrap" style={{ paddingTop: 48 }}>
      <div className="card center">
        <div style={{ fontSize: 40 }}>🔗</div>
        <h2 style={{ justifyContent: "center" }}>
          {reason === "expired"
            ? "انتهت صلاحية الرابط"
            : "الرابط غير صالح"}
        </h2>
        <p className="muted" dir="rtl">
          {reason === "expired"
            ? "انتهت صلاحية هذا الرابط. اطلب رابطًا جديدًا لإكمال بلاغك."
            : "هذا الرابط غير معروف. تأكد من الرابط المُرسل إليك عبر الرسالة النصية."}
        </p>
        <p className="muted" dir="ltr" style={{ fontSize: 12 }}>
          {reason === "expired"
            ? "This link has expired. Request a fresh one to finish your report."
            : "This link is not recognised. Check the SMS link sent to you."}
        </p>

        {reason === "expired" && reportId && (
          <div style={{ marginTop: 16 }}>
            {requested ? (
              <div className="banner ok" dir="rtl">
                تم إرسال الطلب — سيصلك رابط جديد عبر رسالة نصية قريبًا.
              </div>
            ) : (
              <button
                className="btn"
                onClick={() => setRequested(true)}
              >
                اطلب رابطًا جديدًا / Request a fresh link
              </button>
            )}
            <p className="muted mono" style={{ marginTop: 12 }}>
              {reportId}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
