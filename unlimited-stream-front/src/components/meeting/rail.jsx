"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { PenTool, FileText, BarChart3, Settings2, Presentation, X, Timer, Pause, Play, Square, Undo2, Trash2, Ban } from "lucide-react";
import { PollWidget } from "@/components/poll-widget";
import { api } from "@/lib/api";
import { ModeSwitch } from "./mode-switch";
import { Tip } from "./tip";
import { INK_TOOLS, INK_COLORS, INK_WIDTHS } from "./annotated-surface";

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-right text-xs text-white/85 transition hover:bg-white/8">
      <span>{label}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-sky-500" : "bg-white/20"}`}><span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${checked ? "right-0.5" : "right-[18px]"}`} /></span>
    </button>
  );
}

// One open popover at a time. The anchor rect is captured on click so the panel can be rendered in a
// portal (position: fixed) — it can never be clipped by, or hidden under, the stage / rail containers.
function usePop() {
  const [open, setOpen] = useState(null);
  const toggle = (id, e) => { const rect = e.currentTarget.getBoundingClientRect(); setOpen((cur) => (cur?.id === id ? null : { id, rect })); };
  return [open, toggle, () => setOpen(null)];
}

function Pop({ anchor, title, onClose, children, wide, direction = "side" }) {
  const w = wide ? 340 : 272;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  let left; let top;
  if (direction === "down") { top = anchor.bottom + 8; left = Math.min(Math.max(8, anchor.left), vw - w - 8); }
  else { left = anchor.right + 8 + w > vw - 8 ? Math.max(8, anchor.left - w - 8) : anchor.right + 8; top = Math.max(8, Math.min(anchor.top, vh - 200)); }
  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} aria-hidden />
      <div dir="rtl" style={{ left, top, width: Math.min(w, vw - 16), maxHeight: vh - top - 12 }} className="fixed z-[80] overflow-y-auto rounded-2xl border border-white/12 bg-[#0b1226]/97 p-2 text-white shadow-2xl backdrop-blur-2xl">
        <div className="mb-1 flex items-center justify-between px-2 pt-1 text-xs font-semibold"><span>{title}</span><button onClick={onClose} aria-label="بستن" className="grid size-6 place-items-center rounded-md hover:bg-white/10"><X className="size-3.5" /></button></div>
        {children}
      </div>
    </>,
    document.body
  );
}

function RailButton({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} aria-label={label} className={`flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-xl py-1.5 transition ${active ? "bg-sky-500 text-white" : "text-white/75 hover:bg-white/12"}`}>
      <Icon className="size-[18px]" /><span className="text-[9px] leading-3">{label}</span>
    </button>
  );
}

function Tool({ icon: Icon, label, active, onClick, danger }) {
  return (
    <Tip label={label} side="right"><button onClick={onClick} aria-label={label} className={`grid size-8 place-items-center rounded-lg transition ${active ? "bg-sky-500 text-white" : danger ? "text-rose-300 hover:bg-rose-500/20" : "text-white/75 hover:bg-white/12"}`}><Icon className="size-4" /></button></Tip>
  );
}

/**
 * Side rail = content controls ONLY. What it shows follows what is on stage:
 * always: whiteboard / document / poll. While a PDF or whiteboard is open: the annotation toolkit.
 */
export function ContentRail({ channel, stage, files, onStage, drawable, ink, onInk, onInkAction }) {
  const [open, toggle, close] = usePop();
  const hasDoc = Boolean(stage.content);
  return (
    <nav aria-label="کنترل محتوا" className="flex flex-row flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-white/[.05] p-1 backdrop-blur-xl md:max-h-full md:w-[56px] md:flex-col md:flex-nowrap md:overflow-y-auto md:overflow-x-hidden">
      <RailButton icon={PenTool} label="تخته" active={stage.boardOpen} onClick={() => onStage({ boardOpen: !stage.boardOpen })} />
      <RailButton icon={FileText} label="سند" active={hasDoc || open?.id === "doc"} onClick={(e) => toggle("doc", e)} />
      <RailButton icon={BarChart3} label="نظرسنجی" active={open?.id === "poll"} onClick={(e) => toggle("poll", e)} />

      {drawable && (
        <>
          <span className="my-1 h-px w-8 shrink-0 bg-white/10 max-md:hidden" />
          <div className="flex flex-wrap gap-0.5 md:flex-col md:flex-nowrap">
            {INK_TOOLS.map(([id, Icon, label]) => <Tool key={id} icon={Icon} label={label} active={ink.tool === id} onClick={() => onInk({ tool: id })} />)}
          </div>
          <span className="my-1 h-px w-8 shrink-0 bg-white/10 max-md:hidden" />
          <div className="grid shrink-0 grid-cols-2 gap-1.5 p-1">
            {INK_COLORS.map((c) => <button key={c} aria-label={c} onClick={() => onInk({ color: c })} style={{ background: c }} className={`size-4 rounded-full border ${ink.color === c ? "scale-125 border-white ring-2 ring-sky-400" : "border-white/30"}`} />)}
          </div>
          <div className="flex shrink-0 gap-1 md:flex-col">
            {INK_WIDTHS.map((w) => <button key={w} aria-label="ضخامت" onClick={() => onInk({ width: w })} className={`grid size-7 place-items-center rounded-md ${ink.width === w ? "bg-white/20" : "hover:bg-white/10"}`}><span className="rounded-full bg-white" style={{ width: w + 3, height: w + 3 }} /></button>)}
          </div>
          <span className="my-1 h-px w-8 shrink-0 bg-white/10 max-md:hidden" />
          <Tool icon={Undo2} label="برگشت" onClick={() => onInkAction("undo")} />
          <Tool icon={Trash2} label="پاک کردن صفحه" danger onClick={() => onInkAction("clear")} />
        </>
      )}

      {open?.id === "doc" && (
        <Pop anchor={open.rect} title="نمایش محتوای بارگذاری‌شده" onClose={close}>
          {files.length === 0 && <p className="p-3 text-center text-xs leading-6 text-white/55">هنوز فایلی بارگذاری نشده است. از تب «فایل‌ها» PDF، تصویر، ویدیو یا صوت بارگذاری کنید.</p>}
          {files.map((f) => (
            <button key={f.id} disabled={!f.inline} onClick={() => { onStage({ fileId: f.id }); close(); }} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-xs transition hover:bg-white/10 disabled:opacity-40 ${stage.content?.id === f.id ? "bg-emerald-500/15 text-emerald-200" : "text-white/85"}`}>
              <Presentation className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">{f.name}</span>
              {stage.content?.id === f.id ? <span className="text-[10px]">در حال نمایش</span> : !f.inline && <span className="text-[10px]">فقط دانلود</span>}
            </button>
          ))}
          {hasDoc && <button onClick={() => { onStage({ fileId: null }); close(); }} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500/20 px-2 py-2 text-xs text-rose-100 hover:bg-rose-500/30"><Ban className="size-3.5" />بستن سند</button>}
        </Pop>
      )}
      {open?.id === "poll" && <Pop anchor={open.rect} title="نظرسنجی و آزمون" onClose={close} wide><PollWidget channel={channel} /></Pop>}
    </nav>
  );
}

function HeadButton({ icon: Icon, label, active, onClick, tone = "neutral", children }) {
  const cls = tone === "danger" ? "bg-rose-500/85 text-white hover:bg-rose-400" : active ? "bg-sky-500 text-white" : "bg-white/8 text-white hover:bg-white/16";
  return (
    <Tip label={label}>
      <button onClick={onClick} aria-label={label} className={`grid size-8 place-items-center rounded-xl transition ${cls}`}>{children || <Icon className="size-4" />}</button>
    </Tip>
  );
}

/**
 * Recording control: a clear red record button when idle; while recording a compact pill with a pulsing
 * dot, elapsed time, pause/resume and stop. (Pause ends the current file; resume starts the next one.)
 */
export function RecordControl({ rec, seconds, onAction }) {
  if (rec.state === "idle") {
    return (
      <Tip label="شروع ضبط کلاس">
        <button onClick={() => onAction("start")} aria-label="شروع ضبط کلاس" className="grid size-8 place-items-center rounded-xl bg-white/8 transition hover:bg-white/16">
          <span className="grid size-[18px] place-items-center rounded-full border-2 border-rose-400"><span className="size-2 rounded-full bg-rose-500" /></span>
        </button>
      </Tip>
    );
  }
  const live = rec.state === "recording";
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-rose-500/12 py-0.5 pe-1 ps-2.5 ring-1 ring-rose-400/40">
      <span className={`size-2 rounded-full ${live ? "animate-pulse bg-rose-500" : "bg-amber-400"}`} />
      <span className="text-[11px] tabular-nums text-rose-50" dir="ltr">{fmt(seconds)}</span>
      <Tip label={live ? "توقف موقت (فایل فعلی ذخیره می‌شود)" : "ادامه ضبط (فایل جدید)"}>
        <button onClick={() => onAction(live ? "pause" : "resume")} aria-label={live ? "توقف موقت" : "ادامه ضبط"} className="grid size-6 place-items-center rounded-full bg-white/12 text-white hover:bg-white/22">{live ? <Pause className="size-3" /> : <Play className="size-3" />}</button>
      </Tip>
      <Tip label="پایان ضبط">
        <button onClick={() => onAction("stop")} aria-label="پایان ضبط" className="grid size-6 place-items-center rounded-full bg-rose-500 text-white hover:bg-rose-400"><Square className="size-2.5 fill-current" /></button>
      </Tip>
    </div>
  );
}

/** Host actions in the top bar: class settings (incl. ending the class) and recording. */
export function HeaderActions({ channel, settings, mode, onMode, onSettings, flash, endsAt, rec, recSeconds, onRec }) {
  const [open, toggle, close] = usePop();
  const end = async (minutes) => { try { await api.meetingEnd(channel, minutes); if (minutes) flash(`کلاس ${minutes} دقیقهٔ دیگر بسته می‌شود.`); } catch (e) { flash(e.message); } close(); };
  return (
    <>
      <HeadButton icon={Settings2} label="تنظیمات کلاس" active={open?.id === "set"} onClick={(e) => toggle("set", e)} />
      <RecordControl rec={rec} seconds={recSeconds} onAction={onRec} />
      {open?.id === "set" && (
        <Pop anchor={open.rect} direction="down" title="تنظیمات کلاس" onClose={close}>
          <div className="px-2 pb-2"><ModeSwitch channel={channel} mode={mode} onChange={onMode} /></div>
          <Toggle checked={settings.showParticipantsToStudents} onChange={(v) => onSettings({ showParticipantsToStudents: v })} label="نمایش فهرست افراد به دانش‌آموز" />
          <Toggle checked={settings.studentsMayRaiseHand} onChange={(v) => onSettings({ studentsMayRaiseHand: v })} label="اجازهٔ بالا بردن دست" />
          <div className="mt-2 border-t border-white/10 px-1 pt-3">
            <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold text-rose-200"><Timer className="size-3.5" />پایان کلاس</p>
            <button onClick={() => end(0)} className="w-full rounded-lg bg-rose-500/90 px-2 py-2 text-xs font-medium text-white hover:bg-rose-400">پایان کلاس برای همه، همین حالا</button>
            <p className="px-1 pb-1 pt-3 text-[11px] text-white/50">یا بعد از مدتی (شمارش معکوس برای همه):</p>
            <div className="grid grid-cols-4 gap-1.5">{[5, 10, 15, 30].map((m) => <button key={m} onClick={() => end(m)} className="rounded-lg bg-white/10 py-2 text-xs text-white hover:bg-white/18">{m} د</button>)}</div>
            {endsAt && <button onClick={() => { api.meetingCancelEnd(channel).catch(() => {}); close(); }} className="mt-2 w-full rounded-lg border border-white/15 px-2 py-2 text-xs text-white/85 hover:bg-white/8">لغو پایان زمان‌دار</button>}
          </div>
        </Pop>
      )}
    </>
  );
}
