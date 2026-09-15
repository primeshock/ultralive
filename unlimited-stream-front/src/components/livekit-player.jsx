"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Pause, Play, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

export function LiveKitPlayer({ channel, className, poster, connection }) {
  const mediaRef = useRef(null);
  const roomRef = useRef(null);
  const attachedRef = useRef(new Set());
  const [state, setState] = useState("CONNECTING");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let room;

    async function start() {
      try {
        const credentials = connection || await api.livekitToken(channel);
        const { serverUrl, participantToken } = credentials;
        if (cancelled || !serverUrl || !participantToken) throw new Error("LiveKit is not configured");
        const lk = await import("livekit-client");
        room = new lk.Room({ adaptiveStream: true, dynacast: false });
        roomRef.current = room;

        function attachTrack(track) {
          const media = mediaRef.current;
          if (!media || cancelled) return;
          if (track.kind !== lk.Track.Kind.Video && track.kind !== lk.Track.Kind.Audio) return;
          track.attach(media);
          attachedRef.current.add(track);
          if (track.kind === lk.Track.Kind.Video) setHasVideo(true);
          media.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        }

        room.on(lk.RoomEvent.ConnectionStateChanged, (s) => {
          if (s === "connected") setState("LIVE");
          else if (s === "reconnecting") setState("CONNECTING");
          else if (s === "disconnected") setState("OFFLINE");
        });
        room.on(lk.RoomEvent.Reconnecting, () => setState("CONNECTING"));
        room.on(lk.RoomEvent.Reconnected, () => setState("LIVE"));
        room.on(lk.RoomEvent.Disconnected, () => {
          if (!cancelled) {
            setError("LiveKit disconnected");
            setState("OFFLINE");
          }
        });
        room.on(lk.RoomEvent.TrackSubscribed, (track) => attachTrack(track));
        room.on(lk.RoomEvent.TrackUnsubscribed, (track) => {
          track.detach();
          attachedRef.current.delete(track);
          if (track.kind === lk.Track.Kind.Video) setHasVideo(false);
        });
        await room.connect(serverUrl, participantToken);
        if (cancelled) return;
        setState("LIVE");
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            if (publication.track) attachTrack(publication.track);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "LiveKit unavailable");
          setState("OFFLINE");
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      for (const track of attachedRef.current) {
        try { track.detach(); } catch { /* already detached */ }
      }
      attachedRef.current.clear();
      room?.disconnect();
      roomRef.current = null;
    };
  }, [channel, connection, attempt]);

  function togglePlayback() {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) media.play().then(() => setPlaying(true)).catch(() => {});
    else {
      media.pause();
      setPlaying(false);
    }
  }

  function toggleMute() {
    const media = mediaRef.current;
    if (!media) return;
    media.muted = !media.muted;
    setMuted(media.muted);
  }

  function reconnect() {
    roomRef.current?.disconnect();
    setError("");
    setState("CONNECTING");
    setAttempt((value) => value + 1);
  }

  return (
    <div className={`relative bg-black ${className || ""}`}>
      <video
        ref={mediaRef}
        className="w-full h-full object-contain"
        poster={hasVideo ? undefined : poster}
        playsInline
        autoPlay
        muted={muted}
      />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <div className="rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur">
          {state === "LIVE" ? "پخش زنده" : state === "CONNECTING" ? "در حال اتصال" : "قطع شده"}
        </div>
        <span className="rounded-full bg-red-600 px-3 py-1 text-xs text-white">SHADOWKIT</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
        <div className="flex items-center gap-2">
          <button type="button" onClick={togglePlayback} className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label={playing ? "توقف" : "پخش"}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button type="button" onClick={toggleMute} className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label={muted ? "فعال‌کردن صدا" : "بی‌صدا کردن"}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        </div>
        {state === "OFFLINE" && (
          <button type="button" onClick={reconnect} className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-xs text-white hover:bg-white/25" title={error || "تلاش دوباره"}>
            <RefreshCw className="size-4" /> تلاش دوباره
          </button>
        )}
      </div>
    </div>
  );
}
