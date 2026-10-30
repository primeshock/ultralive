"use client";

import { useEffect, useState } from "react";
import { Clock, LogOut, Maximize2, Timer, UserRound, Video } from "lucide-react";
import { Quality } from "./panels";
import { Tip } from "./tip";
import { Pop, usePop } from "./rail";

const pad = (n) => String(n).padStart(2, "0");
const clock = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

function useSecondTick() {
  const [now, setNow] = useState(0);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return now;
}

// Elapsed class time (own state, so the 300-row people list is not re-rendered every second).
export function ClassClock() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const id = setInterval(() => setSeconds((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  return <span className="flex items-center gap-1.5 rounded-full bg-[var(--s2)] px-3 py-1.5 text-xs tabular-nums" dir="ltr"><Clock className="size-3.5 text-[var(--accent-ink)]" />{clock(seconds)}</span>;
}

// Countdown to a scheduled class end (header pill for the host, floating banner for everyone else).
export function EndCountdown({ endsAt, floating }) {
  const now = useSecondTick();
  const remaining = Math.max(0, Math.round((endsAt - (now || endsAt - 1000)) / 1000));
  const text = `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;
  if (floating) return <div className="pointer-events-none absolute inset-x-0 top-14 z-30 mx-auto w-fit rounded-full bg-rose-500/90 px-4 py-1.5 text-xs">کلاس تا {text} دیگر بسته می‌شود</div>;
  return <span className="flex items-center gap-1.5 rounded-full bg-rose-500/25 px-3 py-1.5 text-xs tabular-nums text-rose-100" dir="ltr"><Timer className="size-3.5" />{text}</span>;
}

// Public-link guests pick their own display name; it can be changed here at any time.
function GuestName({ guest }) {
  const [open, toggle, close] = usePop();
  const [value, setValue] = useState(guest.name);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await guest.onRename(value); close(); } catch (err) { setError(err.message || "ذخیره نشد."); } finally { setBusy(false); }
  };
  return (
    <>
      <Tip label="نام شما"><button onClick={(e) => toggle("name", e)} aria-label="تغییر نام" className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--s2)] px-2.5 text-xs text-[var(--ink)] transition hover:bg-[var(--s3)]"><UserRound className="size-4" /><span className="hidden max-w-[110px] truncate sm:inline">{guest.name}</span></button></Tip>
      {open && (
        <Pop anchor={open.rect} direction="down" title="نام نمایشی شما" onClose={close}>
          <form onSubmit={save} className="space-y-2 p-1">
            <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} autoFocus placeholder="نام شما" className="h-9 w-full rounded-lg bg-[var(--s2)] px-3 text-sm text-white outline-none placeholder:text-[var(--ink-3)] focus:ring-1 focus:ring-[var(--accent)]" />
            {error && <p className="px-1 text-[11px] text-rose-300">{error}</p>}
            <button disabled={busy || value.trim().length < 2 || value.trim() === guest.name} className="h-9 w-full rounded-lg bg-[var(--accent)] text-xs font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:bg-[var(--s3)] disabled:text-[var(--ink-3)]">{busy ? "..." : "ذخیره"}</button>
          </form>
        </Pop>
      )}
    </>
  );
}

/** The top bar shared by the desktop and the studio class rooms. `children` = host actions (settings, recording). */
export function RoomHeader({ title, organization, endsAt, quality, qualityNode, onLeave, guest, children }) {
  return (
    <header className="relative z-30 flex items-center justify-between gap-3 bg-[color-mix(in_oklab,var(--s2)_88%,#0a7bc4_12%)] px-4 py-2 shadow-[0_10px_24px_-14px_rgb(0_0_0/.7)]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 place-items-center rounded-lg bg-[var(--accent)] text-white"><Video className="size-4" /></span>
        <div className="min-w-0"><h1 className="truncate text-sm font-semibold">{title}</h1><p className="truncate text-[11px] text-[var(--ink-3)]">{organization || "کلاس آنلاین"}</p></div>
      </div>
      <div className="flex items-center gap-2">
        {endsAt && <EndCountdown endsAt={endsAt} />}
        <ClassClock />
        {qualityNode || (quality && <span className="hidden items-center gap-1.5 rounded-full bg-[var(--s2)] px-2.5 py-1.5 sm:flex"><Quality value={quality} /></span>)}
        {guest && <GuestName guest={guest} />}
        {children}
        <Tip label="تمام‌صفحه"><button onClick={() => document.documentElement.requestFullscreen?.()} className="hidden size-8 place-items-center rounded-lg bg-[var(--s2)] hover:bg-[var(--s3)] md:grid" aria-label="تمام‌صفحه"><Maximize2 className="size-4" /></button></Tip>
        <Tip label="خروج از کلاس"><button onClick={onLeave} aria-label="خروج از کلاس" className="grid size-8 place-items-center rounded-lg bg-[var(--s2)] text-[var(--ink)] transition hover:bg-rose-500/80 hover:text-white"><LogOut className="size-4" /></button></Tip>
      </div>
    </header>
  );
}
