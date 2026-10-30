"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, Hand, MessageSquare, Users, FolderOpen, PhoneOff, Clock, Maximize2, Lock, Loader2, WifiOff, PanelRightClose, PanelRightOpen, ArrowLeftRight, ChevronDown, Timer } from "lucide-react";
import { LiveChat } from "@/components/live-chat";
import { PollWidget } from "@/components/poll-widget";
import { api } from "@/lib/api";
import { useClassRoom } from "./use-room";
import { AudioSink, ParticipantTile, VideoSurface, trackOf } from "./tiles";
import { ContentViewer } from "./content-viewer";
import { ParticipantsPanel, FilesPanel, Quality } from "./panels";
import { ModeSwitch } from "./mode-switch";
import { ControlRail } from "./rail";
import { Stage } from "./stage";
import { AnnotatedSurface, loadPdf } from "./annotated-surface";
import { createBoardStore } from "./board-store";

const pad = (n) => String(n).padStart(2, "0");
const clock = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

function useTick() {
  const [tick, setTick] = useState({ seconds: 0, now: 0 });
  useEffect(() => { const id = setInterval(() => setTick((t) => ({ seconds: t.seconds + 1, now: Date.now() })), 1000); return () => clearInterval(id); }, []);
  return tick;
}

function ToolButton({ icon: Icon, label, onClick, active, danger, locked }) {
  const tone = danger ? "bg-rose-500 text-white hover:bg-rose-400" : active ? "bg-sky-500 text-white hover:bg-sky-400" : "bg-white/10 text-white hover:bg-white/18";
  return (
    <button onClick={onClick} title={label} aria-label={label} className={`relative flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium transition ${tone}`}>
      <Icon className="size-[18px]" /><span className="hidden whitespace-nowrap md:block">{label}</span>
      {locked && <Lock className="absolute -left-1 -top-1 size-3.5 rounded-full bg-slate-900 p-0.5 text-amber-300" />}
    </button>
  );
}

const TABS = [["chat", "چت", MessageSquare], ["files", "فایل‌ها", FolderOpen], ["people", "افراد", Users]];
const EMPTY_STAGE = { content: null, boardOpen: false, page: 1, boardPage: 1 };

export function MeetingRoom({ channel, title, organization, appearance, appearanceStyle, mode, onModeChange, isStaff, chatEnabled, livekitSettings, initialSettings, onLeave }) {
  const [settings, setSettings] = useState({ showParticipantsToStudents: initialSettings?.showParticipantsToStudents !== false, studentsMayRaiseHand: initialSettings?.studentsMayRaiseHand !== false });
  const [stage, setStage] = useState(EMPTY_STAGE);
  const [files, setFiles] = useState([]);
  const [tab, setTab] = useState("chat");
  const [side, setSide] = useState("auto"); // auto | normal | narrow | hidden
  const [notice, setNotice] = useState(null);
  const [request, setRequest] = useState(null);
  const [endsAt, setEndsAt] = useState(null);
  const [ended, setEnded] = useState(false);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [boardMax, setBoardMax] = useState(1);
  const [recording, setRecording] = useState(false);
  const [recordings, setRecordings] = useState([]);
  const store = useMemo(() => createBoardStore(), []);
  const localRef = useRef(null);
  const roomRef = useRef(null);
  const { seconds, now } = useTick();

  const flash = useCallback((text) => { setNotice(text); setTimeout(() => setNotice(null), 4000); }, []);
  const applyState = useCallback((state) => {
    setSettings((cur) => ({ ...cur, showParticipantsToStudents: state.settings.showParticipantsToStudents, studentsMayRaiseHand: state.settings.studentsMayRaiseHand }));
    setStage({ ...EMPTY_STAGE, ...state.settings.stage });
    setBoardMax((m) => Math.max(m, state.settings.stage?.boardPage || 1));
    setFiles(state.files || []);
    setEndsAt(state.endsAt || null);
    setRecording(Boolean(state.recording));
  }, []);
  const refresh = useCallback(() => api.meetingState(channel).then(applyState).catch(() => {}), [channel, applyState]);

  const onData = useCallback((message) => {
    if (message.type?.startsWith("wb-")) store.apply(message);
    else if (message.type === "stage") { setStage({ ...EMPTY_STAGE, ...message.stage }); setBoardMax((m) => Math.max(m, message.stage?.boardPage || 1)); }
    else if (message.type === "settings") setSettings((cur) => ({ ...cur, ...message.settings }));
    else if (message.type === "mode") onModeChange?.(message.mode);
    else if (message.type === "request") setRequest(message.kind);
    else if (message.type === "lower-hand") localRef.current?.setAttributes({ hand: "0" }).catch(() => {});
    else if (message.type === "ending") setEndsAt(message.endsAt || null);
    else if (message.type === "ended") setEnded(true);
  }, [store, onModeChange]);

  const { room, state, error } = useClassRoom({ channel, livekitSettings, onData });
  useEffect(() => { roomRef.current = room; });
  useEffect(() => {
    let alive = true;
    api.meetingState(channel).then((s) => { if (alive) applyState(s); }).catch(() => {});
    return () => { alive = false; };
  }, [channel, applyState]);

  useEffect(() => {
    if (!isStaff || tab !== "files") return undefined;
    let alive = true;
    api.meetingRecordings(channel).then((r) => alive && setRecordings(r)).catch(() => {});
    return () => { alive = false; };
  }, [isStaff, tab, channel, recording]);

  const local = room?.localParticipant;
  useEffect(() => { localRef.current = local || null; });

  const publish = useCallback((message) => {
    roomRef.current?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable: true, topic: "class" }).catch(() => {});
  }, []);

  // PDF document for the presented file
  const pdfUrl = stage.content?.mime === "application/pdf" ? stage.content.url : null;
  useEffect(() => {
    let alive = true;
    if (!pdfUrl) { Promise.resolve().then(() => alive && setPdfDoc(null)); return () => { alive = false; }; }
    loadPdf(pdfUrl).then((doc) => alive && setPdfDoc(doc)).catch(() => alive && flash("باز کردن PDF انجام نشد."));
    return () => { alive = false; };
  }, [pdfUrl, flash]);

  const participants = room ? [room.localParticipant, ...room.remoteParticipants.values()].filter((p) => !p.identity.startsWith("ingress:") && !p.identity.startsWith("monitor:")) : [];
  const canPublish = Boolean(local?.permissions?.canPublish);
  const micOn = Boolean(local && trackOf(local, "microphone"));
  const camOn = Boolean(local && trackOf(local, "camera"));
  const screenOn = Boolean(local && trackOf(local, "screen_share"));
  const handRaised = local?.attributes?.hand === "1";
  const handCount = participants.filter((p) => p.attributes?.hand === "1").length;
  const screenSharer = participants.find((p) => trackOf(p, "screen_share"));
  const screenTrack = screenSharer ? trackOf(screenSharer, "screen_share") : null;

  const panels = [];
  if (screenTrack) panels.push({ id: "screen", title: `صفحهٔ ${screenSharer.name || ""}`, node: <div className="h-full bg-black"><VideoSurface track={screenTrack} fit="contain" /></div> });
  if (stage.content) {
    const isPdf = stage.content.mime === "application/pdf";
    panels.push({
      id: "content", title: stage.content.name,
      node: isPdf ? (
        <AnnotatedSurface key={stage.content.id} store={store} channel={channel} boardKey={`file:${stage.content.id}:${stage.page}`} pdf={pdfDoc ? { doc: pdfDoc, page: stage.page } : null} canDraw={isStaff} publish={publish}
          pager={{ page: stage.page, total: pdfDoc?.numPages || stage.page, canChange: isStaff, canAdd: false, set: (n) => { const total = pdfDoc?.numPages || n; setStage((s) => ({ ...s, page: Math.min(Math.max(1, n), total) })); api.meetingStage(channel, { page: Math.min(Math.max(1, n), total) }).catch(() => {}); } }} />
      ) : <ContentViewer content={stage.content} />,
    });
  }
  if (stage.boardOpen) {
    panels.push({
      id: "board", title: "تخته", node: (
        <AnnotatedSurface store={store} channel={channel} boardKey={`board:${stage.boardPage}`} pdf={null} canDraw={isStaff} publish={publish}
          pager={{ page: stage.boardPage, total: boardMax, canChange: isStaff, canAdd: true, set: (n) => { const next = Math.max(1, Math.min(n, 200)); setBoardMax((m) => Math.max(m, next)); setStage((s) => ({ ...s, boardPage: next })); api.meetingStage(channel, { boardPage: next }).catch(() => {}); } }} />
      ),
    });
  }
  const presenting = panels.length > 0;

  // While anything is presented, the lesson material gets the bandwidth: cameras drop to the low layer.
  const camSig = participants.map((p) => `${p.identity}:${trackOf(p, "camera") ? 1 : 0}`).join(",");
  useEffect(() => {
    if (!room) return;
    import("livekit-client").then((lk) => {
      for (const p of room.remoteParticipants.values()) p.getTrackPublication("camera")?.setVideoQuality(presenting ? lk.VideoQuality.LOW : lk.VideoQuality.HIGH);
    });
  }, [room, presenting, camSig]);

  const rows = participants.map((p) => ({
    identity: p.identity, name: p.name, isLocal: p.isLocal, isStaff: p.identity.startsWith("staff:"), quality: p.connectionQuality,
    handRaised: p.attributes?.hand === "1", canPublish: Boolean(p.permissions?.canPublish),
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
      else await local.setScreenShareEnabled(!screenOn,
        { audio: true, contentHint: "detail", resolution: { width: 1920, height: 1080, frameRate: 15 }, selfBrowserSurface: "exclude", surfaceSwitching: "include" },
        { degradationPreference: "maintain-resolution", screenShareEncoding: { maxBitrate: 3_000_000, maxFramerate: 15 }, simulcast: false });
    } catch (err) { flash(err?.name === "NotAllowedError" ? "مرورگر اجازهٔ دسترسی را نداد." : "فعال‌سازی انجام نشد."); }
  }
  const toggleHand = () => local?.setAttributes({ hand: handRaised ? "0" : "1" }).catch(() => {});
  async function answerRequest() { const kind = request; setRequest(null); await toggle(kind === "microphone" ? "mic" : kind === "camera" ? "cam" : "screen"); }

  const updateStage = (patch) => api.meetingStage(channel, patch).then(({ stage: next }) => setStage({ ...EMPTY_STAGE, ...next })).catch((e) => flash(e.message));
  const updateSettings = (patch) => { setSettings((c) => ({ ...c, ...patch })); api.meetingSettings(channel, patch).catch(() => {}); };

  if (state === "failed") {
    return <div className="grid h-full place-items-center p-8 text-center text-white"><div><WifiOff className="mx-auto mb-3 size-8 text-rose-300" /><p className="font-medium">اتصال به کلاس برقرار نشد</p><p className="mt-1 text-sm text-white/55">{error}</p><div className="mt-4 flex flex-wrap items-center justify-center gap-3"><button onClick={() => window.location.reload()} className="rounded-xl bg-sky-500 px-4 py-2 text-sm">تلاش دوباره</button>{isStaff && <ModeSwitch channel={channel} mode={mode} onChange={onModeChange} />}</div></div></div>;
  }
  if (ended) {
    return <div dir="rtl" data-appearance={appearance || "aurora"} style={appearanceStyle} className="spatial-shell grid h-dvh place-items-center text-center text-white"><div><PhoneOff className="mx-auto mb-4 size-10 text-sky-300" /><h2 className="text-lg font-semibold">کلاس به پایان رسید</h2><p className="mt-1 text-sm text-white/60">از حضور شما سپاسگزاریم.</p><button onClick={onLeave} className="mt-5 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-medium">خروج</button></div></div>;
  }

  const sideMode = side === "auto" ? (presenting ? "narrow" : "normal") : side;
  const sideWidth = sideMode === "narrow" ? "lg:w-[248px]" : "lg:w-[320px]";
  const remaining = endsAt ? Math.max(0, Math.round((endsAt - (now || endsAt - 1000)) / 1000)) : null;
  const hidePeople = !isStaff && !settings.showParticipantsToStudents;
  const tabs = TABS.filter(([id]) => id !== "people" || !hidePeople);
  const strip = presenting ? participants.filter((p) => trackOf(p, "camera") || p.identity.startsWith("staff:")).slice(0, 6) : [];

  return (
    <div dir="rtl" data-appearance={appearance || "aurora"} style={appearanceStyle} className="spatial-shell relative flex h-dvh flex-col overflow-hidden text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/8 bg-white/[.03] px-4 py-2 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-lg shadow-sky-500/20"><Video className="size-4" /></span>
          <div className="min-w-0"><h1 className="truncate text-sm font-semibold">{title}</h1><p className="truncate text-[11px] text-white/50">{organization || "کلاس آنلاین"}</p></div>
        </div>
        <div className="flex items-center gap-2">
          {remaining !== null && <span className="flex items-center gap-1.5 rounded-full bg-rose-500/25 px-3 py-1.5 text-xs tabular-nums text-rose-100" dir="ltr"><Timer className="size-3.5" />{pad(Math.floor(remaining / 60))}:{pad(remaining % 60)}</span>}
          {isStaff && <ModeSwitch channel={channel} mode={mode} onChange={onModeChange} className="hidden md:inline-flex" />}
          <span className="flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1.5 text-xs tabular-nums" dir="ltr"><Clock className="size-3.5 text-sky-300" />{clock(seconds)}</span>
          {local && <span className="hidden items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1.5 sm:flex"><Quality value={local.connectionQuality} /></span>}
          <button onClick={() => document.documentElement.requestFullscreen?.()} className="hidden size-8 place-items-center rounded-xl bg-white/8 hover:bg-white/15 lg:grid" aria-label="تمام‌صفحه"><Maximize2 className="size-4" /></button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row">
        {sideMode !== "hidden" && (
          <aside className={`flex max-h-[46vh] min-h-0 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[.04] backdrop-blur-xl lg:max-h-none lg:w-auto ${sideWidth}`}>
            <div className="flex shrink-0 items-center gap-1 border-b border-white/8 p-1">
              <nav className="flex flex-1 gap-0.5">
                {tabs.map(([id, label, Icon]) => (
                  <button key={id} onClick={() => setTab(id)} className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] transition ${tab === id ? "bg-sky-500/20 text-sky-100" : "text-white/55 hover:bg-white/8"}`}>
                    <Icon className="size-3.5" />{label}
                    {id === "people" && isStaff && handCount > 0 && <span className="absolute left-1.5 top-1 size-2 rounded-full bg-amber-400" />}
                  </button>
                ))}
              </nav>
              <button title="تغییر عرض" aria-label="تغییر عرض" onClick={() => setSide(sideMode === "narrow" ? "normal" : "narrow")} className="hidden size-7 place-items-center rounded-lg text-white/60 hover:bg-white/10 lg:grid"><ArrowLeftRight className="size-3.5" /></button>
              <button title="بستن پنل" aria-label="بستن پنل" onClick={() => setSide("hidden")} className="grid size-7 place-items-center rounded-lg text-white/60 hover:bg-white/10"><PanelRightClose className="size-3.5" /></button>
            </div>
            {strip.length > 0 && (
              <div className="grid max-h-[30vh] shrink-0 grid-cols-2 gap-1.5 overflow-y-auto border-b border-white/8 p-1.5">
                {strip.map((p) => <ParticipantTile key={p.identity} compact participant={p} />)}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === "chat" && (
                <div className="flex h-full min-h-[260px] flex-col gap-2 p-1.5">
                  {!isStaff && <details className="group shrink-0 rounded-xl border border-white/8 bg-white/[.03]"><summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs text-white/80">نظرسنجی / آزمون <ChevronDown className="size-3.5 transition group-open:rotate-180" /></summary><div className="max-h-72 overflow-y-auto p-1.5"><PollWidget channel={channel} /></div></details>}
                  <div className="min-h-0 flex-1 [&_*]:!text-inherit"><LiveChat key={channel} channel={channel} initialEnabled={chatEnabled} /></div>
                </div>
              )}
              {tab === "files" && <FilesPanel channel={channel} files={files} sharedId={stage.content?.id} isStaff={isStaff} onChanged={refresh} onShare={(fileId) => updateStage({ fileId })} recordings={recordings} />}
              {tab === "people" && <ParticipantsPanel channel={channel} rows={rows} isStaff={isStaff} hiddenForStudents={hidePeople} onChanged={() => {}} />}
            </div>
          </aside>
        )}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {state !== "connected" && !room ? (
            <div className="grid flex-1 place-items-center text-white/60"><div className="text-center"><Loader2 className="mx-auto mb-3 size-7 animate-spin text-sky-300" />در حال اتصال به کلاس...</div></div>
          ) : presenting ? (
            <Stage panels={panels} />
          ) : (
            <div className={`grid min-h-0 flex-1 auto-rows-fr content-center gap-3 overflow-y-auto ${participants.length <= 1 ? "grid-cols-1" : participants.length <= 4 ? "grid-cols-1 sm:grid-cols-2" : participants.length <= 9 ? "grid-cols-2 xl:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"}`}>
              {participants.map((p) => <ParticipantTile key={p.identity} participant={p} />)}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[.05] p-2 backdrop-blur-xl">
            <ToolButton icon={micOn ? Mic : MicOff} label={micOn ? "بستن میکروفون" : "میکروفون"} active={micOn} locked={!canPublish} onClick={() => toggle("mic")} />
            <ToolButton icon={camOn ? Video : VideoOff} label={camOn ? "بستن دوربین" : "دوربین"} active={camOn} locked={!canPublish} onClick={() => toggle("cam")} />
            <ToolButton icon={screenOn ? MonitorOff : MonitorUp} label={screenOn ? "توقف اشتراک" : "اشتراک صفحه"} active={screenOn} locked={!canPublish} onClick={() => toggle("screen")} />
            {!isStaff && settings.studentsMayRaiseHand && <ToolButton icon={Hand} label={handRaised ? "پایین آوردن دست" : "بالا بردن دست"} active={handRaised} onClick={toggleHand} />}
            {sideMode === "hidden" && <ToolButton icon={PanelRightOpen} label="چت و افراد" onClick={() => setSide("auto")} />}
            <ToolButton icon={PhoneOff} label="خروج" danger onClick={() => { room?.disconnect(); onLeave?.(); }} />
          </div>
        </main>

        {isStaff && (
          <div className="order-last hidden shrink-0 lg:block">
            <ControlRail channel={channel} settings={settings} stage={stage} files={files} mode={mode} onMode={onModeChange} onSettings={updateSettings} onStage={updateStage} flash={flash} endsAt={endsAt} recording={recording} onRecording={() => api.meetingRecording(channel, recording ? "stop" : "start").then(() => { setRecording(!recording); flash(recording ? "ضبط متوقف شد و فایل آماده می‌شود." : "ضبط کلاس شروع شد."); }).catch((e) => flash(e.message))} />
          </div>
        )}
      </div>

      <AudioSink participants={participants} />

      {notice && <div className="pointer-events-none absolute inset-x-0 top-16 z-30 mx-auto w-fit max-w-[90vw] rounded-2xl border border-white/15 bg-slate-900/90 px-5 py-3 text-sm shadow-2xl backdrop-blur">{notice}</div>}
      {remaining !== null && !isStaff && <div className="pointer-events-none absolute inset-x-0 top-14 z-30 mx-auto w-fit rounded-full bg-rose-500/90 px-4 py-1.5 text-xs shadow-lg">کلاس تا {pad(Math.floor(remaining / 60))}:{pad(remaining % 60)} دیگر بسته می‌شود</div>}
      {request && (
        <div className="absolute inset-x-0 bottom-24 z-30 mx-auto flex w-fit max-w-[92vw] items-center gap-4 rounded-2xl border border-sky-300/30 bg-slate-900/95 px-5 py-3.5 shadow-2xl backdrop-blur">
          <p className="text-sm">مدیر کلاس از شما {request === "screen" ? "اشتراک صفحه" : request === "camera" ? "روشن کردن دوربین" : "روشن کردن میکروفون"} را درخواست کرده است.</p>
          <button onClick={answerRequest} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium hover:bg-sky-400">قبول</button>
          <button onClick={() => setRequest(null)} className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/18">رد</button>
        </div>
      )}
    </div>
  );
}
