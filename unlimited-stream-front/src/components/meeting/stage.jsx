"use client";

import { useState } from "react";
import { Maximize2, Minimize2, Minus, X, ScreenShare, FileText, PenTool } from "lucide-react";
import { Tip } from "./tip";

const ICONS = { screen: ScreenShare, content: FileText, board: PenTool };

// Shows every active teaching surface (screen share / document / whiteboard). Each panel has a header
// menu: minimise (to a small chip at the bottom that restores it), maximise, and — where allowed — close.
export function Stage({ panels }) {
  const [solo, setSolo] = useState(null);
  const [mini, setMini] = useState(() => new Set());
  const ids = panels.map((p) => p.id);
  const soloId = ids.includes(solo) ? solo : null;
  const hidden = (id) => (soloId ? id !== soloId : mini.has(id));
  const shown = panels.filter((p) => !hidden(p.id));
  const main = shown[0];
  const sideCount = Math.max(0, shown.length - 1);
  const toggleMini = (id) => setMini((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const reveal = (id) => { setSolo(null); setMini((cur) => { const n = new Set(cur); n.delete(id); return n; }); };
  const iconBtn = "grid size-6 place-items-center rounded-md text-white/65 transition hover:bg-white/12 hover:text-white";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className={`grid min-h-0 flex-1 gap-2 ${sideCount ? "md:grid-cols-[minmax(0,1fr)_minmax(0,36%)]" : ""} ${sideCount > 1 ? "md:grid-rows-2" : ""}`}>
        {shown.map((p) => {
          const isMain = p === main;
          const Icon = ICONS[p.id] || FileText;
          return (
            <section key={p.id} className={`flex min-h-[220px] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-xl md:min-h-0 ${isMain ? `order-first ${sideCount > 1 ? "md:col-start-1 md:row-span-2" : ""}` : "md:col-start-2"}`}>
              <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/8 bg-white/[.04] px-3 py-1.5">
                <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-white/90"><Icon className="size-3.5 shrink-0 text-sky-300" /><span className="truncate">{p.title}</span></span>
                <span className="flex shrink-0 gap-0.5">
                  {panels.length > 1 && <Tip label="کوچک کردن"><button aria-label="کوچک کردن" onClick={() => toggleMini(p.id)} className={iconBtn}><Minus className="size-3.5" /></button></Tip>}
                  {panels.length > 1 && <Tip label={soloId === p.id ? "بازگشت به حالت عادی" : "بزرگ کردن"}><button aria-label="بزرگ کردن" onClick={() => setSolo(soloId === p.id ? null : p.id)} className={iconBtn}>{soloId === p.id ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</button></Tip>}
                  {p.onClose && <Tip label={p.closeLabel || "بستن"}><button aria-label="بستن" onClick={p.onClose} className={`${iconBtn} hover:!bg-rose-500/80`}><X className="size-3.5" /></button></Tip>}
                </span>
              </header>
              <div className="relative min-h-0 flex-1">{p.node}</div>
            </section>
          );
        })}
      </div>
      {(soloId || mini.size > 0) && panels.some((p) => hidden(p.id)) && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {panels.filter((p) => hidden(p.id)).map((p) => { const Icon = ICONS[p.id] || FileText; return (
            <button key={p.id} onClick={() => reveal(p.id)} title="بازگرداندن" className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[11px] text-white/85 transition hover:bg-white/16"><Icon className="size-3 text-sky-300" /><span className="max-w-[140px] truncate">{p.title}</span></button>
          ); })}
        </div>
      )}
    </div>
  );
}
