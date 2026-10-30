"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Upload, RefreshCw, ShieldAlert, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, API_URL } from "@/lib/api";

// Owner: server backup / restore (move to a new server) and one-click update.
export function SystemPanel() {
  const [version, setVersion] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState("");
  const file = useRef(null);

  const loadVersion = useCallback(() => api.systemVersion().then(setVersion).catch((e) => setError(e.message)), []);
  useEffect(() => { loadVersion(); }, [loadVersion]);
  useEffect(() => {
    if (status?.state !== "running") return undefined;
    const id = setInterval(() => api.systemUpdateStatus().then((s) => { setStatus(s); if (s.state !== "running") loadVersion(); }).catch(() => {}), 3000);
    return () => clearInterval(id);
  }, [status?.state, loadVersion]);

  async function startUpdate() {
    setError("");
    try { await api.systemUpdate(); setStatus({ state: "running", log: "" }); } catch (e) { setError(e.message); }
  }
  async function restore() {
    const f = file.current?.files?.[0];
    if (!f) { setError("فایل بکاپ را انتخاب کنید."); return; }
    setRestoring(true); setError(""); setRestoreResult("");
    try {
      const form = new FormData(); form.append("backup", f); form.append("confirm", confirm);
      const res = await fetch(`${API_URL}/api/system/restore`, { method: "POST", credentials: "include", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "بازیابی انجام نشد.");
      setRestoreResult(`بازیابی کامل شد (${Object.values(data.restored || {}).reduce((a, b) => a + b, 0)} رکورد). ${data.note || ""}`);
    } catch (e) { setError(e.message); } finally { setRestoring(false); }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><RefreshCw className="size-4" />به‌روزرسانی پنل</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!version ? <p className="text-muted-foreground">در حال بررسی...</p> : !version.available ? <p className="text-muted-foreground">{version.reason || "به‌روزرسانی در دسترس نیست."}</p> : (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg border p-3"><p className="text-muted-foreground">نسخهٔ فعلی</p><p className="mt-1 font-mono" dir="ltr">{version.current}</p></div><div className="rounded-lg border p-3"><p className="text-muted-foreground">آخرین نسخه ({version.branch})</p><p className="mt-1 font-mono" dir="ltr">{version.latest}</p></div></div>
              {version.behind > 0 ? <div className="space-y-2"><p className="font-medium text-amber-600">{version.behind} تغییر جدید موجود است:</p><ul className="max-h-32 list-disc space-y-1 overflow-y-auto pr-5 text-xs text-muted-foreground">{version.changes.map((c) => <li key={c}>{c}</li>)}</ul></div> : <p className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="size-4" />پنل به‌روز است.</p>}
              <p className="text-xs text-muted-foreground">پیش از هر به‌روزرسانی، بکاپ خودکار گرفته می‌شود. نسخهٔ جدید در پوشهٔ جدا ساخته می‌شود و در صورت خطا نسخهٔ قبلی برمی‌گردد؛ سایت در حین ساخت در دسترس می‌ماند.</p>
              <Button onClick={startUpdate} disabled={!version.enabled || status?.state === "running" || version.behind === 0}>{status?.state === "running" ? <><Loader2 className="size-4 animate-spin" /> در حال به‌روزرسانی...</> : "به‌روزرسانی اکنون"}</Button>
              {!version.enabled && <p className="text-xs text-destructive">ALLOW_PANEL_UPDATE روی این سرور فعال نیست.</p>}
            </>
          )}
          {status && <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-5" dir="ltr">{status.log || status.message}</pre>}
          {status?.state === "done" && <p className="text-emerald-600">{status.message} صفحه را یک‌بار تازه کنید.</p>}
          {status?.state === "failed" && <p className="text-destructive">{status.message}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Download className="size-4" />بکاپ و جابه‌جایی سرور</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-xs leading-6 text-muted-foreground">بکاپ شامل همهٔ دیتابیس (سازمان‌ها، کلاس‌ها، دانش‌آموزان، حضور و غیاب، چت) و فایل‌های بارگذاری‌شده است. برای عوض کردن سرور: روی سرور جدید نصب کنید، بکاپ را اینجا بازیابی کنید.</p>
          <Button variant="outline" onClick={() => { window.location.href = `${API_URL}/api/system/backup`; }}><Download className="size-4" /> دانلود بکاپ کامل</Button>
          <div className="space-y-2 rounded-xl border border-destructive/40 p-3">
            <p className="flex items-center gap-2 font-medium text-destructive"><ShieldAlert className="size-4" />بازیابی (جایگزین همهٔ داده‌های فعلی)</p>
            <input ref={file} type="file" accept=".gz,.tar.gz,application/gzip" className="block w-full text-xs" />
            <Input dir="ltr" placeholder='برای تأیید بنویسید: RESTORE' value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <Button variant="destructive" disabled={confirm !== "RESTORE" || restoring} onClick={restore}>{restoring ? <><Loader2 className="size-4 animate-spin" /> در حال بازیابی...</> : <><Upload className="size-4" /> بازیابی بکاپ</>}</Button>
          </div>
          {restoreResult && <p className="text-emerald-600">{restoreResult}</p>}
        </CardContent>
      </Card>
      {error && <p role="alert" className="text-sm text-destructive xl:col-span-2">{error}</p>}
    </div>
  );
}
