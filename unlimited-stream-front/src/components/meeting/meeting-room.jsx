"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, Hand, MessageSquare, Users, FolderOpen, PhoneOff, Clock, Maximize2, Loader2, WifiOff, PanelRightClose, PanelRightOpen, ArrowLeftRight, ChevronDown, Timer, LogOut } from "lucide-react";
import { LiveChat } from "@/components/live-chat";
import { PollWidget } from "@/components/poll-widget";
import { api } from "@/lib/api";
import { useClassRoom } from "./use-room";
import { AudioSink, ParticipantTile, VideoSurface, trackOf } from "./tiles";
import { ContentViewer } from "./content-viewer";
import { ParticipantsPanel, FilesPanel, Quality } from "./panels";
import { ModeSwitch } from "./mode-switch";
import { ContentRail, HeaderActions } from "./rail";
import { Stage } from "./stage";
import { AnnotatedSurface, loadPdf } from "./annotated-surface";
import { createBoardStore } from "./board-store";
import { Tip } from "./tip";
import { PanelBoundary } from "./boundary";

const pad = (n) => String(n).padStart(2, "0");
const clock = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

function useSecondTick() {
  const [now, setNow] = useState(0);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return now;
}

// Elapsed class time (own state, so the 300-row people list is not re-rendered every second).
function ClassClock() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const id = setInterval(() => setSeconds((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  return <span className="flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1.5 text-xs tabular-nums" dir="ltr"><Clock className="size-3.5 text-sky-300" />{clock(seconds)}</span>;
}

// Countdown to a scheduled class end (header pill for the host, floating banner for everyone else).
function EndCountdown({ endsAt, floating }) {
  const now = useSecondTick();
  const remaining = Math.max(0, Math.round((endsAt - (now || endsAt - 1000)) / 1000));
  const text = `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;
  if (floating) return <div className="pointer-events-none absolute inset-x-0 top-14 z-30 mx-auto w-fit rounded-full bg-rose-500/90 px-4 py-1.5 text-xs shadow-lg">کلاس تا {text} دیگر بسته می‌شود</div>;
  return <span className="flex items-center gap-1.5 rounded-full bg-rose-500/25 px-3 py-1.5 text-xs tabular-nums text-rose-100" dir="ltr"><Timer className="size-3.5" />{text}</span>;
}

function ToolButton({ icon: Icon, label, onClick, active, danger, showLabel }) {
  const tone = danger ? "bg-rose-500 text-white hover:bg-rose-400" : active ? "bg-sky-500 text-white hover:bg-sky-400" : "bg-white/10 text-white hover:bg-white/18";
  const btn = (
    <button onClick={onClick} aria-label={label} className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium transition ${tone}`}>
      <Icon className="size-[18px]" />{showLabel && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
  return showLabel ? btn : <Tip label={label} side="top">{btn}</Tip>;
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
  const [rec, setRec] = useState({ state: "idle", acc: 0, since: 0 }); // idle | recording | paused
  const [recordings, setRecordings] = useState([]);
  const [presenters, setPresenters] = useState([]);
  const [identity, setIdentity] = useState(null);
  const [ink, setInk] = useState({ tool: "pen", color: "#ef4444", width: 3 });
  const inkActions = useRef({ last: null, map: {} });
  const store = useMemo(() => createBoardStore(), []);
  const localRef = useRef(null);
  const roomRef = useRef(null);

  const flash = useCallback((text) => { setNotice(text); setTimeout(() => setNotice(null), 4000); }, []);
  const applyState = useCallback((state) => {
    setSettings((cur) => ({ ...cur, showParticipantsToStudents: state.settings.showParticipantsToStudents, studentsMayRaiseHand: state.settings.studentsMayRaiseHand }));
    setStage({ ...EMPTY_STAGE, ...state.settings.stage });
    setBoardMax((m) => Math.max(m, state.settings.stage?.boardPage || 1));
    setFiles(state.files || []);
    setEndsAt(state.endsAt || null);
    setRec(state.recording ? { state: "recording", acc: 0, since: state.recordingSince ? Date.parse(state.recordingSince) : Date.now() } : { state: "idle", acc: 0, since: 0 });
    setPresenters(state.presenters || []);
    setIdentity(state.identity || null);
  }, []);
  const refresh = useCallback(() => api.meetingState(channel).then(applyState).catch(() => {}), [channel, applyState]);

  const onData = useCallback((message) => {
    if (message.type?.startsWith("wb-")) store.apply(message);
    else if (message.type === "stage") { setStage({ ...EMPTY_STAGE, ...message.stage }); setBoardMax((m) => Math.max(m, message.stage?.boardPage || 1)); }
    else if (message.type === "settings") setSettings((cur) => ({ ...cur, ...message.settings }));
    else if (message.type === "mode") onModeChange?.(message.mode);
    else if (message.type === "request") setRequest(message.kind);
    else if (message.type === "lower-hand") localRef.current?.setAttributes({ hand: "0" }).catch(() => {});
    else if (message.type === "presenters") setPresenters(message.list || []);
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
  }, [isStaff, tab, channel, rec.state]);

  const local = room?.localParticipant;
  useEffect(() => { localRef.current = local || null; });

  const registerActions = useCallback((key, actions) => { if (actions) inkActions.current.map[key] = actions; else delete inkActions.current.map[key]; }, []);
  const activateSurface = useCallback((key) => { inkActions.current.last = key; }, []);
  const runInk = useCallback((name) => {
    const { last, map } = inkActions.current;
    (map[last] || Object.values(map)[0])?.[name]?.();
  }, []);

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
  const canControl = isStaff || (identity !== null && presenters.includes(identity));
  const perm = local?.permissions;
  const grantedNums = perm?.canPublishSources || [];
  const canUse = (name) => canControl || Boolean(perm?.canPublish && (grantedNums.length === 0 || grantedNums.includes({ camera: 1, microphone: 2, screen: 3 }[name])));
  const canPublish = canUse("microphone") || canUse("camera") || canUse("screen");
  const micOn = Boolean(local && trackOf(local, "microphone"));
  const camOn = Boolean(local && trackOf(local, "camera"));
  const screenOn = Boolean(local && trackOf(local, "screen_share"));
  const handRaised = local?.attributes?.hand === "1";
  const handCount = participants.filter((p) => p.attributes?.hand === "1").length;
  const screenSharer = participants.find((p) => trackOf(p, "screen_share"));
  const screenTrack = screenSharer ? trackOf(screenSharer, "screen_share") : null;

  const panels = [];
  if (screenTrack) panels.push({ id: "screen", title: `صفحهٔ ${screenSharer.name || ""}`, node: <div className="relative h-full bg-black"><VideoSurface track={screenTrack} fit="contain" /></div>, onClose: screenSharer.isLocal ? () => toggle("screen") : undefined, closeLabel: "توقف اشتراک صفحه" });
  if (stage.content) {
    const isPdf = stage.content.mime === "application/pdf";
    panels.push({
      id: "content", title: stage.content.name, onClose: canControl ? () => updateStage({ fileId: null }) : undefined, closeLabel: "بستن سند",
      node: isPdf ? (
        <AnnotatedSurface key={stage.content.id} store={store} channel={channel} boardKey={`file:${stage.content.id}:${stage.page}`} pdf={pdfDoc ? { doc: pdfDoc, page: stage.page } : null} canDraw={canControl} publish={publish} ink={ink} registerActions={registerActions} onActivate={activateSurface}
          pager={{ page: stage.page, total: pdfDoc?.numPages || stage.page, canChange: canControl, canAdd: false, set: (n) => { const total = pdfDoc?.numPages || n; setStage((s) => ({ ...s, page: Math.min(Math.max(1, n), total) })); api.meetingStage(channel, { page: Math.min(Math.max(1, n), total) }).catch(() => {}); } }} />
      ) : <ContentViewer content={stage.content} />,
    });
  }
  if (stage.boardOpen) {
    panels.push({
      id: "board", title: "تخته", onClose: canControl ? () => updateStage({ boardOpen: false }) : undefined, closeLabel: "بستن تخته", node: (
        <AnnotatedSurface store={store} channel={channel} boardKey={`board:${stage.boardPage}`} pdf={null} canDraw={canControl} publish={publish} ink={ink} registerActions={registerActions} onActivate={activateSurface}
          pager={{ page: stage.boardPage, total: boardMax, canChange: canControl, canAdd: true, set: (n) => { const next = Math.max(1, Math.min(n, 200)); setBoardMax((m) => Math.max(m, next)); setStage((s) => ({ ...s, boardPage: next })); api.meetingStage(channel, { boardPage: next }).catch(() => {}); } }} />
      ),
    });
  }
  const presenting = panels.length > 0;
  const drawable = canControl && (stage.boardOpen || Boolean(stage.content && stage.content.mime === "application/pdf"));

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
    handRaised: p.attributes?.hand === "1", canPublish: Boolean(p.permissions?.canPublish), presenter: presenters.includes(p.identity),
    sources: p.permissions?.canPublish ? (p.permissions.canPublishSources?.length ? p.permissions.canPublishSources : [1, 2, 3]).map((n) => ({ 1: "camera", 2: "microphone", 3: "screen" }[n])).filter(Boolean) : [],
  }));

  async function toggle(kind) {
    if (!local) return;
    const name = kind === "mic" ? "microphone" : kind === "cam" ? "camera" : "screen";
    // A device that is momentarily busy (previous stream still being released) gets one retry.
    const acquire = async (fn) => {
      try { await fn(); } catch (err) {
        if (!["NotReadableError", "AbortError", "TrackStartError"].includes(err?.name)) throw err;
        await new Promise((r) => setTimeout(r, 600));
        await fn();
      }
    };
    try {
      if (kind === "mic" || kind === "cam") {
        const turningOn = kind === "mic" ? !micOn : !camOn;
        if (turningOn && canUse("microphone") && canUse("camera") && !micOn && !camOn) {
          // Phones fail when audio and video are requested one after the other ("in use by another app"):
          // ask for both in a single request, then keep only what was asked for.
          await acquire(() => local.enableCameraAndMicrophone());
          if (kind === "mic") await local.setCameraEnabled(false); else await local.setMicrophoneEnabled(false);
        } else if (kind === "mic") await acquire(() => local.setMicrophoneEnabled(!micOn));
        else await acquire(() => local.setCameraEnabled(!camOn));
      } else {
        await local.setScreenShareEnabled(!screenOn,
          { audio: true, contentHint: "detail", resolution: { width: 1920, height: 1080, frameRate: 15 }, selfBrowserSurface: "exclude", surfaceSwitching: "include" },
          { degradationPreference: "maintain-resolution", screenShareEncoding: { maxBitrate: 3_000_000, maxFramerate: 15 }, simulcast: false });
      }
      // students lose the source again when they close it; the host has to grant it anew
      const turnedOff = (kind === "mic" && micOn) || (kind === "cam" && camOn) || (kind === "screen" && screenOn);
      if (turnedOff && !canControl) api.meetingRelease(channel, name).catch(() => {});
    } catch (err) {
      const busy = ["NotReadableError", "TrackStartError"].includes(err?.name);
      flash(err?.name === "NotAllowedError" ? "مرورگر اجازهٔ دسترسی را نداد (اجازهٔ سایت را در تنظیمات مرورگر فعال کنید)."
        : busy ? "میکروفون یا دوربین توسط برنامهٔ دیگری استفاده می‌شود؛ برنامه‌های دیگر (تماس، ضبط صفحه، مرورگر دیگر) را ببندید و دوباره امتحان کنید."
        : "فعال‌سازی انجام نشد.");
    }
  }
  // closing a screen share with the browser's own "Stop sharing" button also releases it
  useEffect(() => {
    if (!room || canControl) return undefined;
    const names = { screen_share: "screen", screen_share_audio: "screen", microphone: "microphone", camera: "camera" };
    const onUnpublished = (pub) => { const n = names[pub.source]; if (n) api.meetingRelease(channel, n).catch(() => {}); };
    room.on("localTrackUnpublished", onUnpublished);
    return () => room.off("localTrackUnpublished", onUnpublished);
  }, [room, canControl, channel]);
  const toggleHand = () => local?.setAttributes({ hand: handRaised ? "0" : "1" }).catch(() => {});
  async function answerRequest() { const kind = request; setRequest(null); await toggle(kind === "microphone" ? "mic" : kind === "camera" ? "cam" : "screen"); }

  async function recAction(action) {
    try {
      const t = Date.now();
      if (action === "start" || action === "resume") {
        await api.meetingRecording(channel, "start");
        setRec((r) => ({ state: "recording", acc: action === "start" ? 0 : r.acc, since: t }));
        flash(action === "start" ? "ضبط کلاس شروع شد." : "ضبط ادامه یافت (فایل جدید).");
      } else if (action === "pause") {
        await api.meetingRecording(channel, "stop");
        setRec((r) => ({ state: "paused", acc: r.acc + Math.round((t - r.since) / 1000), since: 0 }));
        flash("ضبط موقتاً متوقف شد؛ فایل این بخش ذخیره می‌شود.");
      } else {
        if (rec.state === "recording") await api.meetingRecording(channel, "stop");
        setRec({ state: "idle", acc: 0, since: 0 });
        flash("ضبط پایان یافت؛ فایل‌ها در تب «فایل‌ها» ظاهر می‌شوند.");
      }
    } catch (e) { flash(e.message); }
  }

  const updateStage = (patch) => api.meetingStage(channel, patch).then(({ stage: next }) => setStage({ ...EMPTY_STAGE, ...next })).catch((e) => flash(e.message));
  const updateSettings = (patch) => { setSettings((c) => ({ ...c, ...patch })); api.meetingSettings(channel, patch).catch(() => {}); };

  if (state === "failed") {
    return <div className="grid h-full place-items-center p-8 text-center text-white"><div><WifiOff className="mx-auto mb-3 size-8 text-rose-300" /><p className="font-medium">اتصال به کلاس برقرار نشد</p><p className="mt-1 text-sm text-white/55">{error}</p><div className="mt-4 flex flex-wrap items-center justify-center gap-3"><button onClick={() => window.location.reload()} className="rounded-xl bg-sky-500 px-4 py-2 text-sm">تلاش دوباره</button>{isStaff && <ModeSwitch channel={channel} mode={mode} onChange={onModeChange} />}</div></div></div>;
  }
  if (ended) {
    return <div dir="rtl" data-appearance={appearance || "aurora"} style={appearanceStyle} className="spatial-shell grid h-dvh place-items-center text-center text-white"><div><PhoneOff className="mx-auto mb-4 size-10 text-sky-300" /><h2 className="text-lg font-semibold">کلاس به پایان رسید</h2><p className="mt-1 text-sm text-white/60">از حضور شما سپاسگزاریم.</p><button onClick={onLeave} className="mt-5 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-medium">خروج</button></div></div>;
  }

  const sideMode = side === "auto" ? (presenting ? "narrow" : "normal") : side;
  const sideWidth = sideMode === "narrow" ? "md:w-[248px]" : "md:w-[320px]";
  const hidePeople = !isStaff && !settings.showParticipantsToStudents;
  const tabs = TABS.filter(([id]) => id !== "people" || !hidePeople);
  const withCamera = participants.filter((p) => trackOf(p, "camera"));
  const strip = presenting ? withCamera.slice(0, 6) : [];

  return (
    <div dir="rtl" data-appearance={appearance || "aurora"} style={appearanceStyle} className="spatial-shell relative flex h-dvh w-full max-w-full flex-col overflow-hidden text-white">
      <header className="relative z-30 flex items-center justify-between gap-3 border-b border-white/8 bg-white/[.03] px-4 py-2 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-lg shadow-sky-500/20"><Video className="size-4" /></span>
          <div className="min-w-0"><h1 className="truncate text-sm font-semibold">{title}</h1><p className="truncate text-[11px] text-white/50">{organization || "کلاس آنلاین"}</p></div>
        </div>
        <div className="flex items-center gap-2">
          {endsAt && <EndCountdown endsAt={endsAt} />}
          <ClassClock />
          {local && <span className="hidden items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1.5 sm:flex"><Quality value={local.connectionQuality} /></span>}
          {isStaff && <HeaderActions channel={channel} settings={settings} mode={mode} onMode={onModeChange} onSettings={updateSettings} flash={flash} endsAt={endsAt} rec={rec} onRec={recAction} />}
          <Tip label="تمام‌صفحه"><button onClick={() => document.documentElement.requestFullscreen?.()} className="hidden size-8 place-items-center rounded-xl bg-white/8 hover:bg-white/15 md:grid" aria-label="تمام‌صفحه"><Maximize2 className="size-4" /></button></Tip>
          <Tip label="خروج از کلاس"><button onClick={() => { room?.disconnect(); onLeave?.(); }} aria-label="خروج از کلاس" className="grid size-8 place-items-center rounded-xl bg-white/8 text-white/85 transition hover:bg-rose-500/80 hover:text-white"><LogOut className="size-4" /></button></Tip>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2 md:flex-row">
        {sideMode === "hidden" ? (
          <button onClick={() => setSide("auto")} title="باز کردن چت و افراد" aria-label="باز کردن چت و افراد" className="flex h-10 w-full shrink-0 items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[.05] text-white/75 backdrop-blur-xl transition hover:bg-white/12 hover:text-white md:h-auto md:w-10 md:flex-col md:py-4"><PanelRightOpen className="size-4" /><MessageSquare className="size-4" /><Users className="size-4" /></button>
        ) : (
          <aside className={`flex max-h-[46vh] min-h-0 w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[.04] backdrop-blur-xl md:max-h-none ${sideWidth}`}>
            <div className="flex shrink-0 items-center gap-1 border-b border-white/8 p-1">
              <nav className="flex flex-1 gap-0.5">
                {tabs.map(([id, label, Icon]) => (
                  <button key={id} onClick={() => setTab(id)} title={label} className={`relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] transition ${tab === id ? "bg-sky-500/20 text-sky-100" : "text-white/55 hover:bg-white/8"}`}>
                    <Icon className="size-3.5" /><span className={sideMode === "narrow" ? "sr-only" : ""}>{label}</span>
                    {id === "people" && isStaff && handCount > 0 && <span className="absolute left-1.5 top-1 size-2 rounded-full bg-amber-400" />}
                  </button>
                ))}
              </nav>
              <button title="تغییر عرض" aria-label="تغییر عرض" onClick={() => setSide(sideMode === "narrow" ? "normal" : "narrow")} className="hidden size-7 place-items-center rounded-lg text-white/60 hover:bg-white/10 md:grid"><ArrowLeftRight className="size-3.5" /></button>
              <button title="بستن پنل" aria-label="بستن پنل" onClick={() => setSide("hidden")} className="grid size-7 place-items-center rounded-lg text-white/60 hover:bg-white/10"><PanelRightClose className="size-3.5" /></button>
            </div>
            {strip.length > 0 && (
              <div className="grid max-h-[30vh] shrink-0 grid-cols-2 gap-1.5 overflow-y-auto border-b border-white/8 p-1.5">
                {strip.map((p) => <ParticipantTile key={p.identity} compact participant={p} />)}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto"><PanelBoundary key={tab}>
              {tab === "chat" && (
                <div className="flex h-full min-h-[260px] flex-col gap-2 p-1.5">
                  {!isStaff && <details className="group shrink-0 rounded-xl border border-white/8 bg-white/[.03]"><summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs text-white/80">نظرسنجی / آزمون <ChevronDown className="size-3.5 transition group-open:rotate-180" /></summary><div className="max-h-72 overflow-y-auto p-1.5"><PollWidget channel={channel} /></div></details>}
                  <div className="min-h-0 flex-1"><LiveChat key={channel} compact channel={channel} initialEnabled={chatEnabled} /></div>
                </div>
              )}
              {tab === "files" && <FilesPanel channel={channel} files={files} sharedId={stage.content?.id} isStaff={canControl} onChanged={refresh} onShare={(fileId) => updateStage({ fileId })} recordings={recordings} />}
              {tab === "people" && <ParticipantsPanel channel={channel} rows={rows} isStaff={isStaff} hiddenForStudents={hidePeople} onChanged={() => {}} />}
            </PanelBoundary></div>
          </aside>
        )}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          {state !== "connected" && !room ? (
            <div className="grid flex-1 place-items-center text-white/60"><div className="text-center"><Loader2 className="mx-auto mb-3 size-7 animate-spin text-sky-300" />در حال اتصال به کلاس...</div></div>
          ) : presenting ? (
            <PanelBoundary><Stage panels={panels} /></PanelBoundary>
          ) : (
            withCamera.length === 0 ? (
              <div className="grid min-h-0 flex-1 place-items-center text-center text-white/35"><div><Video className="mx-auto mb-2 size-7 opacity-50" /><p className="text-sm">هنوز دوربینی روشن نیست</p></div></div>
            ) : (
              <div className={`grid min-h-0 flex-1 auto-rows-fr content-center gap-3 overflow-y-auto ${withCamera.length <= 1 ? "grid-cols-1" : withCamera.length <= 4 ? "grid-cols-1 sm:grid-cols-2" : withCamera.length <= 9 ? "grid-cols-2 xl:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"}`}>
                {withCamera.map((p) => <ParticipantTile key={p.identity} participant={p} />)}
              </div>
            )
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[.05] p-2 backdrop-blur-xl">
            {canUse("microphone") && <ToolButton icon={micOn ? Mic : MicOff} label={micOn ? "بستن میکروفون" : "میکروفون"} active={micOn} onClick={() => toggle("mic")} />}
            {canUse("camera") && <ToolButton icon={camOn ? Video : VideoOff} label={camOn ? "بستن دوربین" : "دوربین"} active={camOn} onClick={() => toggle("cam")} />}
            {canUse("screen") && <ToolButton icon={screenOn ? MonitorOff : MonitorUp} label={screenOn ? "توقف اشتراک" : "اشتراک صفحه"} active={screenOn} onClick={() => toggle("screen")} />}
            {!isStaff && settings.studentsMayRaiseHand && <ToolButton showLabel icon={Hand} label={handRaised ? "پایین آوردن دست" : "بالا بردن دست"} active={handRaised} onClick={toggleHand} />}
          </div>
        </main>

        {canControl && (
          <div className="order-first shrink-0 md:order-last">
            <ContentRail channel={channel} stage={stage} files={files} onStage={updateStage} drawable={drawable} ink={ink} onInk={(patch) => setInk((cur) => ({ ...cur, ...patch }))} onInkAction={runInk} />
          </div>
        )}
      </div>

      <AudioSink participants={participants} />

      {state === "reconnecting" && <div className="pointer-events-none absolute inset-x-0 top-14 z-40 mx-auto flex w-fit items-center gap-2 rounded-full bg-amber-500/90 px-4 py-1.5 text-xs font-medium text-slate-900 shadow-lg"><Loader2 className="size-3.5 animate-spin" />اتصال قطع شد؛ در حال اتصال دوباره...</div>}
      {notice && <div className="pointer-events-none absolute inset-x-0 top-16 z-30 mx-auto w-fit max-w-[90vw] rounded-2xl border border-white/15 bg-slate-900/90 px-5 py-3 text-sm shadow-2xl backdrop-blur">{notice}</div>}
      {endsAt && !isStaff && <EndCountdown endsAt={endsAt} floating />}
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
