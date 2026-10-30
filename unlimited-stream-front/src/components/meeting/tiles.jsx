"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, Hand, Signal } from "lucide-react";

export function initials(name = "") {
  return (name.trim()[0] || "؟").toUpperCase();
}

export function trackOf(participant, source) {
  const publication = participant.getTrackPublication?.(source);
  return publication && !publication.isMuted && publication.track ? publication.track : null;
}

export function VideoSurface({ track, className = "", mirror = false, fit = "cover" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return undefined;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"} ${mirror ? "-scale-x-100" : ""} ${className}`} />;
}

function AudioEl({ track }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);
  return <audio ref={ref} autoPlay />;
}

// Plays every remote microphone / screen-share audio track. Local tracks are never played back.
export function AudioSink({ participants }) {
  return (
    <div hidden>
      {participants.filter((p) => !p.isLocal).flatMap((p) => ["microphone", "screen_share_audio"].map((source) => {
        const track = trackOf(p, source);
        return track ? <AudioEl key={`${p.identity}-${source}`} track={track} /> : null;
      }))}
    </div>
  );
}

export function ParticipantTile({ participant, onClick, active, compact = false }) {
  const camera = trackOf(participant, "camera");
  const micOn = Boolean(trackOf(participant, "microphone"));
  const hand = participant.attributes?.hand === "1";
  const staff = participant.identity.startsWith("staff:");
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative isolate aspect-video w-full overflow-hidden rounded-2xl border bg-slate-900/80 text-right shadow-lg transition ${participant.isSpeaking ? "border-cyan-300/80 ring-2 ring-cyan-300/40" : "border-white/10 hover:border-white/30"} ${active ? "ring-2 ring-sky-400/70" : ""}`}
    >
      {camera ? (
        <VideoSurface track={camera} mirror={participant.isLocal} />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,.18),transparent_55%),linear-gradient(160deg,#0f1b33,#0a1224)]">
          <span className={`grid place-items-center rounded-full bg-white/10 font-semibold text-white/90 ring-1 ring-white/15 ${compact ? "size-10 text-base" : "size-16 text-2xl"}`}>{initials(participant.name)}</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-white">
          {micOn ? <Mic className="size-3.5 shrink-0 text-emerald-300" /> : <MicOff className="size-3.5 shrink-0 text-rose-300" />}
          <span className="truncate">{participant.name || participant.identity}{participant.isLocal ? " (شما)" : ""}</span>
        </span>
        {staff && <span className="rounded-full bg-sky-400/20 px-2 py-0.5 text-[10px] text-sky-100">مدیر</span>}
      </div>
      {hand && <span className="absolute left-2 top-2 grid size-8 place-items-center rounded-full bg-amber-400 text-slate-900 shadow-lg animate-bounce"><Hand className="size-4" /></span>}
      {participant.connectionQuality === "poor" && <Signal className="absolute right-2 top-2 size-4 text-amber-300" />}
    </button>
  );
}
