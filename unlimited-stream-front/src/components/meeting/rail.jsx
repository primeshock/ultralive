"use client";

import { useState } from "react";
import { PenTool, FileText, BarChart3, MicOff, Hand, Settings2, PhoneOff, Presentation, X, Timer, Mic, Video, MonitorUp, Circle } from "lucide-react";
import { PollWidget } from "@/components/poll-widget";
import { api } from "@/lib/api";
import { ModeSwitch } from "./mode-switch";

function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-right text-xs text-white/85 transition hover:bg-white/8">
      <span>{label}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-sky-500" : "bg-white/20"}`}><span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${checked ? "right-0.5" : "right-[18px]"}`} /></span>
    </button>
  );
}

function Pop({ title, onClose, children, wide }) {
  return (
    <div className={`absolute left-full top-0 z-40 ms-2 ${wide ? "w-[340px]" : "w-64"} max-h-[80vh] overflow-y-auto rounded-2xl border border-white/12 bg-[#0b1226]/96 p-2 shadow-2xl backdrop-blur-2xl`}>
      <div className="mb-1 flex items-center justify-between px-2 pt-1 text-xs font-semibold text-white"><span>{title}</span><button onClick={onClose} aria-label="بستن" className="grid size-6 place-items-center rounded-md hover:bg-white/10"><X className="size-3.5" /></button></div>
      {children}
    </div>
  );
}

function RailButton({ icon: Icon, label, active, danger, onClick, children }) {
  return (
    <div className="relative">
      <button onClick={onClick} title={label} aria-label={label} className={`grid size-10 place-items-center rounded-xl transition ${danger ? "text-rose-300 hover:bg-rose-500/20" : active ? "bg-sky-500 text-white" : "text-white/75 hover:bg-white/12"}`}><Icon className="size-[18px]" /></button>
      {children}
    </div>
  );
}

// Slim host control rail: everything that is not "talk / chat / files" lives here, out of the way.
export function ControlRail({ channel, settings, stage, files, mode, onMode, onSettings, onStage, flash, endsAt, recording, onRecording }) {
  const [open, setOpen] = useState(null);
  const toggle = (id) => setOpen((cur) => (cur === id ? null : id));
  const close = () => setOpen(null);
  const request = (kind) => api.meetingRequest(channel, { kind }).then(() => flash("درخواست ارسال شد.")).catch(() => {});
  const end = async (minutes) => { try { await api.meetingEnd(channel, minutes); if (minutes) flash(`کلاس ${minutes} دقیقهٔ دیگر بسته می‌شود.`); } catch (e) { flash(e.message); } close(); };
  const inline = files.filter((f) => f.inline);

  return (
    <nav aria-label="کنترل مدیر" className="flex w-12 shrink-0 flex-col items-center gap-1 rounded-2xl border border-white/10 bg-white/[.05] p-1 backdrop-blur-xl">
      <RailButton icon={PenTool} label="تخته" active={stage.boardOpen} onClick={() => onStage({ boardOpen: !stage.boardOpen })} />
      <RailButton icon={FileText} label="نمایش سند" active={Boolean(stage.content)} onClick={() => toggle("doc")}>
        {open === "doc" && <Pop title="نمایش سند برای همه" onClose={close}>
          {inline.length === 0 && <p className="p-3 text-center text-xs text-white/50">ابتدا از تب «فایل‌ها» یک PDF یا تصویر بارگذاری کنید.</p>}
          {inline.map((f) => <button key={f.id} onClick={() => { onStage({ fileId: f.id }); close(); }} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-xs hover:bg-white/10 ${stage.content?.id === f.id ? "text-emerald-300" : "text-white/85"}`}><Presentation className="size-3.5 shrink-0" /><span className="truncate">{f.name}</span></button>)}
          {stage.content && <button onClick={() => { onStage({ fileId: null }); close(); }} className="mt-1 w-full rounded-lg bg-rose-500/20 px-2 py-2 text-xs text-rose-100 hover:bg-rose-500/30">توقف نمایش</button>}
        </Pop>}
      </RailButton>
      <RailButton icon={BarChart3} label="نظرسنجی" active={open === "poll"} onClick={() => toggle("poll")}>
        {open === "poll" && <Pop title="نظرسنجی و آزمون" onClose={close} wide><PollWidget channel={channel} /></Pop>}
      </RailButton>
      <span className="my-0.5 h-px w-7 bg-white/10" />
      <RailButton icon={MicOff} label="قطع صدای همه" onClick={() => api.meetingMuteAll(channel).then(() => flash("صدای همه قطع شد.")).catch(() => {})} />
      <RailButton icon={Hand} label="درخواست از دانش‌آموزان" active={open === "req"} onClick={() => toggle("req")}>
        {open === "req" && <Pop title="درخواست از همه" onClose={close}>
          {[["screen", MonitorUp, "اشتراک صفحه"], ["camera", Video, "روشن کردن دوربین"], ["microphone", Mic, "روشن کردن میکروفون"]].map(([kind, Icon, label]) => <button key={kind} onClick={() => { request(kind); close(); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-xs text-white/85 hover:bg-white/10"><Icon className="size-3.5" />{label}</button>)}
        </Pop>}
      </RailButton>
      <RailButton icon={Circle} label={recording ? "توقف ضبط" : "ضبط کلاس"} active={recording} onClick={onRecording} />
      <RailButton icon={Settings2} label="تنظیمات کلاس" active={open === "set"} onClick={() => toggle("set")}>
        {open === "set" && <Pop title="تنظیمات کلاس" onClose={close}>
          <div className="px-2 pb-2"><ModeSwitch channel={channel} mode={mode} onChange={onMode} /></div>
          <Toggle checked={settings.showParticipantsToStudents} onChange={(v) => onSettings({ showParticipantsToStudents: v })} label="نمایش فهرست افراد به دانش‌آموز" />
          <Toggle checked={settings.studentsMayRaiseHand} onChange={(v) => onSettings({ studentsMayRaiseHand: v })} label="اجازهٔ بالا بردن دست" />
        </Pop>}
      </RailButton>
      <span className="my-0.5 h-px w-7 bg-white/10" />
      <RailButton icon={endsAt ? Timer : PhoneOff} label="پایان کلاس" danger onClick={() => toggle("end")}>
        {open === "end" && <Pop title="پایان کلاس" onClose={close}>
          <button onClick={() => end(0)} className="w-full rounded-lg bg-rose-500/90 px-2 py-2 text-xs font-medium text-white hover:bg-rose-400">پایان همین حالا</button>
          <p className="px-2 pb-1 pt-3 text-[11px] text-white/50">یا بعد از مدتی (شمارش معکوس برای همه):</p>
          <div className="grid grid-cols-4 gap-1.5 px-1">{[5, 10, 15, 30].map((m) => <button key={m} onClick={() => end(m)} className="rounded-lg bg-white/10 py-2 text-xs text-white hover:bg-white/18">{m}′</button>)}</div>
          {endsAt && <button onClick={() => { api.meetingCancelEnd(channel).catch(() => {}); close(); }} className="mt-2 w-full rounded-lg border border-white/15 px-2 py-2 text-xs text-white/85 hover:bg-white/8">لغو پایان زمان‌دار</button>}
        </Pop>}
      </RailButton>
    </nav>
  );
}
