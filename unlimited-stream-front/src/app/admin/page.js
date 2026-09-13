"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LiveChat } from "@/components/live-chat";

const tabs = [
  ["overview", "داشبورد"], ["class", "کلاس و استریم"], ["students", "دانش‌آموزان"],
  ["moderation", "مدیریت و بن"], ["chat", "چت"], ["polls", "نظرسنجی و کوئیز"], ["monitor", "مانیتور"],
];

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [channels, setChannels] = useState([]);
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !["admin", "owner"].includes(user.role))) router.replace("/login");
  }, [loading, user, router]);

  async function loadChannels() {
    try { const data = await api.adminChannels(); setChannels(data); if (!selected && data[0]) setSelected(data[0].username); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { if (user && ["admin", "owner"].includes(user.role)) loadChannels(); }, [user]);

  const channel = useMemo(() => channels.find((c) => c.username === selected) || null, [channels, selected]);
  if (loading || !user) return <div className="flex-1 grid place-items-center">در حال بارگذاری...</div>;
  if (!["admin", "owner"].includes(user.role)) return null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">پنل مدیریت استریم</h1><p className="text-sm text-muted-foreground">دسترسی عملیاتی سراسری به تمام کلاس‌ها</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={loadChannels}>بروزرسانی</Button>{user.role === "owner" && <Button variant="outline" onClick={() => router.push("/owner")}>پنل Owner</Button>}</div>
      </div>
      {error && <div className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</div>}
      <div className="grid lg:grid-cols-[240px_1fr] gap-4">
        <aside className="rounded-xl border p-2 h-fit space-y-1">
          {tabs.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`w-full text-right rounded-lg px-3 py-2 text-sm ${tab === id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</button>)}
          <div className="border-t my-2" />
          <div className="px-2 py-1 text-xs text-muted-foreground">کلاس فعال</div>
          {channels.map((c) => <button key={c.username} onClick={() => { setSelected(c.username); setTab("class"); }} className={`w-full text-right rounded-lg px-3 py-2 text-sm ${selected === c.username ? "bg-muted font-semibold" : "hover:bg-muted"}`}>{c.displayName || c.username}{c.isLive ? " • LIVE" : ""}</button>)}
          {!channels.length && <p className="px-2 py-3 text-xs text-muted-foreground">کلاسی وجود ندارد.</p>}
        </aside>
        <section className="min-w-0">
          {tab === "overview" && <Overview channels={channels} onCreate={async () => { const username = prompt("نام کلاس (username)"); if (!username) return; const displayName = prompt("نام نمایشی", username) || username; setCreating(true); try { await api.createChannel({ username, displayName }); await loadChannels(); } catch (e) { setError(e.message); } finally { setCreating(false); } }} creating={creating} />}
          {tab === "class" && channel && <ClassSettings channel={channel} refresh={loadChannels} />}
          {tab === "students" && channel && <Students channel={channel.username} />}
          {tab === "moderation" && channel && <ModerationPanel channel={channel.username} />}
          {tab === "chat" && channel && <div className="h-[70dvh]"><LiveChat channel={channel.username} initialEnabled={channel.chatEnabled} /></div>}
          {tab === "polls" && channel && <PollsPanel channel={channel.username} />}
          {tab === "monitor" && channel && <MonitorPanel channel={channel.username} />}
          {!channel && tab !== "overview" && <div className="rounded-xl border p-8 text-center text-muted-foreground">ابتدا یک کلاس را انتخاب کنید.</div>}
        </section>
      </div>
    </div>
  );
}

function Overview({ channels, onCreate, creating }) {
  const live = channels.filter((c) => c.isLive).length;
  return <div className="grid sm:grid-cols-3 gap-4"><Stat title="کلاس‌ها" value={channels.length}/><Stat title="لایو فعال" value={live}/><div className="rounded-xl border p-5"><div className="text-sm text-muted-foreground mb-3">عملیات</div><Button onClick={onCreate} disabled={creating}>{creating ? "در حال ساخت..." : "ساخت کلاس"}</Button></div></div>;
}
function Stat({ title, value }) { return <div className="rounded-xl border p-5"><div className="text-sm text-muted-foreground">{title}</div><div className="text-3xl font-bold mt-2">{value}</div></div>; }

function ClassSettings({ channel, refresh }) {
  const [form, setForm] = useState({ displayName: channel.displayName || "", streamTitle: channel.streamTitle || "", donateUrl: channel.donateUrl || "", chatEnabled: channel.chatEnabled !== false, chatMode: channel.chatMode || "public" });
  const [msg, setMsg] = useState("");
  async function save() { try { await api.updateChannel(channel.username, form); setMsg("ذخیره شد."); refresh(); } catch (e) { setMsg(e.message); } }
  async function regenerate() { if (!confirm("کلید فعلی از کار می‌افتد. ادامه؟")) return; const r = await api.regenerateChannelKey(channel.username); setMsg(`کلید جدید: ${r.streamKey}`); refresh(); }
  return <div className="space-y-4"><Card title={`کلاس ${channel.username}`}><div className="grid md:grid-cols-2 gap-3"><Field label="نام نمایشی" value={form.displayName} onChange={(v) => setForm({...form, displayName:v})}/><Field label="عنوان استریم" value={form.streamTitle} onChange={(v) => setForm({...form, streamTitle:v})}/><Field label="لینک دونیت" value={form.donateUrl} onChange={(v) => setForm({...form, donateUrl:v})}/><label className="text-sm flex items-center gap-2 mt-6"><input type="checkbox" checked={form.chatEnabled} onChange={(e)=>setForm({...form,chatEnabled:e.target.checked})}/> چت فعال</label><label className="text-sm">حالت چت<select className="mt-1 w-full rounded-md border bg-background p-2" value={form.chatMode} onChange={(e)=>setForm({...form,chatMode:e.target.value})}><option value="public">عمومی</option><option value="private">خصوصی</option></select></label></div><div className="flex flex-wrap gap-2 mt-4"><Button onClick={save}>ذخیره</Button><Button variant="outline" onClick={regenerate}>ساخت کلید جدید</Button></div>{msg&&<p className="text-sm text-muted-foreground mt-3 break-all">{msg}</p>}</Card><Card title="اتصال OBS / LiveKit"><p className="text-xs text-muted-foreground">Fallback RTMP Server</p><code className="block rounded bg-muted p-2 mt-1 break-all">{channel.rtmpServer || "از آدرس سرور /live استفاده کنید"}</code><p className="text-xs text-muted-foreground mt-3">Fallback Stream Key</p><code className="block rounded bg-muted p-2 mt-1 break-all">{channel.streamKeyField || `${channel.username}?key=${channel.streamKey}`}</code><div className="border-t mt-4 pt-4"><Button variant="outline" onClick={async()=>{try{const r=await api.livekitIngress(channel.username);alert(`Server: ${r.url}\nStream Key: ${r.streamKey}`)}catch(e){alert(e.message)}}}>ساخت LiveKit Ingress</Button><p className="text-xs text-muted-foreground mt-2">بعد از فعال‌سازی LiveKit در سرور، این دکمه URL و Stream Key مخصوص OBS را می‌سازد.</p></div></Card></div>;
}

function Students({ channel }) {
  const [active, setActive] = useState([]); const [attendance, setAttendance] = useState([]);
  async function load(){ try { setActive(await api.activeStudents(channel)); setAttendance(await api.attendance(channel)); } catch {} }
  useEffect(()=>{load(); const id=setInterval(load,5000); return ()=>clearInterval(id);},[channel]);
  return <div className="space-y-4"><Card title="دانش‌آموزان فعال"><Table headers={["نام","شناسه","آخرین فعالیت"]} rows={active.map(x=>[x.displayName||"-",x.externalUserId,new Date(x.lastSeenAt).toLocaleString("fa-IR")])}/></Card><Card title="حضور و غیاب"><Table headers={["نام","شناسه","ورود"]} rows={attendance.slice(0,100).map(x=>[x.displayName||"-",x.externalUserId,new Date(x.joinedAt).toLocaleString("fa-IR")])}/></Card></div>;
}

function ModerationPanel({ channel }) {
  const [list,setList]=useState([]); const [id,setId]=useState(""); const [type,setType]=useState("mute"); const [scope,setScope]=useState("timed"); const [minutes,setMinutes]=useState(30); const [reason,setReason]=useState(""); const [msg,setMsg]=useState("");
  async function load(){try{setList(await api.moderation(channel));}catch(e){setMsg(e.message)}} useEffect(()=>{load()},[channel]);
  async function add(){try{await api.moderate(channel,{externalUserId:id,type,scope,minutes:Number(minutes),reason});setId("");setMsg("انجام شد");load()}catch(e){setMsg(e.message)}}
  return <div className="space-y-4"><Card title="بن / میوت دانش‌آموز"><div className="grid md:grid-cols-2 gap-3"><Field label="شناسه دانش‌آموز" value={id} onChange={setId}/><Field label="دلیل" value={reason} onChange={setReason}/><label className="text-sm">نوع<select className="mt-1 w-full rounded border p-2 bg-background" value={type} onChange={e=>setType(e.target.value)}><option value="mute">Mute</option><option value="ban">Ban</option></select></label><label className="text-sm">مدت<select className="mt-1 w-full rounded border p-2 bg-background" value={scope} onChange={e=>setScope(e.target.value)}><option value="timed">زمان‌دار</option><option value="permanent">دائمی</option></select></label>{scope==='timed'&&<Field label="دقیقه" value={minutes} onChange={setMinutes} type="number"/>}</div><Button className="mt-4" onClick={add} disabled={!id}>اعمال</Button>{msg&&<p className="text-sm mt-2">{msg}</p>}</Card><Card title="محدودیت‌های ثبت‌شده"><Table headers={["نوع","شناسه","وضعیت","دلیل","عملیات"]} rows={list.map(x=>[x.type,x.externalUserId,x.scope,x.reason||"-",<Button key={x._id} size="sm" variant="outline" onClick={async()=>{await api.deleteModeration(x._id);load()}}>حذف</Button>])}/></Card></div>;
}

function PollsPanel({ channel }) {
  const [polls,setPolls]=useState([]); const [question,setQuestion]=useState(""); const [mode,setMode]=useState("poll"); const [options,setOptions]=useState(["",""]); const [timer,setTimer]=useState(0); const [revealAt,setRevealAt]=useState(""); const [correctIndex,setCorrectIndex]=useState(0); const [msg,setMsg]=useState("");
  async function load(){try{setPolls(await api.polls(channel))}catch(e){setMsg(e.message)}} useEffect(()=>{load()},[channel]);
  async function create(){try{await api.createPoll(channel,{question,mode,options:options.map((text,i)=>({text,isCorrect:mode==="quiz"&&i===Number(correctIndex)})).filter(o=>o.text),timerSeconds:Number(timer)||0,revealAt:revealAt?new Date(revealAt).toISOString():null});setQuestion("");setOptions(["",""]);setMsg("ساخته شد");load()}catch(e){setMsg(e.message)}}
  return <div className="space-y-4"><Card title="ساخت نظرسنجی / کوئیز"><Field label="سؤال" value={question} onChange={setQuestion}/><div className="grid md:grid-cols-2 gap-2 mt-3">{options.map((v,i)=><Field key={i} label={`گزینه ${i+1}`} value={v} onChange={x=>setOptions(options.map((o,j)=>j===i?x:o))}/>)}</div><div className="flex flex-wrap gap-2 mt-3"><Button variant="outline" onClick={()=>setOptions([...options,""])}>افزودن گزینه</Button><select className="rounded border p-2 bg-background" value={mode} onChange={e=>setMode(e.target.value)}><option value="poll">نظرسنجی</option><option value="quiz">کوئیز</option></select><Input className="w-32" type="number" value={timer} onChange={e=>setTimer(e.target.value)} placeholder="ثانیه"/><Input className="w-56" type="datetime-local" value={revealAt} onChange={e=>setRevealAt(e.target.value)} />{mode==="quiz"&&<select className="rounded border p-2 bg-background" value={correctIndex} onChange={e=>setCorrectIndex(e.target.value)}>{options.map((_,i)=><option key={i} value={i}>پاسخ صحیح: گزینه {i+1}</option>)}</select>}</div><Button className="mt-3" onClick={create} disabled={!question||options.filter(Boolean).length<2}>ساخت</Button>{msg&&<p className="text-sm mt-2">{msg}</p>}</Card><Card title="نظرسنجی‌ها"><div className="space-y-2">{polls.map(p=><div key={p._id} className="rounded-lg border p-3 flex flex-wrap items-center gap-2 justify-between"><div><b>{p.question}</b><div className="text-xs text-muted-foreground">{p.mode} · {p.isOpen?'باز':'بسته'}</div></div><div className="flex gap-1"><Button size="sm" variant="outline" onClick={()=>api.closePoll(p._id).then(load)}>بستن</Button><Button size="sm" variant="outline" onClick={()=>api.revealPoll(p._id).then(load)}>نمایش نتیجه</Button><Button size="sm" variant="outline" onClick={()=>api.resetPoll(p._id).then(load)}>ریست</Button><Button size="sm" onClick={async()=>{const r=await api.pollResults(p._id);alert(r.results.map(x=>`${x.text}: ${x.count}`).join("\n"))}}>نتایج</Button></div></div>)}</div></Card></div>;
}

function MonitorPanel({ channel }) { const [url,setUrl]=useState(""); const [test,setTest]=useState(""); return <div className="space-y-4"><Card title="مانیتور"><Button onClick={async()=>setUrl((await api.monitorLink(channel)).url)}>ساخت لینک مانیتور</Button>{url&&<code className="block mt-3 p-3 bg-muted rounded break-all">{url}</code>}<Button variant="outline" className="mt-2" onClick={async()=>setTest((await api.testLink(channel,"کاربر تستی")).url)}>ساخت لینک تست دانش‌آموز</Button>{test&&<code className="block mt-3 p-3 bg-muted rounded break-all">{test}</code>}</Card></div>; }

function Card({title,children}){return <div className="rounded-xl border bg-card p-5"><h2 className="font-semibold mb-4">{title}</h2>{children}</div>}
function Field({label,value,onChange,type="text"}){return <label className="text-sm block">{label}<Input className="mt-1" type={type} value={value} onChange={e=>onChange(e.target.value)}/></label>}
function Table({headers,rows}){return <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{headers.map(h=><th key={h} className="text-right border-b p-2 whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j} className="border-b p-2 align-top">{c}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="text-sm text-muted-foreground p-3">موردی وجود ندارد.</p>}</div>}
