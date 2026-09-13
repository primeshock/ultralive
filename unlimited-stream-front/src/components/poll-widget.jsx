"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const isOpen = Boolean(poll.isOpen && (remaining === null || remaining > 0));

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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{poll.question}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{poll.mode === "quiz" ? "کوئیز" : "نظرسنجی"}</span>
          {remaining !== null && <span>زمان باقی‌مانده: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span>}
        </div>
        {!isOpen && <p className="text-sm text-muted-foreground">این نظرسنجی بسته شده است.</p>}
        {poll.options.map((o, index) => (
          <Button
            key={o.id}
            variant={selectedOption === o.id ? "default" : "outline"}
            disabled={!isOpen || Boolean(poll.votedOptionId)}
            onClick={() => setSelectedOption(o.id)}
            className="justify-start"
          >
            <span className="me-2 flex size-6 items-center justify-center rounded-full bg-black/10 text-xs font-bold">{index + 1}</span>
            <span className="flex-1 text-start">{o.text}</span>
            {poll.mode === "quiz" && poll.revealed && o.isCorrect !== undefined && <span>{o.isCorrect ? "✓ صحیح" : "✕ غلط"}</span>}
          </Button>
        ))}
        {!poll.votedOptionId && <Button onClick={submitVote} disabled={!selectedOption || !isOpen || submitting}>{submitting ? "در حال ثبت..." : "ثبت پاسخ"}</Button>}
        {poll.votedOptionId && <p className="text-xs text-muted-foreground">پاسخ شما ثبت شد و قابل تغییر نیست.</p>}
        {poll.showResults && poll.results && <PollResultsChart results={poll.results} />}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
