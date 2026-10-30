"use client";

import { useRef, useState } from "react";
import { Hand, Mic, Video, MonitorUp, UserX, MicOff, Lock, Upload, FileText, Trash2, Presentation, Eye, Check, X, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import { initials } from "./tiles";

function Pill({ children, tone = "slate" }) {
  const tones = { slate: "bg-white/10 text-white/80", amber: "bg-amber-400/20 text-amber-200", sky: "bg-sky-400/20 text-sky-100", emerald: "bg-emerald-400/20 text-emerald-200" };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] ${tones[tone]}`}>{children}</span>;
}

const SOURCE_LABEL = { microphone: "میکروفون", camera: "دوربین", screen: "صفحه" };

// One row per participant. `controls` renders host-only actions (allow / mute / remove...).
export function ParticipantRow({ channel, data, isStaff, onChanged }) {
  const [busy, setBusy] = useState(false);
  const act = async (payload) => {
    setBusy(true);
    try { await api.meetingParticipantAction(channel, data.identity, payload); onChanged?.(); } catch { /* surfaced by next refresh */ } finally { setBusy(false); }
  };
  const btn = "grid size-8 place-items-center rounded-lg bg-white/8 text-white/80 transition hover:bg-white/15 disabled:opacity-40";
  return (
    <div className={`rounded-xl border p-2.5 ${data.handRaised ? "border-amber-300/40 bg-amber-400/10" : "border-white/8 bg-white/[.04]"}`}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400/30 to-indigo-400/30 text-sm font-semibold text-white ring-1 ring-white/10">{initials(data.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{data.name || data.identity}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {data.isStaff && <Pill tone="sky">مدیر</Pill>}
            {data.handRaised && <Pill tone="amber">دست بالا</Pill>}
            {data.canPublish && !data.isStaff && <Pill tone="emerald">دسترسی فعال</Pill>}
            {data.publishing?.length > 0 && !data.isStaff && <Pill>{data.publishing.map((s) => SOURCE_LABEL[s] || s).join("، ")}</Pill>}
          </div>
        </div>
      </div>
      {isStaff && !data.isStaff && !data.isLocal && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {!data.canPublish ? (
            <button disabled={busy} onClick={() => act({ action: "allow", sources: ["microphone", "camera"] })} className="flex items-center gap-1.5 rounded-lg bg-sky-500/90 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-400 disabled:opacity-50">
              <Mic className="size-3.5" /> درخواست فعال‌سازی
            </button>
          ) : (
            <>
              <button disabled={busy} title="قطع میکروفون و دوربین" onClick={() => act({ action: "mute" })} className={btn}><MicOff className="size-4" /></button>
              <button disabled={busy} title="اجازه اشتراک صفحه" onClick={() => act({ action: "allow", sources: ["microphone", "camera", "screen", "screen_audio"] })} className={btn}><MonitorUp className="size-4" /></button>
              <button disabled={busy} title="لغو دسترسی" onClick={() => act({ action: "revoke" })} className={btn}><Lock className="size-4" /></button>
            </>
          )}
          {data.handRaised && <button disabled={busy} title="پایین آوردن دست" onClick={() => act({ action: "lower-hand" })} className={btn}><Hand className="size-4" /></button>}
          <button disabled={busy} title="حذف از کلاس" onClick={() => act({ action: "kick" })} className="grid size-8 place-items-center rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 disabled:opacity-40"><UserX className="size-4" /></button>
        </div>
      )}
    </div>
  );
}

export function ParticipantsPanel({ channel, rows, isStaff, hiddenForStudents, onChanged }) {
  if (hiddenForStudents) {
    return <p className="m-4 rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm leading-7 text-white/60"><Eye className="mx-auto mb-2 size-5 opacity-60" />مدیر کلاس نمایش فهرست شرکت‌کنندگان را برای دانش‌آموزان غیرفعال کرده است.</p>;
  }
  const sorted = [...rows].sort((a, b) => Number(b.handRaised) - Number(a.handRaised) || Number(b.isStaff) - Number(a.isStaff) || String(a.name).localeCompare(String(b.name), "fa"));
  return (
    <div className="space-y-2 p-3">
      <p className="px-1 text-xs text-white/50">{sorted.length} نفر در کلاس</p>
      {sorted.map((row) => <ParticipantRow key={row.identity} channel={channel} data={row} isStaff={isStaff} onChanged={onChanged} />)}
    </div>
  );
}

function fmtSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FilesPanel({ channel, files, sharedId, isStaff, onChanged }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (list) => {
    setBusy(true); setError("");
    try { for (const file of list) await api.meetingUpload(channel, file); onChanged?.(); } catch (err) { setError(err.message); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const share = async (fileId) => { try { await api.meetingContent(channel, fileId); onChanged?.(); } catch (err) { setError(err.message); } };
  return (
    <div className="space-y-3 p-3">
      {isStaff && (
        <>
          <input ref={input} type="file" hidden multiple accept="application/pdf,image/*,video/*,audio/*,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,.zip" onChange={(e) => upload([...e.target.files])} />
          <button onClick={() => input.current?.click()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-sky-300/40 bg-sky-400/10 px-3 py-4 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 disabled:opacity-50">
            <Upload className="size-4" /> {busy ? "در حال بارگذاری..." : "بارگذاری PDF، تصویر، ویدیو یا صوت"}
          </button>
        </>
      )}
      {error && <p className="rounded-lg bg-rose-500/15 p-2 text-xs text-rose-200">{error}</p>}
      {sharedId && isStaff && <button onClick={() => share(null)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/20 px-3 py-2 text-sm text-rose-100 hover:bg-rose-500/30"><X className="size-4" /> توقف نمایش محتوا</button>}
      {files.length === 0 && <p className="py-6 text-center text-sm text-white/45">فایلی برای این کلاس بارگذاری نشده است.</p>}
      {files.map((file) => (
        <div key={file.id} className={`rounded-xl border p-3 ${sharedId === file.id ? "border-emerald-300/50 bg-emerald-400/10" : "border-white/8 bg-white/[.04]"}`}>
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 size-5 shrink-0 text-sky-200" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white" title={file.name}>{file.name}</p>
              <p className="mt-0.5 text-xs text-white/45" dir="ltr">{fmtSize(file.size)}</p>
            </div>
          </div>
          <div className="mt-2.5 flex gap-1.5">
            {isStaff && file.inline && (
              <button onClick={() => share(file.id)} disabled={sharedId === file.id} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-500/90 px-2 py-1.5 text-xs font-medium text-white hover:bg-sky-400 disabled:bg-emerald-500/60">
                {sharedId === file.id ? <><Check className="size-3.5" /> در حال نمایش</> : <><Presentation className="size-3.5" /> نمایش برای همه</>}
              </button>
            )}
            <a href={file.url} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/8 px-2 py-1.5 text-xs text-white/85 hover:bg-white/15"><Volume2 className="hidden" />دریافت</a>
            {isStaff && <button title="حذف" onClick={async () => { await api.meetingDeleteFile(channel, file.id); onChanged?.(); }} className="grid size-8 place-items-center rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"><Trash2 className="size-4" /></button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label, hint }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[.04] p-3 text-right transition hover:bg-white/[.07]">
      <span><span className="block text-sm font-medium text-white">{label}</span>{hint && <span className="mt-0.5 block text-xs text-white/45">{hint}</span>}</span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-sky-500" : "bg-white/20"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${checked ? "right-0.5" : "right-[22px]"}`} /></span>
    </button>
  );
}

export function ManagePanel({ channel, settings, onSettings, onMuteAll, onRequestAll }) {
  return (
    <div className="space-y-2.5 p-3">
      <Switch checked={settings.showParticipantsToStudents} onChange={(v) => onSettings({ showParticipantsToStudents: v })} label="نمایش فهرست شرکت‌کنندگان به دانش‌آموزان" hint="مدیر همیشه فهرست را می‌بیند." />
      <Switch checked={settings.studentsMayRaiseHand} onChange={(v) => onSettings({ studentsMayRaiseHand: v })} label="اجازهٔ بالا بردن دست" hint="اگر خاموش باشد دکمهٔ «دست بالا» برای دانش‌آموزان پنهان می‌شود." />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onMuteAll} className="flex items-center justify-center gap-2 rounded-xl bg-white/8 px-3 py-3 text-sm text-white hover:bg-white/14"><MicOff className="size-4" /> قطع صدای همه</button>
        <button onClick={() => onRequestAll("screen")} className="flex items-center justify-center gap-2 rounded-xl bg-white/8 px-3 py-3 text-sm text-white hover:bg-white/14"><MonitorUp className="size-4" /> درخواست صفحه از همه</button>
        <button onClick={() => onRequestAll("camera")} className="flex items-center justify-center gap-2 rounded-xl bg-white/8 px-3 py-3 text-sm text-white hover:bg-white/14"><Video className="size-4" /> درخواست دوربین</button>
        <button onClick={() => onRequestAll("microphone")} className="flex items-center justify-center gap-2 rounded-xl bg-white/8 px-3 py-3 text-sm text-white hover:bg-white/14"><Mic className="size-4" /> درخواست میکروفون</button>
      </div>
    </div>
  );
}
