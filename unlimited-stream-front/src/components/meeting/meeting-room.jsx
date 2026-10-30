"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, Hand, MessageSquare, Users, FolderOpen, PhoneOff, Settings2, BarChart3, Clock, Maximize2, Lock, Loader2, WifiOff } from "lucide-react";
import { LiveChat } from "@/components/live-chat";
import { PollWidget } from "@/components/poll-widget";
import { api } from "@/lib/api";
import { useClassRoom } from "./use-room";
import { AudioSink, ParticipantTile, VideoSurface, trackOf } from "./tiles";
import { ContentViewer } from "./content-viewer";
import { ParticipantsPanel, FilesPanel, ManagePanel } from "./panels";
import { ModeSwitch } from "./mode-switch";

function useTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const id = setInterval(() => setSeconds((s) => s + 1), 1000); return () => clearInterval(id); }, []);
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function ToolButton({ icon: Icon, label, onClick, active, danger, locked, disabled, badge }) {
  const tone = danger ? "bg-rose-500 text-white hover:bg-rose-400" : active ? "bg-sky-500 text-white hover:bg-sky-400" : "bg-white/10 text-white hover:bg-white/18";
  return (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`group relative flex flex-col items-center gap-1 rounded-2xl px-3.5 py-2.5 text-[11px] font-medium transition disabled:opacity-40 ${tone}`}>
      <Icon className="size-5" />
      <span className="hidden whitespace-nowrap sm:block">{label}</span>
      {locked && <Lock className="absolute left-1.5 top-1.5 size-3 text-amber-300" />}
      {badge > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-900">{badge}</span>}
    </button>
  );
}

const TABS = [
  { id: "people", label: "افراد", icon: Users },
  { id: "chat", label: "چت", icon: MessageSquare },
  { id: "files", label: "فایل‌ها", icon: FolderOpen },
  { id: "polls", label: "نظرسنجی", icon: BarChart3 },
  { id: "manage", label: "مدیریت", icon: Settings2, staffOnly: true },
];

export function MeetingRoom({ channel, title, organization, appearance, appearanceStyle, mode, onModeChange, isStaff, chatEnabled, livekitSettings, initialSettings, onLeave }) {
  const [settings, setSettings] = useState({ showParticipantsToStudents: initialSettings?.showParticipantsToStudents !== false, studentsMayRaiseHand: initialSettings?.studentsMayRaiseHand !== false });
  const [content, setContent] = useState(null);
  const [files, setFiles] = useState([]);
  const [tab, setTab] = useState("people");
  const [sidebar, setSidebar] = useState(true);
  const [pinned, setPinned] = useState(null);
  const [notice, setNotice] = useState(null);
  const [request, setRequest] = useState(null);
  const localRef = useRef(null);
  const timer = useTimer();

  const refreshState = useCallback(async () => {
    try {
      const state = await api.meetingState(channel);
      setSettings((cur) => ({ ...cur, ...state.settings }));
      setContent(state.settings.sharedContent || null);
      setFiles(state.files || []);
    } catch { /* keep last known state */ }
  }, [channel]);

  const flash = useCallback((text) => { setNotice(text); setTimeout(() => setNotice(null), 4000); }, []);

  const onData = useCallback((message) => {
    if (message.type === "content") { setContent(message.content || null); refreshState(); }
    else if (message.type === "settings") setSettings((cur) => ({ ...cur, ...message.settings }));
    else if (message.type === "mode") onModeChange?.(message.mode);
    else if (message.type === "request") setRequest(message.kind);
    else if (message.type === "lower-hand") localRef.current?.setAttributes({ hand: "0" }).catch(() => {});
  }, [refreshState, onModeChange]);

  const { room, state, error } = useClassRoom({ channel, livekitSettings, onData });
  useEffect(() => {
    let alive = true;
    api.meetingState(channel).then((state) => {
      if (!alive) return;
      setSettings((cur) => ({ ...cur, ...state.settings }));
      setContent(state.settings.sharedContent || null);
      setFiles(state.files || []);
    }).catch(() => {});
    return () => { alive = false; };
  }, [channel]);

  const local = room?.localParticipant;
  useEffect(() => { localRef.current = local || null; });

  const participants = room ? [room.localParticipant, ...room.remoteParticipants.values()].filter((p) => !p.identity.startsWith("ingress:") && !p.identity.startsWith("monitor:")) : [];
  const handRaisedLocally = local?.attributes?.hand === "1";
  const canPublish = Boolean(local?.permissions?.canPublish);
  const micOn = Boolean(local && trackOf(local, "microphone"));
  const camOn = Boolean(local && trackOf(local, "camera"));
  const screenOn = Boolean(local && trackOf(local, "screen_share"));
  const handCount = participants.filter((p) => p.attributes?.hand === "1").length;

  const screenSharer = participants.find((p) => trackOf(p, "screen_share"));
  const screenTrack = screenSharer ? trackOf(screenSharer, "screen_share") : null;
  const pinnedParticipant = participants.find((p) => p.identity === pinned);
  const presenting = content ? "content" : screenTrack ? "screen" : pinnedParticipant ? "pinned" : null;

  const rows = participants.map((p) => ({
    identity: p.identity, name: p.name, isLocal: p.isLocal, isStaff: p.identity.startsWith("staff:"),
    handRaised: p.attributes?.hand === "1", canPublish: Boolean(p.permissions?.canPublish),
    publishing: ["microphone", "camera", "screen_share"].filter((s) => trackOf(p, s)).map((s) => (s === "screen_share" ? "screen" : s)),
  }));

  async function toggle(kind) {
    if (!local) return;
    if (!canPublish) {
      flash("دسترسی انتشار برای شما فعال نیست؛ دست خود را بالا ببرید تا مدیر فعال کند.");
      if (settings.studentsMayRaiseHand) local.setAttributes({ hand: "1" }).catch(() => {});
      return;
    }
    try {
      if (kind === "mic") await local.setMicrophoneEnabled(!micOn);
      else if (kind === "cam") await local.setCameraEnabled(!camOn);
      else await local.setScreenShareEnabled(!screenOn, { audio: true, contentHint: "detail", selfBrowserSurface: "exclude", surfaceSwitching: "include" });
    } catch (err) { flash(err?.name === "NotAllowedError" ? "مرورگر اجازهٔ دسترسی را نداد." : "فعال‌سازی انجام نشد."); }
  }

  function toggleHand() {
    const next = !handRaisedLocally;
    local?.setAttributes({ hand: next ? "1" : "0" }).catch(() => {});
  }

  async function answerRequest() {
    const kind = request;
    setRequest(null);
    await toggle(kind === "microphone" ? "mic" : kind === "camera" ? "cam" : "screen");
  }

  const visibleTabs = TABS.filter((t) => !t.staffOnly || isStaff);
  const hidePeople = !isStaff && !settings.showParticipantsToStudents;
  const strip = presenting ? participants.filter((p) => trackOf(p, "camera") || p.isLocal || p.identity.startsWith("staff:")) : participants;

  if (state === "failed") {
    return <div className="grid h-full place-items-center p-8 text-center text-white"><div><WifiOff className="mx-auto mb-3 size-8 text-rose-300" /><p className="font-medium">اتصال به کلاس برقرار نشد</p><p className="mt-1 text-sm text-white/55">{error}</p><button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-sky-500 px-4 py-2 text-sm">تلاش دوباره</button></div></div>;
  }

  return (
    <div dir="rtl" data-appearance={appearance || "aurora"} style={appearanceStyle} className="spatial-shell relative flex h-dvh flex-col overflow-hidden text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/8 bg-white/[.03] px-4 py-2.5 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-lg shadow-sky-500/20"><Video className="size-5" /></span>
          <div className="min-w-0"><h1 className="truncate text-sm font-semibold">{title}</h1><p className="truncate text-xs text-white/50">{organization || "کلاس آنلاین"}</p></div>
        </div>
        <div className="flex items-center gap-2">
          {isStaff && <ModeSwitch channel={channel} mode={mode} onChange={onModeChange} className="hidden md:inline-flex" />}
          <span className="flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1.5 text-xs tabular-nums" dir="ltr"><Clock className="size-3.5 text-sky-300" />{timer}</span>
          <span className="hidden items-center gap-1.5 rounded-full bg-white/8 px-3 py-1.5 text-xs sm:flex"><Users className="size-3.5 text-sky-300" />{participants.length}</span>
          <button onClick={() => setSidebar((v) => !v)} className="grid size-9 place-items-center rounded-xl bg-white/8 hover:bg-white/15 lg:hidden" aria-label="پنل کناری"><MessageSquare className="size-4" /></button>
          <button onClick={() => document.documentElement.requestFullscreen?.()} className="hidden size-9 place-items-center rounded-xl bg-white/8 hover:bg-white/15 lg:grid" aria-label="تمام‌صفحه"><Maximize2 className="size-4" /></button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <main className="flex min-w-0 flex-1 flex-col gap-3">
          {state !== "connected" && !room ? (
            <div className="grid flex-1 place-items-center text-white/60"><div className="text-center"><Loader2 className="mx-auto mb-3 size-7 animate-spin text-sky-300" />در حال اتصال به کلاس...</div></div>
          ) : presenting ? (
            <>
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl">
                {presenting === "content" && <ContentViewer content={content} />}
                {presenting === "screen" && <VideoSurface track={screenTrack} fit="contain" />}
                {presenting === "pinned" && <VideoSurface track={trackOf(pinnedParticipant, "camera")} fit="contain" mirror={pinnedParticipant.isLocal} />}
                <span className="absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs backdrop-blur">{presenting === "content" ? `نمایش: ${content.name}` : presenting === "screen" ? `صفحهٔ ${screenSharer.name}` : pinnedParticipant.name}</span>
                {presenting === "pinned" && <button onClick={() => setPinned(null)} className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs backdrop-blur">بستن</button>}
              </div>
              <div className="flex h-28 shrink-0 gap-2.5 overflow-x-auto pb-1 sm:h-32">
                {strip.map((p) => <div key={p.identity} className="aspect-video h-full shrink-0"><ParticipantTile compact participant={p} onClick={() => setPinned(p.identity)} active={pinned === p.identity} /></div>)}
              </div>
            </>
          ) : (
            <div className={`grid min-h-0 flex-1 auto-rows-fr content-center gap-3 overflow-y-auto ${participants.length <= 1 ? "grid-cols-1 sm:grid-cols-1" : participants.length <= 4 ? "grid-cols-1 sm:grid-cols-2" : participants.length <= 9 ? "grid-cols-2 xl:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"}`}>
              {participants.map((p) => <ParticipantTile key={p.identity} participant={p} onClick={() => setPinned(p.identity)} />)}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[.05] p-2.5 backdrop-blur-xl">
            <ToolButton icon={micOn ? Mic : MicOff} label={micOn ? "بستن میکروفون" : "میکروفون"} active={micOn} locked={!canPublish} onClick={() => toggle("mic")} />
            <ToolButton icon={camOn ? Video : VideoOff} label={camOn ? "بستن دوربین" : "دوربین"} active={camOn} locked={!canPublish} onClick={() => toggle("cam")} />
            <ToolButton icon={screenOn ? MonitorOff : MonitorUp} label={screenOn ? "توقف اشتراک" : "اشتراک صفحه"} active={screenOn} locked={!canPublish} onClick={() => toggle("screen")} />
            {!isStaff && settings.studentsMayRaiseHand && <ToolButton icon={Hand} label={handRaisedLocally ? "پایین آوردن دست" : "بالا بردن دست"} active={handRaisedLocally} onClick={toggleHand} />}
            {isStaff && <ToolButton icon={FolderOpen} label="فایل‌ها" onClick={() => { setSidebar(true); setTab("files"); }} />}
            <ToolButton icon={Users} label="افراد" badge={isStaff ? handCount : 0} onClick={() => { setSidebar(true); setTab("people"); }} />
            <ToolButton icon={PhoneOff} label="خروج" danger onClick={() => { room?.disconnect(); onLeave?.(); }} />
          </div>
        </main>

        {sidebar && (
          <aside className="absolute inset-y-0 left-0 z-20 flex w-[min(92vw,380px)] flex-col overflow-hidden border-r border-white/10 bg-[#0b1226]/95 shadow-2xl backdrop-blur-2xl lg:static lg:z-auto lg:w-[370px] lg:rounded-2xl lg:border lg:bg-white/[.04]">
            <nav className="flex shrink-0 gap-1 border-b border-white/8 p-1.5">
              {visibleTabs.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} className={`relative flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] transition ${tab === t.id ? "bg-sky-500/20 text-sky-100" : "text-white/55 hover:bg-white/8"}`}>
                  <t.icon className="size-4" />{t.label}
                  {t.id === "people" && isStaff && handCount > 0 && <span className="absolute left-2 top-1 size-2 rounded-full bg-amber-400" />}
                </button>
              ))}
            </nav>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === "people" && <ParticipantsPanel channel={channel} rows={rows} isStaff={isStaff} hiddenForStudents={hidePeople} onChanged={() => {}} />}
              {tab === "chat" && <div className="h-full p-2 [&_*]:!text-inherit"><LiveChat key={channel} channel={channel} initialEnabled={chatEnabled} /></div>}
              {tab === "files" && <FilesPanel channel={channel} files={files} sharedId={content?.id} isStaff={isStaff} onChanged={refreshState} />}
              {tab === "polls" && <div className="p-2"><PollWidget channel={channel} /></div>}
              {tab === "manage" && isStaff && <ManagePanel channel={channel} settings={settings} onSettings={async (patch) => { setSettings((c) => ({ ...c, ...patch })); await api.meetingSettings(channel, patch).catch(() => {}); }} onMuteAll={() => api.meetingMuteAll(channel).then(() => flash("صدای همه قطع شد.")).catch(() => {})} onRequestAll={(kind) => api.meetingRequest(channel, { kind }).then(() => flash("درخواست ارسال شد.")).catch(() => {})} />}
            </div>
          </aside>
        )}
      </div>

      <AudioSink participants={participants} />

      {notice && <div className="pointer-events-none absolute inset-x-0 top-16 z-30 mx-auto w-fit max-w-[90vw] rounded-2xl border border-white/15 bg-slate-900/90 px-5 py-3 text-sm shadow-2xl backdrop-blur">{notice}</div>}
      {request && (
        <div className="absolute inset-x-0 bottom-28 z-30 mx-auto flex w-fit max-w-[92vw] items-center gap-4 rounded-2xl border border-sky-300/30 bg-slate-900/95 px-5 py-3.5 shadow-2xl backdrop-blur">
          <p className="text-sm">مدیر کلاس از شما {request === "screen" ? "اشتراک صفحه" : request === "camera" ? "روشن کردن دوربین" : "روشن کردن میکروفون"} را درخواست کرده است.</p>
          <button onClick={answerRequest} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium hover:bg-sky-400">قبول</button>
          <button onClick={() => setRequest(null)} className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/18">رد</button>
        </div>
      )}
    </div>
  );
}
