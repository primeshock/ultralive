"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export function ClassAdminPanel({ channel, chatMode, onChatMode }) {
  const [polls, setPolls] = useState([]);
  const [form, setForm] = useState({ question: "", mode: "poll", options: ["", ""], timerSeconds: "" });
  const [ingress, setIngress] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.listPolls(channel).then(setPolls).catch(() => {});
  }, [channel]);

  function updateOption(index, value) {
    setForm((current) => ({ ...current, options: current.options.map((item, itemIndex) => itemIndex === index ? value : item) }));
  }

  async function createPoll(event) {
    event.preventDefault();
    try {
      const poll = await api.createPoll(channel, {
        question: form.question,
        mode: form.mode,
        options: form.options.filter(Boolean).map((text) => ({ text })),
        timerSeconds: form.timerSeconds ? Number(form.timerSeconds) : undefined,
      });
      setPolls((current) => [poll, ...current]);
      setForm({ question: "", mode: "poll", options: ["", ""], timerSeconds: "" });
      setMessage("ساخته شد");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function pollAction(id, action) {
    if (action === "close") await api.closePoll(id);
    if (action === "reveal") await api.revealPoll(id);
    if (action === "reset") await api.resetPoll(id);
    setPolls(await api.listPolls(channel));
  }

  async function createIngress() {
    try {
      setIngress(await api.createIngress(channel));
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="border rounded-lg p-3 flex flex-col gap-3 bg-card">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">کنترل کلاس</strong>
        <Button size="sm" variant={chatMode === "private" ? "outline" : "default"} onClick={() => onChatMode("public")}>چت عمومی</Button>
        <Button size="sm" variant={chatMode === "private" ? "default" : "outline"} onClick={() => onChatMode("private")}>چت خصوصی</Button>
        <Button size="sm" variant="outline" onClick={createIngress}>دریافت کلید LiveKit</Button>
      </div>
      {ingress && <p className="text-xs break-all">Server: <code>{ingress.url}</code><br />Key: <code>{ingress.streamKey}</code></p>}
      <form onSubmit={createPoll} className="grid gap-2">
        <Input placeholder="سؤال یا کوئیز" value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} required />
        <div className="flex gap-2">
          <select className="border rounded-md h-9 px-2 text-sm bg-background" value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })}>
            <option value="poll">نظرسنجی</option>
            <option value="quiz">کوئیز</option>
          </select>
          <Input type="number" min="1" placeholder="زمان (ثانیه)" value={form.timerSeconds} onChange={(event) => setForm({ ...form, timerSeconds: event.target.value })} />
        </div>
        {form.options.map((option, index) => <Input key={index} placeholder={`گزینه ${index + 1}`} value={option} onChange={(event) => updateOption(index, event.target.value)} required />)}
        <Button type="submit" className="justify-self-start">ساخت سؤال</Button>
      </form>
      {polls.slice(0, 5).map((poll) => (
        <div key={poll._id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
          <span>{poll.question}</span>
          <span className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => pollAction(poll._id, "close")}>بستن</Button>
            <Button size="sm" variant="outline" onClick={() => pollAction(poll._id, "reveal")}>اعلام نتیجه</Button>
            <Button size="sm" variant="outline" onClick={() => pollAction(poll._id, "reset")}>ریست</Button>
          </span>
        </div>
      ))}
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </section>
  );
}
