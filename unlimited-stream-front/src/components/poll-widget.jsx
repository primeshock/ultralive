"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { PollResultsChart } from "@/components/poll-results-chart";

export function PollWidget({ channel }) {
  const [poll, setPoll] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [clock, setClock] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const pollIdRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const p = await api.activePoll(channel);
        if (!cancelled) {
          setPoll(p);
          setSelectedOption((current) => {
            if (pollIdRef.current !== p?.id) {
              pollIdRef.current = p?.id;
              return p?.votedOptionId || null;
            }
            return p?.votedOptionId || current;
          });
        }
      } catch {
        if (!cancelled) setPoll(null);
      }
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [channel]);

  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!poll) return null;

  const remaining = poll.closesAt ? Math.max(0, Math.ceil((new Date(poll.closesAt).getTime() - clock) / 1000)) : null;
  const isOpen = Boolean(poll.isOpen);

  async function submitVote() {
    if (!selectedOption || poll.votedOptionId || !isOpen || submitting) return;
    setSubmitting(true);
    try {
      await api.votePoll(channel, poll.id, selectedOption);
      setPoll((current) => ({ ...current, votedOptionId: selectedOption }));
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(""), 3000);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="glass-float rounded-[1.75rem] p-5 text-white">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div><p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200/65">{poll.mode === "quiz" ? "Quick quiz" : "Live poll"}</p><h2 className="text-lg font-semibold">{poll.question}</h2></div>
        <div className={`rounded-full px-3 py-1 text-xs ${remaining === 0 ? "bg-amber-400/15 text-amber-200" : "bg-white/8 text-white/60"}`}>{remaining !== null && `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</div>
      </div>
        <div className="mb-3 flex items-center justify-between text-xs text-white/45">
          <span>{poll.mode === "quiz" ? "کوئیز" : "نظرسنجی"}</span>
        </div>
        {remaining === 0 && isOpen && <p className="mb-2 text-sm text-amber-200/75">زمان پیشنهادی تمام شده است؛ تا زمان بستن توسط مدیر، پاسخ‌گویی باز است.</p>}
        {!isOpen && <p className="mb-2 text-sm text-white/50">این نظرسنجی بسته شده است.</p>}
        {poll.options.map((o, index) => (
          <Button
            key={o.id}
            variant="outline"
            disabled={!isOpen || Boolean(poll.votedOptionId)}
            onClick={() => setSelectedOption(o.id)}
            className={`relative h-12 w-full justify-start overflow-hidden border-white/12 bg-white/[0.055] text-white hover:bg-white/10 ${selectedOption === o.id ? "border-cyan-300/70 bg-cyan-300/12 shadow-[0_0_24px_rgb(34_211_238_/_0.14)]" : ""}`}
          >
            <span className="me-2 flex size-6 items-center justify-center rounded-full bg-black/10 text-xs font-bold">{index + 1}</span>
            <span className="flex-1 text-start">{o.text}</span>
            {poll.mode === "quiz" && poll.revealed && o.isCorrect !== undefined && <span>{o.isCorrect ? "✓ صحیح" : "✕ غلط"}</span>}
          </Button>
        ))}
        {!poll.votedOptionId && <Button onClick={submitVote} disabled={!selectedOption || !isOpen || submitting} className="accent-gradient mt-2 rounded-full text-white">{submitting ? "در حال ثبت..." : "ثبت پاسخ"}</Button>}
        {poll.votedOptionId && <p className="text-xs text-white/50">پاسخ شما ثبت شد و قابل تغییر نیست.</p>}
        {poll.showResults && poll.results && <PollResultsChart results={poll.results} />}
        {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
