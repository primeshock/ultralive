"use client";

import { useRef, useState } from "react";
import { Hand, Mic, Video, MonitorUp, UserX, Upload, FileText, Trash2, Presentation, Eye, X, Download, Image as ImageIcon, Film, Music } from "lucide-react";
import { api, API_URL } from "@/lib/api";
import { initials } from "./tiles";
import { Tip } from "./tip";

const QUALITY = { excellent: [3, "text-emerald-400", "عالی"], good: [2, "text-emerald-300", "خوب"], poor: [1, "text-amber-400", "ضعیف"], lost: [0, "text-rose-400", "قطع‌شدگی"] };

// Three-bar signal indicator fed by LiveKit's per-participant connectionQuality.
export function Quality({ value }) {
  const [level, tone, label] = QUALITY[value] || [-1, "text-white/25", "نامشخص"];
  return (
    <span title={`کیفیت اتصال: ${label}`} className={`flex items-end gap-px ${tone}`} aria-label={label}>
      {[1, 2, 3].map((i) => <span key={i} className={`w-[3px] rounded-sm bg-current ${i <= level ? "opacity-100" : "opacity-25"}`} style={{ height: 4 + i * 3 }} />)}
    </span>
  );
}

function Tag({ children, tone = "slate" }) {
  const tones = { slate: "bg-white/10 text-white/70", amber: "bg-amber-400/20 text-amber-200", sky: "bg-sky-400/20 text-sky-100", emerald: "bg-emerald-400/20 text-emerald-200" };
  return <span className={`rounded px-1.5 py-px text-[9px] leading-4 ${tones[tone]}`}>{children}</span>;
}

const mini = "grid size-6 place-items-center rounded-md bg-white/8 text-white/75 transition hover:bg-white/16 disabled:opacity-40";

// Compact participant row; host controls only appear for staff on non-staff participants.
export function ParticipantRow({ channel, data, isStaff, onChanged }) {
  const [busy, setBusy] = useState(false);
  const act = async (payload) => {
    setBusy(true);
    try { await api.meetingParticipantAction(channel, data.identity, payload); onChanged?.(); } catch { /* next refresh shows state */ } finally { setBusy(false); }
  };
  const controls = isStaff && !data.isStaff && !data.isLocal;
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${data.handRaised ? "border-amber-300/40 bg-amber-400/10" : "border-white/8 bg-white/[.03]"}`}>
      <div className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400/30 to-indigo-400/30 text-[11px] font-semibold text-white">{initials(data.name)}</span>
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-white/90">{data.name || data.identity}</p>
        <span className="flex shrink-0 items-center gap-1">
          {data.isStaff && <Tag tone="sky">مدیر</Tag>}
          {data.handRaised && <Hand className="size-3.5 text-amber-300" />}
          {data.presenter && <Presentation className="size-3.5 text-amber-300" />}
          {data.canPublish && !data.isStaff && !data.presenter && <Mic className="size-3 text-emerald-300" />}
          {isStaff && <Quality value={data.quality} />}
        </span>
      </div>
      {controls && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {[["microphone", Mic, "میکروفون"], ["camera", Video, "دوربین"], ["screen", MonitorUp, "اشتراک صفحه"]].map(([src, Icon, label]) => {
            const on = (data.sources || []).includes(src);
            return <button key={src} disabled={busy} title={on ? `لغو دسترسی ${label}` : `درخواست ${label}`} aria-label={label} onClick={() => act({ action: on ? "revoke-source" : "grant", source: src })} className={`grid size-6 place-items-center rounded-md transition disabled:opacity-40 ${on ? "bg-emerald-500/80 text-white" : "bg-white/8 text-white/70 hover:bg-white/16"}`}><Icon className="size-3.5" /></button>;
          })}
          <button disabled={busy} title={data.presenter ? "لغو ارائه‌دهنده" : "ارائه‌دهنده کردن (همهٔ دسترسی‌ها + کنترل محتوا)"} aria-label="ارائه‌دهنده" onClick={() => act({ action: "presenter", value: !data.presenter })} className={`grid size-6 place-items-center rounded-md transition disabled:opacity-40 ${data.presenter ? "bg-amber-400 text-slate-900" : "bg-white/8 text-white/70 hover:bg-white/16"}`}><Presentation className="size-3.5" /></button>
          {data.handRaised && <button disabled={busy} title="پایین آوردن دست" onClick={() => act({ action: "lower-hand" })} className={mini}><Hand className="size-3.5" /></button>}
          <button disabled={busy} title="حذف از کلاس" onClick={() => act({ action: "kick" })} className="grid size-6 place-items-center rounded-md bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 disabled:opacity-40"><UserX className="size-3.5" /></button>
        </div>
      )}
    </div>
  );
}

const PAGE = 60;

export function ParticipantsPanel({ channel, rows, isStaff, hiddenForStudents, onChanged }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  if (hiddenForStudents) {
    return <p className="m-3 rounded-xl border border-white/10 bg-white/5 p-3 text-center text-xs leading-6 text-white/60"><Eye className="mx-auto mb-1.5 size-4 opacity-60" />مدیر کلاس نمایش فهرست شرکت‌کنندگان را غیرفعال کرده است.</p>;
  }
  const sorted = [...rows].sort((a, b) => Number(b.handRaised) - Number(a.handRaised) || Number(b.isStaff) - Number(a.isStaff) || String(a.name).localeCompare(String(b.name), "fa"));
  const q = query.trim().toLowerCase();
  const filtered = q ? sorted.filter((r) => String(r.name || r.identity).toLowerCase().includes(q)) : sorted;
  const weak = isStaff ? rows.filter((r) => !r.isLocal && (r.quality === "poor" || r.quality === "lost")).length : 0;
  return (
    <div className="space-y-1.5 p-2">
      <div className="flex items-center justify-between px-1 text-[11px] text-white/50">
        <span>{rows.length} نفر در کلاس</span>
        {weak > 0 && <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-200">{weak} نفر اتصال ضعیف</span>}
      </div>
      {rows.length > 12 && <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="جست‌وجوی نام..." className="h-8 w-full rounded-lg border border-white/12 bg-black/20 px-2.5 text-xs text-white outline-none placeholder:text-white/35 focus:border-sky-400/50" />}
      {filtered.slice(0, limit).map((row) => <ParticipantRow key={row.identity} channel={channel} data={row} isStaff={isStaff} onChanged={onChanged} />)}
      {filtered.length > limit && <button onClick={() => setLimit((l) => l + PAGE)} className="w-full rounded-lg bg-white/8 py-2 text-xs text-white/80 hover:bg-white/14">نمایش {Math.min(PAGE, filtered.length - limit)} نفر دیگر ({filtered.length - limit} باقی‌مانده)</button>}
      {filtered.length === 0 && <p className="py-4 text-center text-xs text-white/45">موردی پیدا نشد.</p>}
    </div>
  );
}

function fmtSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function FileIcon({ mime }) {
  const cls = "size-4 shrink-0 text-sky-200";
  if (mime?.startsWith("image/")) return <ImageIcon className={cls} />;
  if (mime?.startsWith("video/")) return <Film className={cls} />;
  if (mime?.startsWith("audio/")) return <Music className={cls} />;
  return <FileText className={cls} />;
}

const act = "glass-btn grid size-7 shrink-0 place-items-center rounded-lg text-white/85 transition";

// Compact file list. The host decides per file whether students can see/download it (slider);
// whatever the host puts on stage is shown to everybody regardless.
export function FilesPanel({ channel, files, sharedId, isStaff, onChanged, onShare, recordings = [] }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (list) => {
    setBusy(true); setError("");
    try { for (const file of list) await api.meetingUpload(channel, file); onChanged?.(); } catch (err) { setError(err.message); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const setVisible = async (file, value) => { try { await api.meetingFileVisibility(channel, file.id, value); onChanged?.(); } catch (err) { setError(err.message); } };
  return (
    <div className="space-y-1.5 p-2">
      {isStaff && (
        <>
          <input ref={input} type="file" hidden multiple accept="application/pdf,image/*,video/*,audio/*,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,.zip" onChange={(e) => upload([...e.target.files])} />
          <button onClick={() => input.current?.click()} disabled={busy} className="glass-btn flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] text-white/90 disabled:opacity-50"><Upload className="size-3.5" />{busy ? "در حال بارگذاری..." : "بارگذاری فایل"}</button>
        </>
      )}
      {error && <p className="rounded-lg bg-rose-500/15 p-2 text-[11px] text-rose-200">{error}</p>}
      {files.length === 0 && <p className="py-6 text-center text-xs text-white/45">{isStaff ? "فایلی بارگذاری نشده است." : "هنوز فایلی برای شما ارسال نشده است."}</p>}
      {files.map((file) => {
        const live = sharedId === file.id;
        return (
          <div key={file.id} className={`rounded-lg border px-2 py-1.5 ${live ? "border-emerald-300/50 bg-emerald-400/10" : "border-white/8 bg-white/[.03]"}`}>
            <div className="flex items-center gap-2">
              <FileIcon mime={file.mime} />
              <p className="min-w-0 flex-1 truncate text-xs text-white/90" title={file.name}>{file.name}</p>
              <span className="shrink-0 text-[10px] text-white/40" dir="ltr">{fmtSize(file.size)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              {isStaff && (
                <button type="button" role="switch" aria-checked={file.studentVisible} onClick={() => setVisible(file, !file.studentVisible)} className="flex min-w-0 flex-1 items-center gap-1.5 text-[10.5px] text-white/65">
                  <span className={`relative h-[18px] w-8 shrink-0 rounded-full transition ${file.studentVisible ? "bg-sky-500" : "bg-white/20"}`}><span className={`absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-all ${file.studentVisible ? "right-[2px]" : "right-[16px]"}`} /></span>
                  <span className="truncate">برای دانش‌آموزان</span>
                </button>
              )}
              {!isStaff && <span className="flex-1" />}
              {isStaff && file.inline && <Tip label={live ? "توقف نمایش" : "نمایش برای همه"}><button onClick={() => onShare(live ? null : file.id)} aria-label="نمایش برای همه" data-active={live} className={`${act} data-[active=true]:!bg-emerald-500/70`}>{live ? <X className="size-3.5" /> : <Presentation className="size-3.5" />}</button></Tip>}
              <Tip label="دریافت"><a href={`${API_URL}${file.url}`} target="_blank" rel="noopener noreferrer" aria-label="دریافت" className={act}><Download className="size-3.5" /></a></Tip>
              {isStaff && <Tip label="حذف"><button aria-label="حذف" onClick={async () => { await api.meetingDeleteFile(channel, file.id); onChanged?.(); }} className={`${act} !text-rose-300`}><Trash2 className="size-3.5" /></button></Tip>}
            </div>
          </div>
        );
      })}
      {isStaff && recordings.length > 0 && (
        <div className="space-y-1.5 border-t border-white/10 pt-2.5">
          <p className="px-1 text-[11px] text-white/50">ضبط‌های کلاس</p>
          {recordings.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[.03] px-2 py-1.5 text-[11px] text-white/80">
              <span>{new Date(r.startedAt).toLocaleString("fa-IR")} {r.durationSeconds ? `· ${Math.round(r.durationSeconds / 60)} دقیقه` : ""}</span>
              {r.url ? <a href={r.url.startsWith("/") ? `${API_URL}${r.url}` : r.url} className="glass-btn rounded-md px-2 py-0.5 text-white">دانلود</a> : <span className="text-white/45">{r.status === "failed" ? "ناموفق" : "در حال پردازش"}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
