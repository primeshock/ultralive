"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

function Bar({ label, count, total, isCorrect, revealed }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="text-sm">
      <div className="flex justify-between mb-0.5">
        <span>
          {label} {revealed && isCorrect && <span className="text-green-600">✓ درست</span>}
        </span>
        <span className="text-muted-foreground">{count} ({pct}%)</span>
      </div>
      <div className="h-2 rounded bg-muted overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [channels, setChannels] = useState([]);
  const [selected, setSelected] = useState("");
  const [msg, setMsg] = useState("");
  const [classForm, setClassForm] = useState({ username: "", password: "", displayName: "", streamTitle: "" });

  const [testLink, setTestLink] = useState("");
  const [monitorLink, setMonitorLink] = useState("");
  const [ingressInfo, setIngressInfo] = useState(null);
  const [modList, setModList] = useState([]);
  const [activeStudents, setActiveStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [modForm, setModForm] = useState({ externalUserId: "", type: "mute", scope: "timed", minutes: 10, reason: "" });

  const [pollForm, setPollForm] = useState({ question: "", mode: "poll", options: ["", ""], timerSeconds: "", revealAt: "" });
  const [polls, setPolls] = useState([]); // locally tracked created polls (session-only list)
  const [results, setResults] = useState({}); // pollId -> results

  useEffect(() => {
    if (!loading && (!user || !["admin", "owner"].includes(user.role))) router.replace("/");
  }, [loading, user, router]);

  useEffect(() => {
    if (user && ["admin", "owner"].includes(user.role)) {
      api.myManagedChannels().then((list) => {
        setChannels(list);
        if (list[0]) setSelected(list[0].username);
      });
    }
  }, [user]);

  useEffect(() => {
    if (!selected) return;
    refreshChannelData();
    const id = setInterval(refreshChannelData, 15000);
    return () => clearInterval(id);
  }, [selected]);

  async function refreshChannelData() {
    const [mod, active, att, pollList] = await Promise.all([
      api.listModeration(selected).catch(() => []),
      api.activeStudents(selected).catch(() => []),
      api.attendance(selected).catch(() => []),
      api.listPolls(selected).catch(() => []),
    ]);
    setModList(mod);
    setActiveStudents(active);
    setAttendance(att);
    setPolls(pollList);
  }

  function flash(text) {
    setMsg(text);
    setTimeout(() => setMsg(""), 2500);
  }

  async function handleChatMode(mode) {
    try {
      await api.setChatMode(selected, mode);
      setChannels((cs) => cs.map((c) => (c.username === selected ? { ...c, chatMode: mode } : c)));
      flash(`حالت چت: ${mode === "private" ? "خصوصی" : "عمومی"}`);
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleTestLink() {
    try {
      const { url } = await api.createTestLink(selected, "دانش‌آموز تستی");
      setTestLink(url);
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleCreateClass(e) {
    e.preventDefault();
    try {
      const channel = await api.createManagedChannel(classForm);
      setChannels((current) => [...current, channel]);
      setSelected(channel.username);
      setClassForm({ username: "", password: "", displayName: "", streamTitle: "" });
      flash("کلاس ساخته شد.");
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleMonitorLink() {
    try {
      const { url } = await api.createMonitorLink(selected);
      setMonitorLink(url);
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleCreateIngress() {
    try {
      const info = await api.createIngress(selected);
      setIngressInfo(info);
    } catch (err) {
      flash(err.message || "LiveKit فعال نیست.");
    }
  }

  async function handleModerate(e) {
    e.preventDefault();
    try {
      await api.moderate(selected, { ...modForm, minutes: modForm.scope === "timed" ? Number(modForm.minutes) : undefined });
      setModForm({ ...modForm, externalUserId: "", reason: "" });
      flash("اعمال شد.");
      refreshChannelData();
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleRemoveModeration(id) {
    await api.removeModeration(id);
    refreshChannelData();
  }

  function updateOption(i, val) {
    setPollForm((f) => ({ ...f, options: f.options.map((o, idx) => (idx === i ? val : o)) }));
  }
  function addOption() {
    setPollForm((f) => ({ ...f, options: [...f.options, ""] }));
  }
  function removeOption(i) {
    setPollForm((f) => ({ ...f, options: f.options.filter((_, idx) => idx !== i) }));
  }

  async function handleCreatePoll(e) {
    e.preventDefault();
    try {
      const payload = {
        question: pollForm.question,
        mode: pollForm.mode,
        options: pollForm.options.filter((o) => o.trim()).map((text) => ({ text })),
        timerSeconds: pollForm.timerSeconds ? Number(pollForm.timerSeconds) : undefined,
        revealAt: pollForm.revealAt || undefined,
      };
      const poll = await api.createPoll(selected, payload);
      setPolls((p) => [poll, ...p]);
      setPollForm({ question: "", mode: "poll", options: ["", ""], timerSeconds: "", revealAt: "" });
      flash("نظرسنجی ساخته شد.");
    } catch (err) {
      flash(err.message);
    }
  }

  async function loadResults(pollId) {
    const r = await api.pollResults(pollId);
    setResults((prev) => ({ ...prev, [pollId]: r }));
  }

  async function handlePollAction(pollId, action) {
    if (action === "close") await api.closePoll(pollId);
    if (action === "reveal") await api.revealPoll(pollId);
    if (action === "reset") await api.resetPoll(pollId);
    loadResults(pollId);
  }

  if (loading || !user || !["admin", "owner"].includes(user.role)) {
    return <div className="flex-1 flex items-center justify-center">در حال بارگذاری...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl w-full px-4 py-8 flex-1 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">پنل ادمین</h1>
      {msg && <p className="text-sm text-primary">{msg}</p>}

      <Card>
        <CardHeader><CardTitle>ساخت کلاس جدید</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleCreateClass} className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="نام کاربری کلاس، مثل algebra1" value={classForm.username} onChange={(e) => setClassForm({ ...classForm, username: e.target.value })} required />
            <Input type="password" placeholder="رمز داخلی کلاس" value={classForm.password} onChange={(e) => setClassForm({ ...classForm, password: e.target.value })} required minLength={8} />
            <Input placeholder="نام نمایشی کلاس" value={classForm.displayName} onChange={(e) => setClassForm({ ...classForm, displayName: e.target.value })} />
            <Input placeholder="عنوان استریم" value={classForm.streamTitle} onChange={(e) => setClassForm({ ...classForm, streamTitle: e.target.value })} />
            <Button type="submit" className="sm:col-span-2 justify-self-start">ساخت کلاس</Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Label>کلاس</Label>
        <select className="border rounded-md h-9 px-2 text-sm bg-background" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {channels.map((c) => (
            <option key={c.username} value={c.username}>
              {c.username} {c.isLive ? "· لایو" : ""}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <>
          {/* Chat mode + links */}
          <Card>
            <CardHeader><CardTitle>چت و دسترسی</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">حالت چت:</span>
                <Button size="sm" variant={channels.find((c) => c.username === selected)?.chatMode !== "private" ? "default" : "outline"} onClick={() => handleChatMode("public")}>عمومی</Button>
                <Button size="sm" variant={channels.find((c) => c.username === selected)?.chatMode === "private" ? "default" : "outline"} onClick={() => handleChatMode("private")}>خصوصی</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleTestLink}>ساخت لینک تست دانش‌آموز</Button>
                {testLink && <Input readOnly value={testLink} onFocus={(e) => e.target.select()} className="text-xs" />}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleMonitorLink}>ساخت لینک مانیتور (بدون لاگین)</Button>
                {monitorLink && <Input readOnly value={monitorLink} onFocus={(e) => e.target.select()} className="text-xs" />}
              </div>
              <div className="flex flex-col gap-1">
                <Button size="sm" variant="outline" className="self-start" onClick={handleCreateIngress}>
                  فعال‌سازی LiveKit برای این کلاس (تجربی)
                </Button>
                {ingressInfo && (
                  <p className="text-xs text-muted-foreground">
                    RTMP LiveKit: <code>{ingressInfo.url}</code> — کلید: <code>{ingressInfo.streamKey}</code>
                    <br />همین یک مقصد را در OBS استفاده کن.
                  </p>
                )}
                {channels.find((c) => c.username === selected)?.streamKey && (
                  <p className="text-xs text-muted-foreground">کلید داخلی کلاس: <code>{channels.find((c) => c.username === selected).streamKey}</code></p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Moderation */}
          <Card>
            <CardHeader><CardTitle>بن / میوت</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <form onSubmit={handleModerate} className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1.5">
                  <Label>شناسه کاربر (externalUserId)</Label>
                  <Input value={modForm.externalUserId} onChange={(e) => setModForm({ ...modForm, externalUserId: e.target.value })} required />
                </div>
                <select className="border rounded-md h-9 px-2 text-sm bg-background" value={modForm.type} onChange={(e) => setModForm({ ...modForm, type: e.target.value })}>
                  <option value="mute">میوت</option>
                  <option value="ban">بن</option>
                </select>
                <select className="border rounded-md h-9 px-2 text-sm bg-background" value={modForm.scope} onChange={(e) => setModForm({ ...modForm, scope: e.target.value })}>
                  <option value="timed">تایمی</option>
                  <option value="permanent">دائمی</option>
                </select>
                {modForm.scope === "timed" && (
                  <div className="grid gap-1.5">
                    <Label>دقیقه</Label>
                    <Input type="number" min="1" className="w-20" value={modForm.minutes} onChange={(e) => setModForm({ ...modForm, minutes: e.target.value })} />
                  </div>
                )}
                <Button type="submit" variant="destructive">اعمال</Button>
              </form>
              <Separator />
              <ul className="text-sm flex flex-col gap-1">
                {modList.map((m) => (
                  <li key={m._id} className="flex items-center justify-between">
                    <span>
                      {m.externalUserId} — {m.type === "ban" ? "بن" : "میوت"} ({m.scope === "permanent" ? "دائم" : new Date(m.expiresAt).toLocaleString("fa-IR")})
                    </span>
                    <button className="text-xs text-primary underline" onClick={() => handleRemoveModeration(m._id)}>لغو</button>
                  </li>
                ))}
                {modList.length === 0 && <li className="text-muted-foreground">موردی نیست.</li>}
              </ul>
            </CardContent>
          </Card>

          {/* Attendance */}
          <Card>
            <CardHeader><CardTitle>حضور و غیاب</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium mb-1">فعال الان ({activeStudents.length})</p>
                <ul className="text-sm text-muted-foreground flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                  {activeStudents.map((s) => (
                    <li key={s._id}>{s.externalUserId} — {new Date(s.lastSeenAt).toLocaleTimeString("fa-IR")}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">تاریخچه ورود</p>
                <ul className="text-sm text-muted-foreground flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                  {attendance.map((a, i) => (
                    <li key={i}>{a.displayName || a.externalUserId} — {new Date(a.joinedAt).toLocaleString("fa-IR")}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Polls */}
          <Card>
            <CardHeader><CardTitle>نظرسنجی / کوئیز</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <form onSubmit={handleCreatePoll} className="flex flex-col gap-2">
                <Input placeholder="سوال" value={pollForm.question} onChange={(e) => setPollForm({ ...pollForm, question: e.target.value })} required />
                <div className="flex gap-2">
                  <select className="border rounded-md h-9 px-2 text-sm bg-background" value={pollForm.mode} onChange={(e) => setPollForm({ ...pollForm, mode: e.target.value })}>
                    <option value="poll">نظرسنجی</option>
                    <option value="quiz">کوئیز</option>
                  </select>
                  <Input type="number" placeholder="تایمر (ثانیه، اختیاری)" value={pollForm.timerSeconds} onChange={(e) => setPollForm({ ...pollForm, timerSeconds: e.target.value })} />
                  <Input type="datetime-local" value={pollForm.revealAt} onChange={(e) => setPollForm({ ...pollForm, revealAt: e.target.value })} title="زمان اعلام نتیجه (اختیاری)" />
                </div>
                {pollForm.options.map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder={`گزینه ${i + 1}`} value={o} onChange={(e) => updateOption(i, e.target.value)} />
                    {pollForm.options.length > 2 && (
                      <button type="button" onClick={() => removeOption(i)} className="text-xs text-destructive">حذف</button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addOption} className="self-start">+ افزودن گزینه</Button>
                <Button type="submit" className="self-start">ساخت نظرسنجی</Button>
              </form>

              <Separator />
              <div className="flex flex-col gap-4">
                {polls.map((p) => {
                  const r = results[p._id];
                  const total = r?.results.reduce((s, o) => s + o.count, 0) || 0;
                  return (
                    <div key={p._id} className="border rounded-lg p-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{p.question} <Badge variant="outline">{p.mode === "quiz" ? "کوئیز" : "نظرسنجی"}</Badge></p>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => loadResults(p._id)}>نتایج</Button>
                          <Button size="sm" variant="outline" onClick={() => handlePollAction(p._id, "close")}>بستن</Button>
                          <Button size="sm" variant="outline" onClick={() => handlePollAction(p._id, "reveal")}>اعلام نتیجه</Button>
                          <Button size="sm" variant="outline" onClick={() => handlePollAction(p._id, "reset")}>ریست</Button>
                        </div>
                      </div>
                      {r && (
                        <div className="flex flex-col gap-1.5">
                          {r.results.map((o) => (
                            <Bar key={o.optionId} label={o.text} count={o.count} total={total} isCorrect={o.isCorrect} revealed={r.revealed} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {polls.length === 0 && <p className="text-sm text-muted-foreground">هنوز نظرسنجی‌ای در این جلسه نساختی.</p>}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
