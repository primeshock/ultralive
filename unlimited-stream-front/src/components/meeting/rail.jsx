"use client";

import { useState } from "react";
import { PenTool, FileText, BarChart3, Hand, Settings2, PhoneOff, Presentation, X, Timer, Mic, MicOff, Video, MonitorUp, Circle, Undo2, Trash2 } from "lucide-react";
import { PollWidget } from "@/components/poll-widget";
import { api } from "@/lib/api";
import { ModeSwitch } from "./mode-switch";
import { INK_TOOLS, INK_COLORS, INK_WIDTHS } from "./annotated-surface";

function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-right text-xs text-white/85 transition hover:bg-white/8">
      <span>{label}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-sky-500" : "bg-white/20"}`}><span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${checked ? "right-0.5" : "right-[18px]"}`} /></span>
    </button>
  );
}

// direction: "side" (opens next to the vertical rail) or "up" (opens above the bottom bar)
function Pop({ title, onClose, children, wide, direction = "side" }) {
  const place = direction === "up" ? "bottom-full mb-2 right-0" : "top-full mt-2 right-0 lg:top-0 lg:mt-0 lg:left-full lg:right-auto lg:ms-2";
  return (
    <div className={`absolute z-40 ${place} ${wide ? "w-[340px] max-w-[92vw]" : "w-64"} max-h-[70vh] overflow-y-auto rounded-2xl border border-white/12 bg-[#0b1226]/96 p-2 text-white shadow-2xl backdrop-blur-2xl`}>
      <div className="mb-1 flex items-center justify-between px-2 pt-1 text-xs font-semibold"><span>{title}</span><button onClick={onClose} aria-label="بستن" className="grid size-6 place-items-center rounded-md hover:bg-white/10"><X className="size-3.5" /></button></div>
      {children}
    </div>
  );
}

function RailButton({ icon: Icon, label, active, onClick, children }) {
  return (
    <div className="relative">
      <button onClick={onClick} title={label} aria-label={label} className={`flex w-11 flex-col items-center gap-0.5 rounded-xl py-1.5 transition ${active ? "bg-sky-500 text-white" : "text-white/75 hover:bg-white/12"}`}>
        <Icon className="size-[18px]" /><span className="text-[9px] leading-3">{label}</span>
      </button>
      {children}
    </div>
  );
}

function Tool({ icon: Icon, label, active, onClick, danger }) {
  return <button onClick={onClick} title={label} aria-label={label} className={`grid size-8 place-items-center rounded-lg transition ${active ? "bg-sky-500 text-white" : danger ? "text-rose-300 hover:bg-rose-500/20" : "text-white/75 hover:bg-white/12"}`}><Icon className="size-4" /></button>;
}

/**
 * Side rail = content controls ONLY. What it shows follows what is on stage:
 * always: whiteboard / document / poll. While a PDF or whiteboard is open: the full annotation toolkit.
 */
export function ContentRail({ channel, stage, files, onStage, drawable, ink, onInk, onInkAction }) {
  const [open, setOpen] = useState(null);
  const toggle = (id) => setOpen((cur) => (cur === id ? null : id));
  const close = () => setOpen(null);
  const inline = files.filter((f) => f.inline);

  return (
    <nav aria-label="کنترل محتوا" className="flex flex-row flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-white/[.05] p-1 backdrop-blur-xl lg:w-[52px] lg:flex-col lg:flex-nowrap lg:overflow-y-auto">
      <RailButton icon={PenTool} label="تخته" active={stage.boardOpen} onClick={() => onStage({ boardOpen: !stage.boardOpen })} />
      <RailButton icon={FileText} label="سند" active={Boolean(stage.content)} onClick={() => toggle("doc")}>
        {open === "doc" && <Pop title="نمایش سند برای همه" onClose={close}>
          {inline.length === 0 && <p className="p-3 text-center text-xs text-white/50">ابتدا از تب «فایل‌ها» یک PDF یا تصویر بارگذاری کنید.</p>}
          {inline.map((f) => <button key={f.id} onClick={() => { onStage({ fileId: f.id }); close(); }} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-xs hover:bg-white/10 ${stage.content?.id === f.id ? "text-emerald-300" : "text-white/85"}`}><Presentation className="size-3.5 shrink-0" /><span className="truncate">{f.name}</span></button>)}
          {stage.content && <button onClick={() => { onStage({ fileId: null }); close(); }} className="mt-1 w-full rounded-lg bg-rose-500/20 px-2 py-2 text-xs text-rose-100 hover:bg-rose-500/30">توقف نمایش</button>}
        </Pop>}
      </RailButton>
      <RailButton icon={BarChart3} label="نظرسنجی" active={open === "poll"} onClick={() => toggle("poll")}>
        {open === "poll" && <Pop title="نظرسنجی و آزمون" onClose={close} wide><PollWidget channel={channel} /></Pop>}
      </RailButton>

      {drawable && (
        <>
          <span className="my-1 h-px w-8 bg-white/10 max-lg:hidden" />
          <div className="grid grid-cols-2 gap-0.5 max-lg:flex max-lg:flex-wrap lg:grid-cols-1">
            {INK_TOOLS.map(([id, Icon, label]) => <Tool key={id} icon={Icon} label={label} active={ink.tool === id} onClick={() => onInk({ tool: id })} />)}
          </div>
          <span className="my-1 h-px w-8 bg-white/10 max-lg:hidden" />
          <div className="grid grid-cols-2 gap-1.5 p-1 max-lg:flex max-lg:flex-wrap">
            {INK_COLORS.map((c) => <button key={c} aria-label={c} onClick={() => onInk({ color: c })} style={{ background: c }} className={`size-4 rounded-full border ${ink.color === c ? "scale-125 border-white ring-2 ring-sky-400" : "border-white/30"}`} />)}
          </div>
          <div className="flex gap-0.5">
            {INK_WIDTHS.map((w) => <button key={w} title="ضخامت" aria-label="ضخامت" onClick={() => onInk({ width: w })} className={`grid size-6 place-items-center rounded-md ${ink.width === w ? "bg-white/20" : "hover:bg-white/10"}`}><span className="rounded-full bg-white" style={{ width: w + 3, height: w + 3 }} /></button>)}
          </div>
          <span className="my-1 h-px w-8 bg-white/10 max-lg:hidden" />
          <Tool icon={Undo2} label="برگشت" onClick={() => onInkAction("undo")} />
          <Tool icon={Trash2} label="پاک کردن صفحه" danger onClick={() => onInkAction("clear")} />
        </>
      )}
    </nav>
  );
}

function BarButton({ icon: Icon, label, active, danger, onClick, children }) {
  const tone = danger ? "bg-rose-500/90 text-white hover:bg-rose-400" : active ? "bg-sky-500 text-white" : "bg-white/10 text-white hover:bg-white/18";
  return (
    <div className="relative">
      <button onClick={onClick} title={label} aria-label={label} className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium transition ${tone}`}><Icon className="size-[18px]" /><span className="hidden whitespace-nowrap xl:block">{label}</span></button>
      {children}
    </div>
  );
}

/** Staff actions that live in the bottom bar (next to mic / camera / screen). */
export function StaffBarActions({ channel, settings, mode, onMode, onSettings, flash, endsAt, recording, onRecording }) {
  const [open, setOpen] = useState(null);
  const toggle = (id) => setOpen((cur) => (cur === id ? null : id));
  const close = () => setOpen(null);
  const request = (kind) => api.meetingRequest(channel, { kind }).then(() => flash("درخواست ارسال شد.")).catch(() => {});
  const end = async (minutes) => { try { await api.meetingEnd(channel, minutes); if (minutes) flash(`کلاس ${minutes} دقیقهٔ دیگر بسته می‌شود.`); } catch (e) { flash(e.message); } close(); };
  return (
    <>
      <BarButton icon={MicOff} label="قطع صدای همه" onClick={() => api.meetingMuteAll(channel).then(() => flash("صدای همه قطع شد.")).catch(() => {})} />
      <BarButton icon={Hand} label="درخواست از دانش‌آموزان" active={open === "req"} onClick={() => toggle("req")}>
        {open === "req" && <Pop direction="up" title="درخواست از همه" onClose={close}>
          {[["screen", MonitorUp, "اشتراک صفحه"], ["camera", Video, "روشن کردن دوربین"], ["microphone", Mic, "روشن کردن میکروفون"]].map(([kind, Icon, label]) => <button key={kind} onClick={() => { request(kind); close(); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-xs text-white/85 hover:bg-white/10"><Icon className="size-3.5" />{label}</button>)}
        </Pop>}
      </BarButton>
      <BarButton icon={Circle} label={recording ? "توقف ضبط" : "ضبط کلاس"} active={recording} onClick={onRecording} />
      <BarButton icon={Settings2} label="تنظیمات کلاس" active={open === "set"} onClick={() => toggle("set")}>
        {open === "set" && <Pop direction="up" title="تنظیمات کلاس" onClose={close}>
          <div className="px-2 pb-2"><ModeSwitch channel={channel} mode={mode} onChange={onMode} /></div>
          <Toggle checked={settings.showParticipantsToStudents} onChange={(v) => onSettings({ showParticipantsToStudents: v })} label="نمایش فهرست افراد به دانش‌آموز" />
          <Toggle checked={settings.studentsMayRaiseHand} onChange={(v) => onSettings({ studentsMayRaiseHand: v })} label="اجازهٔ بالا بردن دست" />
        </Pop>}
      </BarButton>
      <BarButton icon={endsAt ? Timer : PhoneOff} label="پایان کلاس" danger onClick={() => toggle("end")}>
        {open === "end" && <Pop direction="up" title="پایان کلاس" onClose={close}>
          <button onClick={() => end(0)} className="w-full rounded-lg bg-rose-500/90 px-2 py-2 text-xs font-medium text-white hover:bg-rose-400">پایان همین حالا</button>
          <p className="px-2 pb-1 pt-3 text-[11px] text-white/50">یا بعد از مدتی (شمارش معکوس برای همه):</p>
          <div className="grid grid-cols-4 gap-1.5 px-1">{[5, 10, 15, 30].map((m) => <button key={m} onClick={() => end(m)} className="rounded-lg bg-white/10 py-2 text-xs text-white hover:bg-white/18">{m}′</button>)}</div>
          {endsAt && <button onClick={() => { api.meetingCancelEnd(channel).catch(() => {}); close(); }} className="mt-2 w-full rounded-lg border border-white/15 px-2 py-2 text-xs text-white/85 hover:bg-white/8">لغو پایان زمان‌دار</button>}
        </Pop>}
      </BarButton>
    </>
  );
}
