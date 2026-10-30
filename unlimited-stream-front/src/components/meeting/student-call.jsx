"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Hand, PhoneCall } from "lucide-react";

// Studio mode, student side: lets a viewer answer a call from the host once publish rights are granted.
export function StudentCallOverlay({ room, mayRaiseHand = true }) {
  const [, force] = useState(0);
  const [hand, setHand] = useState(false);
  const [request, setRequest] = useState(null);
  useEffect(() => {
    if (!room) return undefined;
    const bump = () => force((n) => n + 1);
    const onData = (payload) => {
      try {
        const m = JSON.parse(new TextDecoder().decode(payload));
        if (m.type === "request") setRequest(m.kind);
        if (m.type === "lower-hand") setHand(false);
      } catch { /* ignore */ }
    };
    room.on("participantPermissionsChanged", bump);
    room.on("localTrackPublished", bump);
    room.on("localTrackUnpublished", bump);
    room.on("dataReceived", onData);
    return () => {
      room.off("participantPermissionsChanged", bump);
      room.off("localTrackPublished", bump);
      room.off("localTrackUnpublished", bump);
      room.off("dataReceived", onData);
    };
  }, [room]);
  if (!room?.localParticipant) return null;
  const local = room.localParticipant;
  const canPublish = Boolean(local.permissions?.canPublish);
  const mic = local.isMicrophoneEnabled;
  const cam = local.isCameraEnabled;
  const raise = () => { const next = !hand; setHand(next); local.setAttributes({ hand: next ? "1" : "0" }).catch(() => {}); };
  const btn = "grid size-11 place-items-center rounded-full transition";
  return (
    <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-slate-900/85 p-1.5 text-white">
      {canPublish ? (
        <>
          <span className="flex items-center gap-1.5 pl-2 pr-3 text-xs text-emerald-200"><PhoneCall className="size-4" />تماس فعال</span>
          <button onClick={() => local.setMicrophoneEnabled(!mic).catch(() => {})} className={`${btn} ${mic ? "bg-[var(--accent)]" : "bg-[var(--s2)]"}`} aria-label="میکروفون">{mic ? <Mic className="size-5" /> : <MicOff className="size-5" />}</button>
          <button onClick={() => local.setCameraEnabled(!cam).catch(() => {})} className={`${btn} ${cam ? "bg-[var(--accent)]" : "bg-[var(--s2)]"}`} aria-label="دوربین">{cam ? <Video className="size-5" /> : <VideoOff className="size-5" />}</button>
        </>
      ) : (
        mayRaiseHand && <button onClick={raise} className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm ${hand ? "bg-amber-400 text-slate-900" : "bg-[var(--s2)] hover:bg-[var(--s3)]"}`}><Hand className="size-4" />{hand ? "دست بالا است" : "بالا بردن دست"}</button>
      )}
      {request && canPublish && <span className="pr-2 text-xs text-amber-200">مدیر {request === "camera" ? "دوربین" : "میکروفون"} شما را می‌خواهد</span>}
    </div>
  );
}
