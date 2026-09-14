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

        if (cancelled || !serverUrl || !participantToken) {
          throw new Error("LiveKit is not configured");
        }

        const lk = await import("livekit-client");

        room = new lk.Room({
          adaptiveStream: true,
          dynacast: true,
        });

        roomRef.current = room;

        function attachTrack(track) {
          const media = mediaRef.current;

          if (!media || cancelled || !track) return;

          if (
            track.kind !== lk.Track.Kind.Video &&
            track.kind !== lk.Track.Kind.Audio
          ) {
            return;
          }

          if (attachedRef.current.has(track)) return;

          track.attach(media);
          attachedRef.current.add(track);

          if (track.kind === lk.Track.Kind.Video) {
            setHasVideo(true);
          }

          media
            .play()
            .then(() => setPlaying(true))
            .catch(() => setPlaying(false));
        }

        function detachTrack(track) {
          if (!track) return;

          try {
            track.detach();
          } catch {
            // already detached
          }

          attachedRef.current.delete(track);

          if (track.kind === lk.Track.Kind.Video) {
            setHasVideo(false);
          }
        }

        room.on(lk.RoomEvent.ConnectionStateChanged, (s) => {
          if (s === "connected") setState("LIVE");
          else if (s === "reconnecting") setState("CONNECTING");
          else if (s === "disconnected") setState("OFFLINE");
        });

        room.on(lk.RoomEvent.Reconnecting, () => {
          setState("CONNECTING");
        });

        room.on(lk.RoomEvent.Reconnected, () => {
          setState("LIVE");
        });

        room.on(lk.RoomEvent.Disconnected, () => {
          if (!cancelled) {
            setError("LiveKit disconnected");
            setState("OFFLINE");
          }
        });

        room.on(lk.RoomEvent.TrackSubscribed, (track) => {
          attachTrack(track);
        });

        room.on(lk.RoomEvent.TrackUnsubscribed, (track) => {
          detachTrack(track);
        });

        await room.connect(serverUrl, participantToken);

        if (cancelled) return;

        setState("LIVE");

        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            if (publication.track) {
              attachTrack(publication.track);
            }
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
        try {
          track.detach();
        } catch {
          // already detached
        }
      }

      attachedRef.current.clear();

      room?.disconnect();
      roomRef.current = null;

      const media = mediaRef.current;

      if (media) {
        media.srcObject = null;
      }
    };
  }, [channel, connection, attempt]);

  const retry = () => {
    setError("");
    setState("CONNECTING");
    setPlaying(false);
    setHasVideo(false);
    setAttempt((value) => value + 1);
  };

  const togglePlay = async () => {
    const media = mediaRef.current;

    if (!media) return;

    try {
      if (media.paused) {
        await media.play();
        setPlaying(true);
      } else {
        media.pause();
        setPlaying(false);
      }
    } catch {
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    const media = mediaRef.current;

    if (!media) return;

    media.muted = !media.muted;
    setMuted(media.muted);
  };

  return (
    <div className={`relative overflow-hidden bg-black ${className || ""}`}>
      <video
        ref={mediaRef}
        className="h-full w-full object-contain"
        poster={poster}
        autoPlay
        playsInline
        muted={muted}
        controls={false}
      />

      {!hasVideo && state !== "LIVE" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white">
          <div className="text-center">
            <div className="mb-2 text-sm">
              {error || "در حال اتصال به پخش زنده..."}
            </div>

            {error && (
              <button
                type="button"
                onClick={retry}
                className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
              >
                <RefreshCw className="h-4 w-4" />
                تلاش مجدد
              </button>
            )}
          </div>
        </div>
      )}

      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
        <button
          type="button"
          onClick={togglePlay}
          className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
        >
          {playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          onClick={toggleMute}
          className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
        >
          {muted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
