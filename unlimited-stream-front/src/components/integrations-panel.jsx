"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Webhook, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

const EVENT_LABELS = { "class.started": "شروع کلاس", "class.ended": "پایان کلاس", "student.joined": "ورود دانش‌آموز", "student.left": "خروج دانش‌آموز", "recording.ready": "آماده شدن ضبط" };

// API keys for the main website + signed outgoing webhooks.
export function IntegrationsPanel() {
  const [data, setData] = useState({ keys: [], webhooks: [], events: [] });
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState([]);
  const [secret, setSecret] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.integrations().then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn) => { setError(""); try { await fn(); await load(); } catch (e) { setError(e.message); } };
  const toggleEvent = (e) => setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4" />کلید API (برای سایت اصلی)</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs leading-6 text-muted-foreground">سایت شما با هدر <code dir="ltr">X-API-Key</code> می‌تواند فهرست کلاس‌ها، لینک ورود دانش‌آموز (<code dir="ltr">POST /api/v1/classes/:slug/join-link</code>) و حضور و غیاب را بگیرد.</p>
          <div className="flex gap-2"><Input placeholder="نام کلید (مثلاً سایت اصلی)" value={name} onChange={(e) => setName(e.target.value)} /><Button disabled={!name.trim()} onClick={() => run(async () => { const k = await api.createApiKey(name.trim()); setSecret(k.key); setName(""); })}>ساخت</Button></div>
          {secret && <div className="space-y-1 rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-xs dark:bg-amber-950/30"><p>این کلید فقط یک‌بار نمایش داده می‌شود:</p><div className="flex items-center gap-2"><code className="break-all" dir="ltr">{secret}</code><Button size="icon" variant="ghost" onClick={() => navigator.clipboard?.writeText(secret)}><Copy className="size-4" /></Button></div></div>}
          {data.keys.map((k) => <div key={k._id} className="flex items-center justify-between rounded-lg border p-2.5 text-xs"><span><b>{k.name}</b> <span className="font-mono text-muted-foreground" dir="ltr">{k.prefix}…</span></span><Button size="icon" variant="ghost" className="text-destructive" onClick={() => run(() => api.deleteApiKey(k._id))}><Trash2 className="size-4" /></Button></div>)}
          {data.keys.length === 0 && <p className="text-xs text-muted-foreground">کلیدی ساخته نشده است.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Webhook className="size-4" />وب‌هوک</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Input dir="ltr" placeholder="https://your-site.com/hooks/ultralive" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="flex flex-wrap gap-3 text-xs">{data.events.map((ev) => <label key={ev} className="flex items-center gap-1.5"><input type="checkbox" checked={events.includes(ev)} onChange={() => toggleEvent(ev)} />{EVENT_LABELS[ev] || ev}</label>)}</div>
          <p className="text-[11px] text-muted-foreground">اگر هیچ رویدادی انتخاب نشود، همهٔ رویدادها ارسال می‌شود. امضا: HMAC-SHA256 در هدر <code dir="ltr">X-UltraLive-Signature</code>.</p>
          <Button disabled={!url.trim()} onClick={() => run(async () => { const w = await api.createWebhook({ url: url.trim(), events }); setSecret(`secret: ${w.secret}`); setUrl(""); setEvents([]); })}>افزودن وب‌هوک</Button>
          {data.webhooks.map((w) => <div key={w._id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs"><span className="min-w-0"><span className="block truncate font-mono" dir="ltr">{w.url}</span><span className="text-muted-foreground">{w.lastStatus === null ? "هنوز ارسالی نشده" : `آخرین وضعیت: ${w.lastStatus || "خطا"}`}</span></span><Button size="icon" variant="ghost" className="text-destructive" onClick={() => run(() => api.deleteWebhook(w._id))}><Trash2 className="size-4" /></Button></div>)}
        </CardContent>
      </Card>
      {error && <p role="alert" className="text-sm text-destructive xl:col-span-2">{error}</p>}
    </div>
  );
}
