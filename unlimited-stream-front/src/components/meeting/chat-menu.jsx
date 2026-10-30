"use client";

import { MoreVertical, Trash2, Globe2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Pop, usePop } from "./rail";

// Host-only three-dot menu on top of the chat: enable/disable, public vs private, clear.
export function ChatMenu({ channel, chatEnabled, chatMode, onEnabled, onMode, flash }) {
  const [open, toggle, close] = usePop();
  const run = async (fn, ok) => { try { await fn(); if (ok) flash(ok); } catch (e) { flash(e.message); } };
  const seg = (active) => `flex-1 rounded-lg border px-2 py-2.5 text-center transition ${active ? "border-sky-400/60 bg-sky-400/12" : "border-white/10 bg-white/[.03] hover:bg-white/[.07]"}`;
  return (
    <>
      <button onClick={(e) => toggle("m", e)} aria-label="تنظیمات چت" title="تنظیمات چت" className="grid size-6 place-items-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white"><MoreVertical className="size-4" /></button>
      {open && (
        <Pop anchor={open.rect} direction="down" title="تنظیمات چت" onClose={close}>
          <button onClick={() => run(async () => { await api.setChatEnabled(channel, !chatEnabled); onEnabled(!chatEnabled); }, chatEnabled ? "چت غیرفعال شد." : "چت فعال شد.")} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-right text-xs text-white/90 hover:bg-white/8">
            <span>چت برای دانش‌آموزان فعال باشد</span>
            <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${chatEnabled ? "bg-sky-500" : "bg-white/20"}`}><span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${chatEnabled ? "right-0.5" : "right-[18px]"}`} /></span>
          </button>
          <div className="mx-1 mt-2 h-px bg-white/8" />
          <div className="h-2" />
          <div className="flex gap-1.5 px-1">
            <button onClick={() => run(async () => { await api.setChatMode(channel, "public"); onMode("public"); }, "چت عمومی شد.")} className={seg(chatMode !== "private")}><span className="flex items-center justify-center gap-1 text-xs font-medium text-white"><Globe2 className="size-3.5" />عمومی</span></button>
            <button onClick={() => run(async () => { await api.setChatMode(channel, "private"); onMode("private"); }, "چت خصوصی شد.")} className={seg(chatMode === "private")}><span className="flex items-center justify-center gap-1 text-xs font-medium text-white"><ShieldCheck className="size-3.5" />خصوصی</span></button>
          </div>
          <button onClick={() => { if (window.confirm("همهٔ پیام‌های چت پاک شود؟")) { run(() => api.clearChat(channel), "چت پاک شد."); close(); } }} className="mt-2 flex w-full items-center gap-2 rounded-lg border border-rose-400/25 px-2 py-2 text-xs text-rose-200 hover:bg-rose-500/15"><Trash2 className="size-3.5" />پاک کردن همهٔ پیام‌ها</button>
        </Pop>
      )}
    </>
  );
}
