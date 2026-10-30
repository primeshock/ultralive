"use client";

import { useState } from "react";
import { Maximize2, Minimize2, Minus, ScreenShare, FileText, PenTool } from "lucide-react";

const ICONS = { screen: ScreenShare, content: FileText, board: PenTool };

// Shows every active teaching surface (screen share / document / whiteboard). Each panel has a header
// menu to minimise or maximise it; the layout adapts: one panel fills the stage, several split it.
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {(soloId || mini.size > 0) && (
        <div className="flex flex-wrap gap-2">
          {panels.filter((p) => hidden(p.id)).map((p) => { const Icon = ICONS[p.id] || FileText; return (
            <button key={p.id} onClick={() => reveal(p.id)} className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/8 px-3 py-1.5 text-xs text-white/85 hover:bg-white/15"><Icon className="size-3.5 text-sky-300" />{p.title}</button>
          ); })}
        </div>
      )}
      <div className={`grid min-h-0 flex-1 gap-2 ${sideCount ? "md:grid-cols-[minmax(0,1fr)_minmax(0,36%)]" : ""} ${sideCount > 1 ? "md:grid-rows-2" : ""}`}>
        {shown.map((p) => {
          const isMain = p === main;
          const Icon = ICONS[p.id] || FileText;
          return (
            <section key={p.id} className={`flex min-h-[220px] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-xl md:min-h-0 ${isMain ? `order-first ${sideCount > 1 ? "md:col-start-1 md:row-span-2" : ""}` : "md:col-start-2"}`}>
              <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/8 bg-white/[.04] px-3 py-1.5">
                <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-white/90"><Icon className="size-3.5 shrink-0 text-sky-300" /><span className="truncate">{p.title}</span></span>
                <span className="flex shrink-0 gap-1">
                  {panels.length > 1 && <button title="کوچک کردن" aria-label="کوچک کردن" onClick={() => toggleMini(p.id)} className="grid size-6 place-items-center rounded-md text-white/65 hover:bg-white/12"><Minus className="size-3.5" /></button>}
                  {panels.length > 1 && <button title={soloId === p.id ? "بازگشت" : "تمام‌صفحه در کلاس"} aria-label="بزرگ کردن" onClick={() => setSolo(soloId === p.id ? null : p.id)} className="grid size-6 place-items-center rounded-md text-white/65 hover:bg-white/12">{soloId === p.id ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</button>}
                </span>
              </header>
              <div className="min-h-0 flex-1">{p.node}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
