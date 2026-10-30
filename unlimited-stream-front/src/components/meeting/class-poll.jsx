"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Check, X, Plus, Timer, Lock, Eye, RotateCcw, Trash2, Trash } from "lucide-react";
import { api } from "@/lib/api";

const COLORS = ["#38bdf8", "#34d399", "#fbbf24", "#fb7185", "#a78bfa", "#22d3ee"]; // taste-skill-ignore (chart data hues)
const TIMERS = [["", "بدون زمان"], ["30", "۳۰ ثانیه"], ["60", "۱ دقیقه"], ["120", "۲ دقیقه"], ["300", "۵ دقیقه"]];
const blank = () => ({ question: "", mode: "poll", options: [{ text: "", isCorrect: false }, { text: "", isCorrect: false }], timerSeconds: "", showResults: false });

// Staff docs (_id / isOpen) and the student view (id / votingOpen) are folded into one shape.
function normalize(raw, results) {
  if (!raw) return null;
  const id = String(raw.id || raw._id);
  const counts = Object.fromEntries((results?.results || raw.results || []).map((r) => [String(r.optionId || r.id), r.count]));
  const closesAt = raw.closesAt ? new Date(raw.closesAt).getTime() : null;
  return {
    id, question: raw.question, mode: raw.mode, showResults: Boolean(raw.showResults), revealed: Boolean(raw.revealed),
    voted: raw.votedOptionId || null, closesAt, isOpen: raw.votingOpen ?? (Boolean(raw.isOpen) && (!closesAt || closesAt > Date.now())),
    hasResults: Boolean(results || raw.results),
    options: raw.options.map((o) => ({ id: String(o.id || o._id), text: o.text, isCorrect: o.isCorrect, count: counts[String(o.id || o._id)] || 0 })),
  };
}

function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
      <span className={`relative h-[18px] w-8 shrink-0 rounded-full transition ${checked ? "bg-[var(--accent)]" : "bg-[var(--s3)]"}`}><span className={`absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-[right] ${checked ? "right-[2px]" : "right-[16px]"}`} /></span>
      {label}
    </button>
  );
}

function Left({ closesAt }) {
  const [now, setNow] = useState(0);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (!closesAt) return null;
  const s = Math.max(0, Math.round((closesAt - (now || closesAt - 1000)) / 1000));
  return <span className="flex items-center gap-1 text-[11px] tabular-nums text-amber-200" dir="ltr"><Timer className="size-3" />{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}

function Bars({ poll, audience, isStaff }) {
  const total = poll.options.reduce((a, o) => a + o.count, 0);
  const showCorrect = poll.mode === "quiz" && (poll.revealed || isStaff);
  let cursor = 0;
  const donut = poll.options.map((o, i) => { const from = total ? (cursor / total) * 360 : 0; cursor += o.count; return `${COLORS[i % COLORS.length]} ${from}deg ${total ? (cursor / total) * 360 : 360}deg`; }).join(",");
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2.5">
        <span className="size-9 shrink-0 rounded-full taste-skill-ignore" style={{ background: total ? `conic-gradient(${donut})` : "rgba(255,255,255,.12)" }}><span className="m-[7px] grid size-[22px] place-items-center rounded-full bg-[var(--s1)] text-[11px] tabular-nums text-[var(--ink)]">{total}</span></span>
        <p className="text-[11px] leading-5 text-[var(--ink-3)]">{total} رأی{isStaff && audience > 0 ? ` از ${audience} نفر (${Math.round((total / audience) * 100)}٪ مشارکت)` : ""}</p>
      </div>
      {poll.options.map((o, i) => {
        const pct = total ? Math.round((o.count / total) * 100) : 0;
        return (
          <div key={o.id} className="relative overflow-hidden rounded-md bg-[var(--s1)] px-2 py-1">
            <span className="absolute inset-y-0 right-0 opacity-30" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
            <span className="relative flex items-center justify-between gap-2 text-[12px]">
              <span className="flex min-w-0 items-center gap-1 truncate">{showCorrect && o.isCorrect && <Check className="size-3 shrink-0 text-emerald-300" />}{o.text}{poll.voted === o.id && <span className="text-[11px] text-[var(--accent-ink)]">(پاسخ شما)</span>}</span>
              <span className="shrink-0 tabular-nums text-[var(--ink-2)]">{o.count} · {pct}٪</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Creator({ channel, onDone, onCancel }) {
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setOpt = (i, patch) => setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? { ...o, ...patch } : patch.isCorrect ? { ...o, isCorrect: false } : o)) }));
  const field = "w-full rounded-md border border-[var(--line-strong)] bg-[var(--ground)] px-2 py-1.5 text-[12px] text-white outline-none placeholder:text-[var(--ink-3)] focus:border-[var(--accent)]";
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await api.createPoll(channel, { question: form.question.trim(), mode: form.mode, timerSeconds: form.timerSeconds || undefined, showResults: form.showResults, options: form.options.filter((o) => o.text.trim()).map((o) => ({ text: o.text.trim(), isCorrect: form.mode === "quiz" && o.isCorrect })) });
      onDone();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-1.5">
      <div className="flex gap-1">{[["poll", "نظرسنجی"], ["quiz", "آزمون"]].map(([v, l]) => <button key={v} type="button" onClick={() => set({ mode: v })} className={`flex-1 rounded-md py-1 text-[11px] ${form.mode === v ? "bg-[var(--accent)] text-white" : "bg-[var(--s2)] text-[var(--ink-2)]"}`}>{l}</button>)}</div>
      <input className={field} placeholder="سؤال..." value={form.question} onChange={(e) => set({ question: e.target.value })} maxLength={500} required />
      {form.options.map((o, i) => (
        <div key={i} className="flex items-center gap-1">
          {form.mode === "quiz" && <button type="button" title="پاسخ صحیح" onClick={() => setOpt(i, { isCorrect: !o.isCorrect })} className={`grid size-5 shrink-0 place-items-center rounded-full border ${o.isCorrect ? "border-emerald-400 bg-emerald-400/30 text-emerald-200" : "border-[var(--line-strong)] text-transparent taste-skill-ignore"}`}><Check className="size-3" /></button>}
          <input className={field} placeholder={`گزینهٔ ${i + 1}`} value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} maxLength={120} />
          {form.options.length > 2 && <button type="button" onClick={() => set({ options: form.options.filter((_, j) => j !== i) })} className="text-[var(--ink-3)] hover:text-rose-300" aria-label="حذف گزینه"><Trash2 className="size-3.5" /></button>}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        {form.options.length < 8 && <button type="button" onClick={() => set({ options: [...form.options, { text: "", isCorrect: false }] })} className="flex items-center gap-1 rounded-md bg-[var(--s2)] px-2 py-1 text-[11px] text-[var(--ink-2)] hover:bg-[var(--s3)]"><Plus className="size-3" />گزینه</button>}
        <select value={form.timerSeconds} onChange={(e) => set({ timerSeconds: e.target.value })} className="rounded-md border border-[var(--line-strong)] bg-[var(--s1)] px-1.5 py-1 text-[11px] text-[var(--ink)]">{TIMERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <Switch checked={form.showResults} onChange={(v) => set({ showResults: v })} label="نتیجهٔ زنده" />
      </div>
      {error && <p className="text-[11px] text-rose-300">{error}</p>}
      <div className="flex gap-1.5"><button disabled={busy} className="flex-1 rounded-md bg-[var(--accent)] py-1.5 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">{busy ? "..." : "انتشار"}</button><button type="button" onClick={onCancel} className="rounded-md bg-[var(--s2)] px-3 text-[12px] text-[var(--ink-2)] hover:bg-[var(--s3)]">انصراف</button></div>
    </form>
  );
}

/**
 * Compact poll / quiz dock shown right above the chat input.
 * Students: vote, then see minimal results once voting ends. Host: create, watch live stats, close, reveal, reset.
 */
export function ClassPoll({ channel, isStaff, audience = 0, tick = 0, onChange, variant = "float" }) {
  const [poll, setPoll] = useState(null);
  const [creating, setCreating] = useState(false);
  const [dismissed, setDismissed] = useState(null);
  const [pick, setPick] = useState(null);
  const [error, setError] = useState("");
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      if (isStaff) {
        const list = await api.listPolls(channel);
        const latest = list.find((p) => Array.isArray(p.options)) || null;
        const results = latest ? await api.pollResults(latest._id).catch(() => null) : null;
        if (alive.current) setPoll(normalize(latest, results));
      } else {
        const active = await api.activePoll(channel);
        if (alive.current) setPoll(normalize(active, null));
      }
    } catch { /* keep the last known poll on a network blip */ }
  }, [channel, isStaff]);

  useEffect(() => {
    alive.current = true;
    const kick = setTimeout(load, 0);
    const id = setInterval(load, isStaff ? 4000 : 12000);
    return () => { alive.current = false; clearTimeout(kick); clearInterval(id); };
  }, [load, isStaff, tick]);

  const act = async (fn) => { setError(""); try { await fn(); await load(); onChange?.(); } catch (e) { setError(e.message); } };
  const vote = () => act(() => api.votePoll(channel, poll.id, pick));

  const shell = variant === "dock"
    ? "poll-in mx-2 mb-1.5 rounded-lg border border-[var(--line)] bg-[var(--s1)] p-2.5 text-white"
    : "poll-in w-[304px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-[var(--line-strong)] bg-[var(--pop)]/95 p-3 text-white shadow-2xl backdrop-blur-xl";
  if (isStaff && creating) return <div className={shell}><Creator channel={channel} onCancel={() => setCreating(false)} onDone={() => { setCreating(false); load(); onChange?.(); }} /></div>;

  if (!poll) {
    if (!isStaff) return null;
    return <div className={`${shell} flex items-center justify-between gap-2`}><span className="flex items-center gap-1.5 text-[12px] text-[var(--ink-2)]"><BarChart3 className="size-3.5" />نظرسنجی فعالی نیست</span><button onClick={() => setCreating(true)} className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium hover:bg-[var(--accent-hover)]">ساخت</button></div>;
  }
  if (!isStaff && dismissed === poll.id) return null;

  const finished = !poll.isOpen;
  const resultsVisible = isStaff || finished || poll.showResults || Boolean(poll.voted && poll.hasResults);
  return (
    <div className={shell}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--accent-ink)]"><BarChart3 className="size-3" />{poll.mode === "quiz" ? "آزمون" : "نظرسنجی"}{finished ? " · پایان‌یافته" : ""}</span>
        <span className="flex items-center gap-2">{!finished && <Left closesAt={poll.closesAt} />}{!isStaff && <button onClick={() => setDismissed(poll.id)} aria-label="بستن" className="text-[var(--ink-3)] hover:text-white"><X className="size-3.5" /></button>}</span>
      </div>
      <p className="mb-1.5 text-[13px] font-medium leading-5">{poll.question}</p>

      {!isStaff && !finished && !poll.voted ? (
        <div className="space-y-1">
          {poll.options.map((o) => (
            <button key={o.id} onClick={() => setPick(o.id)} className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-start text-[12px] transition ${pick === o.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--s1)] hover:bg-[var(--s2)]"}`}>
              <span className={`size-3 shrink-0 rounded-full border ${pick === o.id ? "border-[var(--accent)] bg-[var(--accent)]" : "border-white/30"}`} />{o.text}
            </button>
          ))}
          <button disabled={!pick} onClick={vote} className="w-full rounded-md bg-[var(--accent)] py-1.5 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-40">ثبت پاسخ</button>
        </div>
      ) : resultsVisible && poll.hasResults ? <Bars poll={poll} audience={audience} isStaff={isStaff} />
        : <p className="py-1 text-[12px] text-[var(--ink-3)]">{finished ? "رأی‌گیری بسته شد." : "پاسخ شما ثبت شد؛ نتیجه پس از پایان نمایش داده می‌شود."}</p>}

      {isStaff && (
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-[var(--line)] pt-1.5">
          {!finished && <button onClick={() => act(() => api.closePoll(poll.id))} className="flex items-center gap-1 rounded-md bg-[var(--s2)] px-2 py-1 text-[11px] hover:bg-[var(--s3)]"><Lock className="size-3" />بستن رأی‌گیری</button>}
          {poll.mode === "quiz" && !poll.revealed && <button onClick={() => act(() => api.revealPoll(poll.id))} className="flex items-center gap-1 rounded-md bg-[var(--s2)] px-2 py-1 text-[11px] hover:bg-[var(--s3)]"><Eye className="size-3" />نمایش پاسخ</button>}
          <button onClick={() => act(() => api.resetPoll(poll.id))} className="flex items-center gap-1 rounded-md bg-[var(--s2)] px-2 py-1 text-[11px] hover:bg-[var(--s3)]"><RotateCcw className="size-3" />ریست</button>
          <Switch checked={poll.showResults} onChange={(v) => act(() => api.updatePoll(poll.id, { showResults: v }))} label="نتیجه برای دانش‌آموز" />
          <button onClick={() => { if (window.confirm("این نظرسنجی و رأی‌هایش حذف شود؟")) act(() => api.deletePoll(poll.id).then(() => setPoll(null))); }} title="حذف نظرسنجی" aria-label="حذف نظرسنجی" className="grid size-6 place-items-center rounded-md bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"><Trash className="size-3" /></button>
          <button onClick={() => setCreating(true)} className="ms-auto flex items-center gap-1 rounded-md bg-[var(--accent)] px-2 py-1 text-[11px] font-medium hover:bg-[var(--accent-hover)]"><Plus className="size-3" />جدید</button>
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-rose-300">{error}</p>}
    </div>
  );
}
