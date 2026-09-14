"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { PollResultsChart } from "@/components/poll-results-chart";

function AppleSwitch({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="relative h-6 w-11 rounded-full bg-black/15 transition peer-checked:bg-[#34c759] after:absolute after:start-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-md after:transition peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5" />
      {label}
    </label>
  );
}

export function ClassAdminPanel({ channel, thumbnailUrl, chatMode, showViewerCount, viewerCount, onChatMode, onViewerCount, onThumbnail }) {
  const [polls, setPolls] = useState([]);
  const [form, setForm] = useState({ question: "", mode: "poll", options: [{ text: "", isCorrect: false }, { text: "", isCorrect: false }], timerSeconds: "", showResults: false });
  const [ingress, setIngress] = useState(null);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState({});
  const [newOptions, setNewOptions] = useState({});

  useEffect(() => {
    async function load() {
      try {
        const list = await api.listPolls(channel);
        setPolls(list.filter((poll) => poll.isOpen));
        const loadedResults = await Promise.all(list.map(async (poll) => [poll._id, await api.pollResults(poll._id).catch(() => null)]));
        setResults(Object.fromEntries(loadedResults.filter(([, result]) => result)));
      } catch {
        setPolls([]);
      }
    }
    load();
  }, [channel]);

  function updateOption(index, value) {
    setForm((current) => ({ ...current, options: current.options.map((item, itemIndex) => itemIndex === index ? { ...item, text: value } : item) }));
  }

  async function createPoll(event) {
    event.preventDefault();
    try {
      const poll = await api.createPoll(channel, {
        question: form.question,
        mode: form.mode,
        options: form.options.filter((option) => option.text.trim()).map((option) => ({ text: option.text.trim(), isCorrect: form.mode === "quiz" && option.isCorrect })),
        timerSeconds: form.timerSeconds ? Number(form.timerSeconds) : undefined,
        showResults: form.showResults,
      });
      setPolls((current) => [poll, ...current]);
      setForm({ question: "", mode: "poll", options: [{ text: "", isCorrect: false }, { text: "", isCorrect: false }], timerSeconds: "", showResults: false });
      setMessage("ساخته شد");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function pollAction(id, action) {
    try {
      if (action === "close") await api.closePoll(id);
      if (action === "reveal") await api.revealPoll(id);
      if (action === "reset") await api.resetPoll(id);
      const list = await api.listPolls(channel);
      setPolls(action === "close" ? list.filter((poll) => poll.isOpen) : list);
      await loadResults(id);
      setMessage("انجام شد");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function toggleResults(poll, showResults) {
    const updated = await api.updatePoll(poll._id, { showResults });
    setPolls((current) => current.map((item) => item._id === updated._id ? updated : item));
  }

  async function addOption(poll) {
    const text = (newOptions[poll._id] || "").trim();
    if (!text) return;
    const updated = await api.addPollOption(poll._id, { text });
    setPolls((current) => current.map((item) => item._id === updated._id ? updated : item));
    setNewOptions((current) => ({ ...current, [poll._id]: "" }));
  }

  async function removeOption(poll, optionId) {
    const updated = await api.removePollOption(poll._id, optionId);
    setPolls((current) => current.map((item) => item._id === updated._id ? updated : item));
  }

  async function setCorrectOption(poll, optionId, isCorrect) {
    try {
      const updated = await api.setPollOptionCorrect(poll._id, optionId, isCorrect);
      setPolls((current) => current.map((item) => item._id === updated._id ? updated : item));
      setMessage("گزینه صحیح ذخیره شد.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadResults(pollId) {
    const result = await api.pollResults(pollId);
    setResults((current) => ({ ...current, [pollId]: result }));
  }

  async function createIngress() {
    try {
      setIngress(await api.createIngress(channel));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function uploadThumbnail(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await api.uploadChannelThumbnail(channel, file);
      onThumbnail(result.thumbnailUrl);
      setMessage("تامبنیل کلاس ذخیره شد");
    } catch (error) {
      setMessage(error.message);
    } finally {
      event.target.value = "";
    }
  }

  return (
    <section className="glass-panel flex flex-col gap-3 rounded-3xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">کنترل کلاس</strong>
        <Button size="sm" variant={chatMode === "private" ? "outline" : "default"} onClick={() => onChatMode("public")}>چت عمومی</Button>
        <Button size="sm" variant={chatMode === "private" ? "default" : "outline"} onClick={() => onChatMode("private")}>چت خصوصی</Button>
        <AppleSwitch checked={showViewerCount} onChange={onViewerCount} label="نمایش تعداد حاضرین" />
        <span className="rounded-full bg-black/5 px-3 py-1 text-xs dark:bg-white/10">حاضرین: {viewerCount}</span>
        <Button size="sm" variant="outline" onClick={createIngress}>دریافت کلید LiveKit</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-black/5 p-3 text-xs dark:bg-white/5">
        {thumbnailUrl && <img src={thumbnailUrl} alt="" className="size-14 rounded-xl object-cover" />}
        <div><p className="font-medium">تامبنیل کلاس</p><p className="text-muted-foreground">نسبت 16:9، پیشنهاد 1280×720</p></div>
        <label className="cursor-pointer rounded-full border px-3 py-2"><input type="file" accept="image/jpeg" className="hidden" onChange={uploadThumbnail} />انتخاب تصویر</label>
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
        {form.options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
            <Input placeholder={`گزینه ${index + 1}`} value={option.text} onChange={(event) => updateOption(index, event.target.value)} required />
            {form.mode === "quiz" && <label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" checked={option.isCorrect} onChange={(event) => setForm((current) => ({ ...current, options: current.options.map((item, itemIndex) => itemIndex === index ? { ...item, isCorrect: event.target.checked } : item) }))} /> صحیح</label>}
            {form.options.length > 2 && <Button type="button" size="sm" variant="ghost" onClick={() => setForm((current) => ({ ...current, options: current.options.filter((_, itemIndex) => itemIndex !== index) }))}>حذف</Button>}
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-black/5 p-3 dark:bg-white/5">
          <Button type="button" size="sm" variant="outline" onClick={() => setForm((current) => ({ ...current, options: [...current.options, { text: "", isCorrect: false }] }))}>+ افزودن گزینه</Button>
          <AppleSwitch checked={form.showResults} onChange={(showResults) => setForm((current) => ({ ...current, showResults }))} label="نمایش نتیجه برای دانش‌آموز" />
        </div>
        <Button type="submit" className="justify-self-start">ساخت سؤال</Button>
      </form>
      {polls.slice(0, 5).map((poll) => (
        <div key={poll._id} className="flex flex-col gap-3 border-t border-black/10 pt-3 text-sm dark:border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{poll.question}</span>
            <AppleSwitch checked={poll.showResults} onChange={(checked) => toggleResults(poll, checked)} label="نتیجه برای دانش‌آموز" />
          </div>
          <div className="grid gap-2">
            {poll.options.map((option, index) => <div key={option._id} className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span><span className="flex-1">{option.text}</span>{poll.mode === "quiz" && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={Boolean(option.isCorrect)} onChange={(event) => setCorrectOption(poll, option._id, event.target.checked)} /> صحیح</label>}{poll.options.length > 2 && <Button size="sm" variant="ghost" onClick={() => removeOption(poll, option._id)}>حذف</Button>}</div>)}
          </div>
          <div className="flex gap-2"><Input placeholder="گزینه جدید" value={newOptions[poll._id] || ""} onChange={(event) => setNewOptions((current) => ({ ...current, [poll._id]: event.target.value }))} /><Button size="sm" variant="outline" onClick={() => addOption(poll)}>افزودن</Button><Button size="sm" variant="outline" onClick={() => loadResults(poll._id)}>نمودار</Button></div>
          {results[poll._id] && <PollResultsChart results={results[poll._id].results} />}
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
