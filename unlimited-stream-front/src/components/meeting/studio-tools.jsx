"use client";

import { useState } from "react";
import { BarChart3, Copy, Image as ImageIcon, KeyRound, Link2, Radio, Users } from "lucide-react";
import { api } from "@/lib/api";
import { Pop, RailButton, Toggle, usePop, useDock } from "./rail";

const tile = "rounded-lg bg-[color-mix(in_oklab,var(--s2)_55%,transparent)] px-2.5 py-2 text-xs text-[var(--ink)] transition hover:bg-[var(--s3)]";

function CopyField({ label, value }) {
  const [done, setDone] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); };
  return (
    <div className="mt-1.5">
      <p className="mb-0.5 px-1 text-[11px] text-[var(--ink-3)]">{label}</p>
      <button type="button" onClick={copy} className={`flex w-full items-center justify-between gap-2 text-left ${tile}`}>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]" dir="ltr">{value}</span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--accent-ink)]"><Copy className="size-3" />{done ? "کپی شد" : "کپی"}</span>
      </button>
    </div>
  );
}

/**
 * Host tool rail for the studio room — the same kind of rail as the desktop room, holding what the old
 * "کنترل کلاس" block under the player used to hold: poll, broadcast (OBS key + cover image) and access links.
 */
export function StudioRail({ channel, info, pollOpen, onPoll, onChannelPatch, flash }) {
  const [open, toggle, close] = usePop();
  const dock = useDock();
  const [ingress, setIngress] = useState(null);
  const [links, setLinks] = useState({ student: "", pub: "" });
  const [busy, setBusy] = useState(false);
  const guard = async (fn, ok) => { setBusy(true); try { await fn(); if (ok) flash(ok); } catch (e) { flash(e.message || "انجام نشد."); } finally { setBusy(false); } };

  return (
    <nav ref={dock} aria-label="کنترل کلاس" className="flex flex-row flex-wrap items-center gap-1 rounded-2xl border border-[var(--line)] bg-[var(--s1)] p-0.5 md:max-h-full md:w-[52px] md:flex-col md:flex-nowrap md:gap-1 md:overflow-y-auto md:overflow-x-hidden md:py-3">
      <RailButton icon={BarChart3} label="نظرسنجی" active={pollOpen} onClick={onPoll} />
      <RailButton icon={Radio} label="پخش" active={open?.id === "live"} onClick={(e) => toggle("live", e)} />
      <RailButton icon={Link2} label="دسترسی" active={open?.id === "access"} onClick={(e) => toggle("access", e)} />

      {open?.id === "live" && (
        <Pop anchor={open.rect} wide title="پخش و تصویر کلاس" onClose={close}>
          <div className="space-y-2 p-1">
            <button disabled={busy} onClick={() => guard(async () => setIngress(await api.createIngress(channel)))} className={`flex w-full items-center gap-2 ${tile}`}><KeyRound className="size-3.5 text-[var(--accent-ink)]" />دریافت آدرس و کلید OBS</button>
            {ingress && <><CopyField label="Server" value={ingress.url} /><CopyField label="Stream key" value={ingress.streamKey} /></>}
            <div className="flex items-center gap-3 rounded-lg bg-[color-mix(in_oklab,var(--s2)_55%,transparent)] p-2">
              {info.thumbnailUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={info.thumbnailUrl} alt="" className="size-12 rounded-lg object-cover" /> : <span className="grid size-12 place-items-center rounded-lg bg-[var(--s2)] text-[var(--ink-3)]"><ImageIcon className="size-5" /></span>}
              <div className="min-w-0 flex-1"><p className="text-xs font-medium">تصویر کلاس</p><p className="text-[11px] text-[var(--ink-3)]">نسبت 16:9 (مثلاً 1280×720)</p></div>
              <label className={`cursor-pointer ${tile}`}>انتخاب<input type="file" accept="image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) guard(async () => { const r = await api.uploadChannelThumbnail(channel, f); onChannelPatch({ thumbnailUrl: r.thumbnailUrl }); }, "تصویر کلاس ذخیره شد."); }} /></label>
            </div>
          </div>
        </Pop>
      )}

      {open?.id === "access" && (
        <Pop anchor={open.rect} wide title="دسترسی و نمایش" onClose={close}>
          <div className="space-y-1 p-1">
            <Toggle checked={Boolean(info.showViewerCount)} onChange={(v) => guard(async () => { await api.setViewerCount(channel, v); onChannelPatch({ showViewerCount: v }); })} label="نمایش تعداد حاضرین" />
            <p className="flex items-center gap-1.5 px-2 pb-1 text-[11px] text-[var(--ink-3)]"><Users className="size-3.5" />حاضرین فعلی: {info.viewerCount || 0}</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button disabled={busy} onClick={() => guard(async () => { await api.setClassAccess(channel, "private"); setLinks((l) => ({ ...l, pub: "" })); }, "کلاس فقط از سایت اصلی قابل ورود است.")} className={`text-center ${tile}`}>فقط سایت اصلی</button>
              <button disabled={busy} onClick={() => guard(async () => { const r = await api.setClassAccess(channel, "public"); setLinks((l) => ({ ...l, pub: r.publicUrl || "" })); }, "لینک همگانی آماده است.")} className={`text-center ${tile}`}>لینک همگانی</button>
              <button disabled={busy} onClick={() => guard(async () => { const r = await api.setClassAccess(channel, "public", true); setLinks((l) => ({ ...l, pub: r.publicUrl || "" })); }, "لینک همگانی جدید ساخته شد.")} className={`text-center ${tile}`}>لینک همگانی جدید</button>
              <button disabled={busy} onClick={() => guard(async () => { const r = await api.createTestLink(channel, "دانش‌آموز API"); setLinks((l) => ({ ...l, student: r.url })); }, "لینک موقت ساخته شد.")} className={`text-center ${tile}`}>لینک موقت API</button>
            </div>
            {links.pub && <CopyField label="لینک همگانی" value={links.pub} />}
            {links.student && <CopyField label="لینک موقت دانش‌آموز" value={links.student} />}
          </div>
        </Pop>
      )}
    </nav>
  );
}
