"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { PollResultsChart } from "@/components/poll-results-chart";

export function PollWidget({ channel }) {
  const [poll, setPoll] = useState(null);
  const [votedOption, setVotedOption] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const p = await api.activePoll(channel);
        if (!cancelled) setPoll(p);
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

  if (!poll) return null;

  async function vote(optionId) {
    try {
      await api.votePoll(channel, poll.id, optionId);
      setVotedOption(optionId);
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(""), 3000);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{poll.question}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!poll.isOpen && <p className="text-sm text-muted-foreground">این نظرسنجی بسته شده است.</p>}
        {poll.options.map((o) => (
          <Button
            key={o.id}
            variant={votedOption === o.id ? "default" : "outline"}
            disabled={!poll.isOpen}
            onClick={() => vote(o.id)}
            className="justify-start"
          >
            {o.text}
          </Button>
        ))}
        {poll.showResults && poll.results && <PollResultsChart results={poll.results} />}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
