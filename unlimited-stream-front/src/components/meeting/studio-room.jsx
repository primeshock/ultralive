"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, MessageSquare, PanelRightClose, PanelRightOpen, PhoneOff, Users } from "lucide-react";
import { LiveChat } from "@/components/live-chat";
import { LiveKitPlayer } from "@/components/livekit-player";
import { NetworkMonitor } from "@/components/network-monitor";
import { api } from "@/lib/api";
import { PanelBoundary } from "./boundary";
import { ChatMenu } from "./chat-menu";
import { ClassPoll } from "./class-poll";
import { FilesPanel, Quality } from "./panels";
import { HeaderActions, pollAnchor } from "./rail";
import { EndCountdown, RoomHeader } from "./room-header";
import { StudentCallOverlay } from "./student-call";
import { StudioRail } from "./studio-tools";
import { StudioStudentList } from "./studio-student-list";
import { useRecording } from "./use-recording";

/**
 * Studio class room (OBS → LiveKit ingress). Same shell as the desktop room — header, collapsible side panel with
 * chat / files / people, host tool rail — with the broadcast itself on the stage instead of the whiteboard / PDF.
 */
export function StudioRoom({ channel, guest, info, isStaff, useLiveKit, livekitSettings, appearance, appearanceStyle, onModeChange, onChannelPatch, onLeave }) {
  const [settings, setSettings] = useState({ showParticipantsToStudents: info.meeting?.showParticipantsToStudents !== false, studentsMayRaiseHand: info.meeting?.studentsMayRaiseHand !== false });
  const [files, setFiles] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [tab, setTab] = useState("chat");
  const [side, setSide] = useState("normal"); // normal | hidden
  const [notice, setNotice] = useState(null);
  const [endsAt, setEndsAt] = useState(null);
  const [ended, setEnded] = useState(false);
  const [chatOn, setChatOn] = useState(info.chatEnabled !== false);
  const [chatMode, setChatMode] = useState(info.chatMode || "public");
  const [pollOpen, setPollOpen] = useState(false);
  const [pollPos, setPollPos] = useState(null);
  const [pollTick, setPollTick] = useState(0);
  const [studioRoom, setStudioRoom] = useState(null);
  const [stats, setStats] = useState(null);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const roomRef = useRef(null);

  const flash = useCallback((text, ms = 4000) => { setNotice(text); setTimeout(() => setNotice(null), ms); }, []);
  const [rec, setRec, recAction] = useRecording(channel, flash);

  const applyState = useCallback((state) => {
    setSettings((cur) => ({ ...cur, showParticipantsToStudents: state.settings.showParticipantsToStudents, studentsMayRaiseHand: state.settings.studentsMayRaiseHand }));
    setFiles(state.files || []);
    setEndsAt(state.endsAt || null);
    setRec(state.recording ? { state: "recording", acc: 0, since: state.recordingSince ? Date.parse(state.recordingSince) : Date.now() } : { state: "idle", acc: 0, since: 0 });
  }, [setRec]);
  const refresh = useCallback(() => api.meetingState(channel).then(applyState).catch(() => {}), [channel, applyState]);
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => { roomRef.current = studioRoom; }, [studioRoom]);
  const publish = useCallback((message) => {
    roomRef.current?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable: true, topic: "class" }).catch(() => {});
  }, []);

  // realtime messages from the host / server arrive over the broadcast room's data channel
  useEffect(() => {
    if (!studioRoom) return undefined;
    const onData = (payload) => {
      let m;
      try { m = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
      if (m.type === "poll") { setPollTick((t) => t + 1); if (!isStaff) { setTab("chat"); setSide("normal"); } }
      else if (m.type === "files") refresh();
      else if (m.type === "settings") setSettings((cur) => ({ ...cur, ...m.settings }));
      else if (m.type === "mode") onModeChange?.(m.mode);
      else if (m.type === "ending") setEndsAt(m.endsAt || null);
      else if (m.type === "ended") setEnded(true);
    };
    studioRoom.on("dataReceived", onData);
    return () => studioRoom.off("dataReceived", onData);
  }, [studioRoom, isStaff, refresh, onModeChange]);

  useEffect(() => {
    if (!isStaff || tab !== "files") return undefined;
    let alive = true;
    api.meetingRecordings(channel).then((r) => alive && setRecordings(r)).catch(() => {});
    return () => { alive = false; };
  }, [isStaff, tab, channel, rec.state]);

  const updateSettings = (patch) => { setSettings((c) => ({ ...c, ...patch })); api.meetingSettings(channel, patch).catch(() => {}); };

  if (ended) {
    return <div dir="rtl" data-appearance={appearance || "aurora"} style={appearanceStyle} className="spatial-shell grid h-dvh place-items-center text-center text-white"><div><PhoneOff className="mx-auto mb-4 size-10 text-[var(--accent-ink)]" /><h2 className="text-lg font-semibold">کلاس به پایان رسید</h2><p className="mt-1 text-sm text-[var(--ink-2)]">از حضور شما سپاسگزاریم.</p><button onClick={onLeave} className="mt-5 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium">خروج</button></div></div>;
  }

  const tabs = [["chat", "چت", MessageSquare], ["files", "فایل‌ها", FolderOpen], ...(isStaff ? [["people", "افراد", Users]] : [])];
  const quality = stats?.reconnecting ? "poor" : stats?.connectionQuality;
  const qualityNode = (
    <span className="relative hidden sm:block">
      <button onClick={() => setMonitorOpen((o) => !o)} aria-expanded={monitorOpen} aria-label="کیفیت اتصال" className="flex items-center gap-1.5 rounded-full bg-[var(--s2)] px-2.5 py-1.5 transition hover:bg-[var(--s3)]"><Quality value={quality} /></button>
      {monitorOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMonitorOpen(false)} aria-hidden />
          <div className="absolute left-0 top-10 z-30"><NetworkMonitor stats={stats} /></div>
        </>
      )}
    </span>
  );

  return (
    <div dir="rtl" data-appearance={appearance || "aurora"} style={appearanceStyle} className="spatial-shell relative flex h-dvh w-full max-w-full flex-col overflow-hidden text-white">
      <RoomHeader guest={guest} title={info.streamTitle || info.displayName || "کلاس زنده"} organization={info.organization?.name} endsAt={endsAt} qualityNode={qualityNode} onLeave={() => { studioRoom?.disconnect(); onLeave?.(); }}>
        {isStaff && <HeaderActions channel={channel} settings={settings} mode="studio" onMode={onModeChange} onSettings={updateSettings} flash={flash} endsAt={endsAt} rec={rec} onRec={recAction} />}
      </RoomHeader>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-2 md:flex-row md:overflow-hidden md:pb-2">
        {side === "hidden" ? (
          <button onClick={() => setSide("normal")} title="باز کردن چت و فایل‌ها" aria-label="باز کردن چت و فایل‌ها" className="flex h-10 w-full shrink-0 items-center justify-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--s1)] text-[var(--ink-2)] transition hover:bg-[var(--s2)] hover:text-white md:h-auto md:w-10 md:flex-col md:py-4"><PanelRightOpen className="size-4" /><MessageSquare className="size-4" /><FolderOpen className="size-4" /></button>
        ) : (
          <aside className="order-3 flex min-h-[420px] min-w-0 shrink-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--s1)] md:order-none md:min-h-0 md:w-[360px] md:min-w-[360px] md:max-w-[360px]">
            <div className="flex shrink-0 items-center gap-1 border-b border-[var(--line)] p-1">
              <nav className="flex flex-1 gap-0.5">
                {tabs.map(([id, label, Icon]) => (
                  <button key={id} onClick={() => setTab(id)} title={label} className={`relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] transition ${tab === id ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "text-[var(--ink-3)] hover:bg-[var(--s2)]"}`}>
                    <Icon className="size-3.5" /><span>{label}</span>
                  </button>
                ))}
              </nav>
              <button title="بستن پنل" aria-label="بستن پنل" onClick={() => setSide("hidden")} className="grid size-7 place-items-center rounded-lg text-[var(--ink-2)] hover:bg-[var(--s2)]"><PanelRightClose className="size-3.5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto"><PanelBoundary key={tab}>
              {tab === "chat" && (
                <div className="flex h-full min-h-[260px] flex-col gap-2 p-1.5">
                  <div className="min-h-0 flex-1"><LiveChat key={channel} compact channel={channel} initialEnabled={info.chatEnabled}
                    headerExtra={isStaff ? <ChatMenu channel={channel} chatEnabled={chatOn} chatMode={chatMode} onEnabled={setChatOn} onMode={setChatMode} flash={flash} /> : null}
                    footerSlot={isStaff ? null : <ClassPoll variant="dock" channel={channel} isStaff={false} tick={pollTick} />} /></div>
                </div>
              )}
              {tab === "files" && <FilesPanel channel={channel} files={files} isStaff={isStaff} canShare={false} onChanged={refresh} recordings={recordings} />}
              {tab === "people" && isStaff && <StudioStudentList channel={channel} embedded />}
            </PanelBoundary></div>
          </aside>
        )}

        <main className="order-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden max-md:min-h-[46vh] md:order-none">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--line)] bg-black max-md:aspect-video">
            {!isStaff && studioRoom && <StudentCallOverlay room={studioRoom} mayRaiseHand={settings.studentsMayRaiseHand} />}
            {info.isLive && useLiveKit ? (
              <LiveKitPlayer channel={channel} poster={info.thumbnailUrl} livekitSettings={livekitSettings} onTelemetry={setStats} onRoomReady={setStudioRoom} className="h-full w-full" />
            ) : (
              <div className="relative grid h-full w-full place-items-center text-[var(--ink-2)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {info.thumbnailUrl && <img src={info.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover opacity-40" />}
                <span className="relative">{info.isLive ? "پخش در دسترس نیست" : "کلاس هنوز شروع نشده"}</span>
              </div>
            )}
          </div>
        </main>

        {isStaff && (
          <div className="order-first shrink-0 md:order-last max-md:overflow-x-auto">
            <StudioRail channel={channel} info={info} pollOpen={pollOpen} onChannelPatch={onChannelPatch} flash={flash} onPoll={(e) => { setPollPos(pollAnchor(e)); setPollOpen((o) => !o); setSide("normal"); setTab("chat"); }} />
          </div>
        )}
      </div>

      {isStaff && pollOpen && pollPos && (
        <div style={{ left: pollPos.left, top: pollPos.top, maxHeight: pollPos.maxHeight }} className="fixed z-30 overflow-y-auto max-md:inset-x-2 max-md:!left-2 max-md:!top-auto max-md:bottom-24">
          <ClassPoll variant="float" channel={channel} isStaff audience={info.viewerCount || 0} tick={pollTick} onChange={() => publish({ type: "poll" })} />
        </div>
      )}
      {notice && <div className="pointer-events-none absolute inset-x-0 top-16 z-30 mx-auto w-fit max-w-[90vw] room-float rounded-2xl px-5 py-3 text-sm">{notice}</div>}
      {endsAt && !isStaff && <EndCountdown endsAt={endsAt} floating />}
    </div>
  );
}
