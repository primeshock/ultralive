"use client";

import { useState } from "react";
import { BarChart3, Image as ImageIcon, KeyRound, Link2, Radio } from "lucide-react";
import { api } from "@/lib/api";
import { AccessPanel, CopyField, Pop, RailButton, tile, usePop, useDock } from "./rail";

/**
 * Host tool rail for the studio room — the same kind of rail as the desktop room, holding what the old
 * "کنترل کلاس" block under the player used to hold: poll, broadcast (OBS key + cover image) and access links.
 */
export function StudioRail({ channel, info, pollOpen, onPoll, onChannelPatch, flash }) {
  const [open, toggle, close] = usePop();
  const dock = useDock();
  const [ingress, setIngress] = useState(null);
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
          <AccessPanel channel={channel} showViewerCount={info.showViewerCount} viewerCount={info.viewerCount} onViewerCount={(v) => onChannelPatch({ showViewerCount: v })} flash={flash} />
        </Pop>
      )}
    </nav>
  );
}
