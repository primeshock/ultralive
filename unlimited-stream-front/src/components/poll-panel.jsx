"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function PollPanel({ channel }) {
  const [poll, setPoll] = useState(null);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.activePoll(channel);
        if (!cancelled) setPoll(data);
      } catch {
        if (!cancelled) setPoll(null);
      }
    }
    load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [channel]);

  async function vote() {
    if (!poll || !selected) return;
    try {
      await api.votePoll(channel, poll.id, selected);
      setMessage("رأی ثبت شد.");
    } catch (err) {
      setMessage(err.message);
    }
  }

  if (!poll) return null;
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="font-semibold">{poll.mode === "quiz" ? "کوئیز" : "نظرسنجی"}</div>
      <div>{poll.question}</div>
      <div className="space-y-2">
        {poll.options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 rounded-lg border p-2 cursor-pointer">
            <input type="radio" name={`poll-${poll.id}`} checked={selected === option.id} onChange={() => setSelected(option.id)} />
            <span>{option.text}</span>
          </label>
        ))}
      </div>
      <Button onClick={vote} disabled={!selected || !poll.isOpen}>ثبت پاسخ</Button>
      {poll.revealed && poll.results && <div className="space-y-1 pt-2 border-t">{poll.results.map(r => <div key={r.id} className="flex justify-between text-sm"><span>{r.text}{poll.mode === "quiz" && r.isCorrect ? " ✓" : ""}</span><b>{r.count}</b></div>)}</div>}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
