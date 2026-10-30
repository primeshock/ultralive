"use client";

import { useEffect, useState } from "react";
import { MoreVertical, Trash2, Globe2, ShieldCheck, Timer } from "lucide-react";
import { getSocket } from "@/lib/socket";
import { api } from "@/lib/api";
import { Pop, usePop } from "./rail";

// Host-only three-dot menu on top of the chat: enable/disable, public vs private, clear.
export function ChatMenu({ channel, chatEnabled, chatMode, onEnabled, onMode, flash }) {
  const [open, toggle, close] = usePop();
  const [slow, setSlow] = useState(0);
  useEffect(() => {
    const socket = getSocket();
    const onState = (st) => { if (typeof st?.slow === "number") setSlow(st.slow); };
    socket.on("chat:state", onState);
    return () => socket.off("chat:state", onState);
  }, []);
  const run = async (fn, ok) => { try { await fn(); if (ok) flash(ok); } catch (e) { flash(e.message); } };
  const seg = (active) => `flex-1 rounded-lg px-2 py-2.5 text-center transition ${active ? "bg-[var(--accent-soft)] ring-1 ring-inset ring-[var(--accent)]/40" : "bg-[color-mix(in_oklab,var(--s2)_55%,transparent)] hover:bg-[var(--s3)]"}`;
  return (
    <>
      <button onClick={(e) => toggle("m", e)} aria-label="تنظیمات چت" title="تنظیمات چت" className="grid size-6 place-items-center rounded-md text-[var(--ink-2)] transition hover:bg-[var(--s2)] hover:text-white"><MoreVertical className="size-4" /></button>
      {open && (
        <Pop anchor={open.rect} direction="down" title="تنظیمات چت" onClose={close}>
          <button onClick={() => run(async () => { await api.setChatEnabled(channel, !chatEnabled); onEnabled(!chatEnabled); }, chatEnabled ? "چت غیرفعال شد." : "چت فعال شد.")} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-right text-xs text-[var(--ink)] bg-[color-mix(in_oklab,var(--s2)_55%,transparent)] hover:bg-[var(--s3)]">
            <span>چت برای دانش‌آموزان فعال باشد</span>
            <span className={`relative h-5 w-9 shrink-0 rounded-full transition ring-1 ring-inset ring-[var(--line-strong)] ${chatEnabled ? "bg-[var(--accent)]" : "bg-[var(--s3)]"}`}><span className={`absolute top-0.5 size-4 rounded-full bg-white transition-[right] ${chatEnabled ? "right-0.5" : "right-[18px]"}`} /></span>
          </button>
          <div className="h-2" />
          <div className="flex gap-1.5 px-1">
            <button onClick={() => run(async () => { await api.setChatMode(channel, "public"); onMode("public"); }, "چت عمومی شد.")} className={seg(chatMode !== "private")}><span className="flex items-center justify-center gap-1 text-xs font-medium text-white"><Globe2 className="size-3.5" />عمومی</span></button>
            <button onClick={() => run(async () => { await api.setChatMode(channel, "private"); onMode("private"); }, "چت خصوصی شد.")} className={seg(chatMode === "private")}><span className="flex items-center justify-center gap-1 text-xs font-medium text-white"><ShieldCheck className="size-3.5" />خصوصی</span></button>
          </div>
          <p className="mt-3 flex items-center gap-1.5 px-2 text-xs text-[var(--ink-2)]"><Timer className="size-3.5" />فاصلهٔ بین پیام‌های هر کاربر (ضد اسپم)</p>
          <div className="mt-1.5 flex gap-1 px-1">
            {[0, 5, 15, 30, 60].map((n) => <button key={n} onClick={() => { setSlow(n); getSocket().emit("chat:slow", { channel, seconds: n }); }} className={`flex-1 rounded-md px-1 py-0.5 text-center text-[11px] leading-5 transition ${slow === n ? "bg-[var(--accent-soft)] text-white ring-1 ring-inset ring-[var(--accent)]/40" : "bg-[color-mix(in_oklab,var(--s2)_55%,transparent)] text-[var(--ink-2)] hover:bg-[var(--s3)] hover:text-white"}`}>{n === 0 ? "خاموش" : `${n}s`}</button>)}
          </div>
          <button onClick={() => { if (window.confirm("همهٔ پیام‌های چت پاک شود؟")) { run(() => api.clearChat(channel), "چت پاک شد."); close(); } }} className="mt-2 flex w-full items-center gap-2 rounded-lg bg-rose-500/10 px-2 py-2 text-xs text-rose-200 transition hover:bg-rose-500/20"><Trash2 className="size-3.5" />پاک کردن همهٔ پیام‌ها</button>
        </Pop>
      )}
    </>
  );
}
