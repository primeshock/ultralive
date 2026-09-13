"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Pause, Play, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

export function LiveKitPlayer({ channel, className, poster, connection }) {
  const mediaRef = useRef(null);
  const roomRef = useRef(null);
  const [state, setState] = useState("CONNECTING");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let room;
    const tracks = new Map();

    function syncMedia() {
      const media = mediaRef.current;
      if (!media) return;
      const stream = new MediaStream();
      for (const track of tracks.values()) stream.addTrack(track);
      media.srcObject = stream;
      media.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }

    async function start() {
      try {
        const credentials = connection || await api.livekitToken(channel);
        const { serverUrl, participantToken } = credentials;
        if (cancelled || !serverUrl || !participantToken) throw new Error("LiveKit is not configured");
        const lk = await import("livekit-client");
        room = new lk.Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
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
        room.on(lk.RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === lk.Track.Kind.Video || track.kind === lk.Track.Kind.Audio) {
            tracks.set(track.sid, track.mediaStreamTrack);
            syncMedia();
          }
        });
        room.on(lk.RoomEvent.TrackUnsubscribed, (track) => {
          tracks.delete(track.sid);
          syncMedia();
        });
        await room.connect(serverUrl, participantToken);
        if (cancelled) return;
        setState("LIVE");
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            if (publication.track && (publication.kind === lk.Track.Kind.Video || publication.kind === lk.Track.Kind.Audio)) {
              tracks.set(publication.track.sid, publication.track.mediaStreamTrack);
            }
          }
        }
        syncMedia();
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "LiveKit unavailable");
          setState("OFFLINE");
        }
      }
    }

    start();
    const media = mediaRef.current;
    return () => {
      cancelled = true;
      room?.disconnect();
      roomRef.current = null;
      if (media) media.srcObject = null;
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
      <video ref={mediaRef} className="w-full h-full object-contain" poster={poster} playsInline />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <div className="rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur">
          {state === "LIVE" ? "پخش زنده" : state === "CONNECTING" ? "در حال اتصال" : "قطع شده"}
        </div>
        <span className="rounded-full bg-red-600 px-3 py-1 text-xs text-white">LIVEKIT</span>
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
          <button type="button" onClick={reconnect} className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-xs text-white hover:bg-white/25">
            <RefreshCw className="size-4" /> تلاش دوباره
          </button>
        )}
      </div>
    </div>
  );
}
