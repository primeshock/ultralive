"use client";

import { useEffect } from "react";

// The root layout itself is outside app/error.js. This final boundary prevents
// a client-side exception from showing Next's opaque "Reload / Back" screen.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("[Koosha Live] unrecoverable app error", error);
  }, [error]);

  return (
    <html lang="fa" dir="rtl">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "sans-serif", background: "#f8fafc", color: "#0f172a" }}>
        <main style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
          <h1>مشکلی در پنل پیش آمد</h1>
          <p>داده‌ای حذف نشده است. می‌توانید دوباره تلاش کنید یا به صفحهٔ اصلی برگردید.</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
            <button type="button" onClick={reset}>تلاش دوباره</button>
            <form action="/"><button type="submit">صفحهٔ اصلی</button></form>
          </div>
        </main>
      </body>
    </html>
  );
}
