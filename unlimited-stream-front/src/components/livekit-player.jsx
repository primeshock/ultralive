"use client";

import { useEffect, useRef, useState } from "react";
import { api, hlsUrl } from "@/lib/api";
import { HlsPlayer } from "@/components/hls-player";

export function LiveKitPlayer({ channel, className, poster }) {
  const mediaRef = useRef(null);
  const roomRef = useRef(null);
  const [state, setState] = useState("CONNECTING");
  const [error, setError] = useState("");

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
      media.play().catch(() => {});
    }

    async function start() {
      try {
        const { serverUrl, participantToken } = await api.livekitToken(channel);
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
        room.on(lk.RoomEvent.Disconnected, () => setState("OFFLINE"));
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
    return () => {
      cancelled = true;
      room?.disconnect();
      roomRef.current = null;
      if (mediaRef.current) mediaRef.current.srcObject = null;
    };
  }, [channel]);

  if (state === "OFFLINE" && error) {
    return <HlsPlayer src={hlsUrl(channel)} className={className} poster={poster} />;
  }

  return (
    <div className={`relative bg-black ${className || ""}`}>
      <video ref={mediaRef} className="w-full h-full object-contain" poster={poster} playsInline controls />
      <div className="absolute top-3 start-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur">
        {state === "LIVE" ? "LIVE" : state === "CONNECTING" ? "CONNECTING" : "OFFLINE"}
      </div>
    </div>
  );
}
