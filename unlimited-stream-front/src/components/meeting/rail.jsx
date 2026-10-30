"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PenTool, FileText, BarChart3, Settings2, Presentation, X, Timer, Pause, Play, Square, Undo2, Trash2, Ban, Shapes, Palette } from "lucide-react";
import { api } from "@/lib/api";
import { ModeSwitch } from "./mode-switch";
import { Tip } from "./tip";
import { INK_TOOLS, INK_COLORS, INK_WIDTHS } from "./annotated-surface";

const PRIMARY = ["pan", "pen", "hl", "eraser", "text"];
const SHAPES = ["line", "rect", "ellipse", "arrow"];
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// macOS-dock style magnification: icons near the pointer grow slightly, the selected one stays a bit larger.
// Works by writing transforms straight to the DOM from one pointer listener — no React re-renders.
export function useDock() {
  const ref = useRef(null);
  useEffect(() => {
    const nav = ref.current;
    if (!nav || !window.matchMedia("(hover: hover)").matches) return;
    const items = () => nav.querySelectorAll("[data-dock]");
    const apply = (x, y) => items().forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      const k = Math.max(0, 1 - d / 56);
      el.style.transform = k ? `scale(${1 + 0.08 * k})` : "";
    });
    const move = (e) => apply(e.clientX, e.clientY);
    const leave = () => items().forEach((el) => { el.style.transform = ""; });
    nav.addEventListener("pointermove", move);
    nav.addEventListener("pointerleave", leave);
    return () => { nav.removeEventListener("pointermove", move); nav.removeEventListener("pointerleave", leave); };
  }, []);
  return ref;
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="mb-1 flex w-full items-center justify-between gap-3 rounded-lg bg-[color-mix(in_oklab,var(--s2)_55%,transparent)] px-2.5 py-2 text-right text-xs text-[var(--ink)] transition hover:bg-[var(--s3)]">
      <span>{label}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ring-1 ring-inset ring-[var(--line-strong)] ${checked ? "bg-[var(--accent)]" : "bg-[var(--s3)]"}`}><span className={`absolute top-0.5 size-4 rounded-full bg-white transition-[right] ${checked ? "right-0.5" : "right-[18px]"}`} /></span>
    </button>
  );
}

// One open popover at a time. The anchor rect is captured on click so the panel can be rendered in a
// portal (position: fixed) — it can never be clipped by, or hidden under, the stage / rail containers.
export function usePop() {
  const [open, setOpen] = useState(null);
  const toggle = (id, e) => { const b = e.currentTarget.getBoundingClientRect(); const nav = e.currentTarget.closest("nav"); const n = nav ? nav.getBoundingClientRect() : b; const rect = { top: b.top, bottom: b.bottom, left: b.left, right: b.right, railLeft: n.left, railRight: n.right }; setOpen((cur) => (cur?.id === id ? null : { id, rect })); };
  return [open, toggle, () => setOpen(null)];
}

// Where the poll card floats: right beside the rail button that opened it (never in a far corner).
export function pollAnchor(e) {
  const b = e.currentTarget.getBoundingClientRect();
  const n = e.currentTarget.closest("nav")?.getBoundingClientRect() || b;
  const vw = window.innerWidth; const vh = window.innerHeight;
  const left = n.right + 14 + 304 > vw - 8 ? Math.max(8, n.left - 14 - 304) : n.right + 14;
  return { left, top: Math.max(8, Math.min(b.top, vh - 200)), maxHeight: vh - Math.max(8, Math.min(b.top, vh - 200)) - 12 };
}

export function Pop({ anchor, title, onClose, children, wide, direction = "side" }) {
  const w = wide ? 340 : 272;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  let left; let top;
  if (direction === "down") { top = anchor.bottom + 8; left = Math.min(Math.max(8, anchor.left), vw - w - 8); }
  else { const r = anchor.railRight ?? anchor.right; const l = anchor.railLeft ?? anchor.left; left = r + 14 + w > vw - 8 ? Math.max(8, l - w - 14) : r + 14; top = Math.max(8, Math.min(anchor.top, vh - 200)); }
  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} aria-hidden />
      <div dir="rtl" style={{ left, top, width: Math.min(w, vw - 16), maxHeight: vh - top - 12 }} className="room-float fixed z-[80] overflow-y-auto rounded-2xl p-2">
        <div className="mb-1 flex items-center justify-between px-2 pt-1 text-xs font-semibold"><span>{title}</span><button onClick={onClose} aria-label="بستن" className="grid size-6 place-items-center rounded-md hover:bg-[var(--s2)]"><X className="size-3.5" /></button></div>
        {children}
      </div>
    </>,
    document.body
  );
}

export function RailButton({ icon: Icon, label, active, onClick }) {
  return (
    <button data-dock onClick={onClick} aria-label={label} data-active={Boolean(active)} className="glass-btn flex size-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[var(--ink)] transition data-[active=true]:text-white">
      <Icon className="size-[18px]" /><span className="text-[9px] font-medium leading-4 tracking-tighter">{label}</span>
    </button>
  );
}

function Tool({ icon: Icon, label, active, onClick, danger }) {
  return (
    <Tip label={label} side="right"><button data-dock onClick={onClick} aria-label={label} data-active={Boolean(active)} className={`glass-btn grid size-8 place-items-center rounded-lg transition ${danger ? "!text-rose-300" : "text-[var(--ink)]"}`}><Icon className="size-4" /></button></Tip>
  );
}

/**
 * Side rail = content controls ONLY. What it shows follows what is on stage:
 * always: whiteboard / document / poll. While a PDF or whiteboard is open: the annotation toolkit.
 */
export function ContentRail({ channel, stage, files, onStage, drawable, ink, onInk, onInkAction, pollOpen, onPoll }) {
  const [open, toggle, close] = usePop();
  const hasDoc = Boolean(stage.content);
  const dock = useDock();
  return (
    <nav ref={dock} aria-label="کنترل محتوا" className="flex flex-row flex-wrap items-center gap-1 rounded-2xl border border-[var(--line)] bg-[var(--s1)] p-0.5 md:max-h-full md:gap-1 md:py-3 md:w-[52px] md:flex-col md:flex-nowrap md:overflow-y-auto md:overflow-x-hidden">
      <RailButton icon={PenTool} label="تخته" active={stage.boardOpen} onClick={() => onStage({ boardOpen: !stage.boardOpen })} />
      <RailButton icon={FileText} label="سند" active={hasDoc || open?.id === "doc"} onClick={(e) => toggle("doc", e)} />
      <RailButton icon={BarChart3} label="نظرسنجی" active={pollOpen} onClick={onPoll} />

      {drawable && (
        <>
          <span className="my-1 h-px w-8 shrink-0 bg-[var(--s2)] max-md:hidden" />
          <div className="flex flex-wrap gap-1 md:flex-col md:flex-nowrap">
            {PRIMARY.map((id) => { const [, Icon, label] = INK_TOOLS.find((t) => t[0] === id); return <Tool key={id} icon={Icon} label={label} active={ink.tool === id} onClick={() => onInk({ tool: id })} />; })}
            <Tip label="شکل‌ها" side="right"><button data-dock onClick={(e) => toggle("shapes", e)} data-active={SHAPES.includes(ink.tool)} aria-label="شکل‌ها" className="glass-btn grid size-8 place-items-center rounded-lg text-[var(--ink)] transition data-[active=true]:text-white"><Shapes className="size-4" /></button></Tip>
            <Tip label="رنگ و ضخامت" side="right"><button data-dock onClick={(e) => toggle("style", e)} aria-label="رنگ و ضخامت" className="glass-btn relative grid size-8 place-items-center rounded-lg transition"><span className="size-4 rounded-full border border-white/50" style={{ background: ink.color }} /><Palette className="absolute -bottom-1 -right-1 size-2.5 text-[var(--ink-2)]" /></button></Tip>
          </div>
          <span className="my-1 h-px w-8 shrink-0 bg-[var(--s2)] max-md:hidden" />
          <Tool icon={Undo2} label="برگشت" onClick={() => onInkAction("undo")} />
          <Tool icon={Trash2} label="پاک کردن صفحه" danger onClick={() => onInkAction("clear")} />
        </>
      )}

      {open?.id === "shapes" && (
        <Pop anchor={open.rect} title="شکل‌ها" onClose={close}>
          <div className="grid grid-cols-4 gap-1.5 p-1">{SHAPES.map((id) => { const [, Icon, label] = INK_TOOLS.find((t) => t[0] === id); return <Tip key={id} label={label}><button onClick={() => { onInk({ tool: id }); close(); }} data-active={ink.tool === id} aria-label={label} className="glass-btn grid size-10 place-items-center rounded-lg text-[var(--ink)] data-[active=true]:text-white"><Icon className="size-4" /></button></Tip>; })}</div>
        </Pop>
      )}
      {open?.id === "style" && (
        <Pop anchor={open.rect} title="رنگ و ضخامت" onClose={close}>
          <div className="grid grid-cols-7 gap-1.5 p-1.5">{INK_COLORS.map((c) => <button key={c} aria-label={c} onClick={() => onInk({ color: c })} style={{ background: c }} className={`size-7 rounded-full border transition ${ink.color === c ? "scale-110 border-white ring-2 ring-[var(--accent-ink)]" : "border-white/30"}`} />)}</div>
          <div className="flex items-center justify-around px-1 pb-1.5 pt-1">{INK_WIDTHS.map((w) => <button key={w} aria-label="ضخامت" onClick={() => onInk({ width: w })} data-active={ink.width === w} className="glass-btn grid size-10 place-items-center rounded-lg"><span className="rounded-full bg-white" style={{ width: w + 4, height: w + 4 }} /></button>)}</div>
        </Pop>
      )}

      {open?.id === "doc" && (
        <Pop anchor={open.rect} title="نمایش محتوای بارگذاری‌شده" onClose={close}>
          {files.length === 0 && <p className="p-3 text-center text-xs leading-6 text-[var(--ink-3)]">هنوز فایلی بارگذاری نشده است. از تب «فایل‌ها» PDF، تصویر، ویدیو یا صوت بارگذاری کنید.</p>}
          {files.map((f) => (
            <button key={f.id} disabled={!f.inline} onClick={() => { onStage({ fileId: f.id }); close(); }} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-xs transition hover:bg-[var(--s2)] disabled:opacity-40 ${stage.content?.id === f.id ? "bg-emerald-500/15 text-emerald-200" : "text-[var(--ink)]"}`}>
              <Presentation className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">{f.name}</span>
              {stage.content?.id === f.id ? <span className="text-[11px]">در حال نمایش</span> : !f.inline && <span className="text-[11px]">فقط دانلود</span>}
            </button>
          ))}
          {hasDoc && <button onClick={() => { onStage({ fileId: null }); close(); }} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500/20 px-2 py-2 text-xs text-rose-100 hover:bg-rose-500/30"><Ban className="size-3.5" />بستن سند</button>}
        </Pop>
      )}
    </nav>
  );
}

function HeadButton({ icon: Icon, label, active, onClick, tone = "neutral", children }) {
  const cls = tone === "danger" ? "bg-rose-500/85 text-white hover:bg-rose-400" : "glass-btn text-white";
  return (
    <Tip label={label}>
      <button onClick={onClick} data-active={Boolean(active)} aria-label={label} className={`grid size-8 place-items-center rounded-lg transition ${cls}`}>{children || <Icon className="size-4" />}</button>
    </Tip>
  );
}

/**
 * Recording control: a clear red record button when idle; while recording a compact pill with a pulsing
 * dot, elapsed time, pause/resume and stop. (Pause ends the current file; resume starts the next one.)
 */
export function RecordControl({ rec, onAction }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (rec.state !== "recording") return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [rec.state]);
  const seconds = rec.acc + (rec.state === "recording" && now ? Math.max(0, Math.round((now - rec.since) / 1000)) : 0);
  if (rec.state === "idle") {
    return (
      <Tip label="شروع ضبط کلاس">
        <button onClick={() => onAction("start")} aria-label="شروع ضبط کلاس" className="grid size-8 place-items-center rounded-lg bg-[var(--s2)] transition hover:bg-[var(--s3)]">
          <span className="grid size-[18px] place-items-center rounded-full border-2 border-rose-400"><span className="size-2 rounded-full bg-rose-500" /></span>
        </button>
      </Tip>
    );
  }
  const live = rec.state === "recording";
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-rose-500/12 py-0.5 pe-1 ps-2.5 ring-1 ring-rose-400/40">
      <span className={`size-2 rounded-full ${live ? "bg-rose-500 ring-2 ring-rose-500/30" : "bg-amber-400"}`} />
      <span className="text-[11px] tabular-nums text-rose-50" dir="ltr">{fmt(seconds)}</span>
      <Tip label={live ? "توقف موقت (فایل فعلی ذخیره می‌شود)" : "ادامه ضبط (فایل جدید)"}>
        <button onClick={() => onAction(live ? "pause" : "resume")} aria-label={live ? "توقف موقت" : "ادامه ضبط"} className="grid size-6 place-items-center rounded-full bg-[var(--s2)] text-white hover:bg-[var(--s3)]">{live ? <Pause className="size-3" /> : <Play className="size-3" />}</button>
      </Tip>
      <Tip label="پایان ضبط">
        <button onClick={() => onAction("stop")} aria-label="پایان ضبط" className="grid size-6 place-items-center rounded-full bg-rose-500 text-white hover:bg-rose-400"><Square className="size-2.5 fill-current" /></button>
      </Tip>
    </div>
  );
}

/** Host actions in the top bar: class settings (incl. ending the class) and recording. */
export function HeaderActions({ channel, settings, mode, onMode, onSettings, flash, endsAt, rec, onRec }) {
  const [open, toggle, close] = usePop();
  const end = async (minutes) => { try { await api.meetingEnd(channel, minutes); if (minutes) flash(`کلاس ${minutes} دقیقهٔ دیگر بسته می‌شود.`); } catch (e) { flash(e.message); } close(); };
  return (
    <>
      <HeadButton icon={Settings2} label="تنظیمات کلاس" active={open?.id === "set"} onClick={(e) => toggle("set", e)} />
      <RecordControl rec={rec} onAction={onRec} />
      {open?.id === "set" && (
        <Pop anchor={open.rect} direction="down" title="تنظیمات کلاس" onClose={close}>
          <div className="px-2 pb-2"><ModeSwitch className="flex w-full" channel={channel} mode={mode} onChange={onMode} /></div>
          <Toggle checked={settings.showParticipantsToStudents} onChange={(v) => onSettings({ showParticipantsToStudents: v })} label="نمایش فهرست افراد به دانش‌آموز" />
          <Toggle checked={settings.studentsMayRaiseHand} onChange={(v) => onSettings({ studentsMayRaiseHand: v })} label="اجازهٔ بالا بردن دست" />
          <div className="mt-3 px-1">
            <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold text-rose-200"><Timer className="size-3.5" />پایان جلسه</p>
            <button onClick={() => end(0)} className="w-full rounded-lg bg-rose-700/70 px-2 py-2 text-xs font-medium text-rose-50 transition hover:bg-rose-500">پایان جلسه</button>
            <p className="px-1 pb-1 pt-3 text-[11px] text-[var(--ink-3)]">یا بعد از مدتی (شمارش معکوس برای همه):</p>
            <div className="grid grid-cols-4 gap-1.5">{[5, 10, 15, 30].map((m) => <button key={m} onClick={() => end(m)} className="rounded-lg bg-[color-mix(in_oklab,var(--s2)_55%,transparent)] py-2 text-xs text-white transition hover:bg-[var(--s3)]">{m} د</button>)}</div>
            {endsAt && <button onClick={() => { api.meetingCancelEnd(channel).catch(() => {}); close(); }} className="mt-2 w-full rounded-lg bg-[color-mix(in_oklab,var(--s2)_55%,transparent)] px-2 py-2 text-xs text-[var(--ink)] transition hover:bg-[var(--s3)]">لغو پایان زمان‌دار</button>}
          </div>
        </Pop>
      )}
    </>
  );
}
