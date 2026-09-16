"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Volume2, VolumeX, Pause, Play, RefreshCw, Maximize2 } from "lucide-react";
import { api } from "@/lib/api";
import { collectRtcStats, qualityLabel } from "@/lib/livekit-stats";
import { connectOptionsFromLivekit, normalizeLivekitSettings, roomOptionsFromLivekit } from "@/lib/livekit-settings";

export function LiveKitPlayer({ channel, className, poster, connection, livekitSettings, onTelemetry }) {
  const mediaRef = useRef(null);
  const audioRef = useRef(null);
  const roomRef = useRef(null);
  const currentTrackRef = useRef(null);
  const statsTimerRef = useRef(null);

  const [state, setState] = useState("CONNECTING");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let room;
    let currentVideoTrack = null;
    let currentAudioTrack = null;
    const media = mediaRef.current;
    const audio = audioRef.current;

    const normalizedSettings = normalizeLivekitSettings(livekitSettings || connection?.livekit || connection?.settings);

    async function refreshStats(roomToInspect, currentTrack) {
      const baseStats = {
        connectionQuality: roomToInspect?.localParticipant?.connectionQuality || "unknown",
        qualityText: qualityLabel(roomToInspect?.localParticipant?.connectionQuality || "unknown"),
        state: roomToInspect?.state || "disconnected",
        reconnecting: String(roomToInspect?.state || "").includes("reconnecting"),
        participants: roomToInspect?.remoteParticipants?.size || 0,
        bitrateKbps: currentTrack?.currentBitrate ? Math.round(currentTrack.currentBitrate / 1000) : null,
        resolution: null,
        fps: null,
        codec: null,
        rttMs: null,
        jitterMs: null,
        packetLossPct: null,
        trackState: currentTrack?.streamState || null,
      };

      const collected = await collectRtcStats({ room: roomToInspect, track: currentTrack }).catch(() => baseStats);
      if (!roomRef.current || roomRef.current !== roomToInspect) return;
      setStats(collected);
      onTelemetry?.(collected);
    }

    function stopStatsTimer() {
      if (statsTimerRef.current) {
        clearInterval(statsTimerRef.current);
        statsTimerRef.current = null;
      }
    }

    function detachTrack(track) {
      if (!track) return;

      const element = track.kind === "audio" ? audio : media;
      if (element) track.detach(element);

      if (currentTrackRef.current === track) {
        currentTrackRef.current = null;
      }

      if (track === currentAudioTrack) {
        currentAudioTrack = null;
      }

      if (track === currentVideoTrack) {
        currentVideoTrack = null;
        setHasVideo(false);
      }
    }

    async function attachTrack(track) {
      if (cancelled || !track) return;

      if (track.kind !== "video" && track.kind !== "audio") return;

      const element = track.kind === "audio" ? audio : media;
      if (!element) return;

      if (track.kind === "video" && currentVideoTrack && currentVideoTrack !== track) detachTrack(currentVideoTrack);
      if (track.kind === "audio" && currentAudioTrack && currentAudioTrack !== track) detachTrack(currentAudioTrack);

      track.attach(element);

      if (track.kind === "video") {
        currentVideoTrack = track;
        currentTrackRef.current = track;
        setHasVideo(true);
      } else {
        currentAudioTrack = track;
      }

      if (track.kind === "video") {
        try {
          await media.play();
          setPlaying(true);
        } catch {
          setPlaying(false);
        }
      }

      await refreshStats(room, currentVideoTrack || currentTrackRef.current);
    }

    async function start() {
      try {
        setState("CONNECTING");
        const credentials = connection || await api.livekitToken(channel);
        const { serverUrl, participantToken } = credentials;

        if (cancelled || !serverUrl || !participantToken) {
          throw new Error("LiveKit is not configured");
        }

        const lk = await import("livekit-client");

        room = new lk.Room(roomOptionsFromLivekit(normalizedSettings));

        roomRef.current = room;

        room.on(lk.RoomEvent.ConnectionStateChanged, (nextState) => {
          if (nextState === lk.ConnectionState.Connected) setState("LIVE");
          else if (nextState === lk.ConnectionState.Reconnecting || nextState === lk.ConnectionState.SignalReconnecting) setState("RECONNECTING");
          else if (nextState === lk.ConnectionState.Disconnected) setState("OFFLINE");
          else setState("CONNECTING");
        });

        room.on(lk.RoomEvent.Reconnecting, () => {
          if (!cancelled) {
            setState("RECONNECTING");
            refreshStats(room, currentVideoTrack || currentTrackRef.current);
          }
        });

        room.on(lk.RoomEvent.Reconnected, () => {
          if (!cancelled) {
            setState("LIVE");
            void refreshStats(room, currentVideoTrack || currentTrackRef.current);
          }
        });

        room.on(lk.RoomEvent.Disconnected, () => {
          if (!cancelled) {
            setError("LiveKit disconnected");
            setState("OFFLINE");
            stopStatsTimer();
          }
        });

        room.on(lk.RoomEvent.ParticipantConnected, () => {
          void refreshStats(room, currentVideoTrack || currentTrackRef.current);
        });

        room.on(lk.RoomEvent.ParticipantDisconnected, () => {
          void refreshStats(room, currentVideoTrack || currentTrackRef.current);
        });

        room.on(lk.RoomEvent.ConnectionQualityChanged, () => {
          void refreshStats(room, currentVideoTrack || currentTrackRef.current);
        });

        room.on(lk.RoomEvent.TrackSubscribed, (track, _publication, _participant) => {
          void attachTrack(track);
        });

        room.on(lk.RoomEvent.TrackUnsubscribed, (track, _publication, _participant) => {
          detachTrack(track);
          void refreshStats(room, currentVideoTrack || currentTrackRef.current);
        });

        room.on(lk.RoomEvent.TrackSubscriptionFailed, (_trackSid, _participant, err) => {
          if (!cancelled) {
            setError(err?.message || "Track subscription failed");
            void refreshStats(room, currentVideoTrack || currentTrackRef.current);
          }
        });

        await room.prepareConnection(serverUrl, participantToken).catch(() => {});

        if (cancelled) return;

        await room.connect(serverUrl, participantToken, connectOptionsFromLivekit(normalizedSettings));

        if (cancelled) return;

        setState("LIVE");

        stopStatsTimer();
        statsTimerRef.current = setInterval(() => {
          void refreshStats(room, currentVideoTrack || currentTrackRef.current);
        }, 2000);

        await refreshStats(room, currentVideoTrack || currentTrackRef.current);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "LiveKit unavailable");
          setState("OFFLINE");
          stopStatsTimer();
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      stopStatsTimer();

      detachTrack(currentVideoTrack);
      detachTrack(currentAudioTrack);

      room?.disconnect();
      roomRef.current = null;

      if (media) {
        media.srcObject = null;
      }
      if (audio) {
        audio.srcObject = null;
      }
    };
  }, [channel, connection, livekitSettings, attempt, onTelemetry]);

  const retry = () => {
    setError("");
    setState("CONNECTING");
    setPlaying(false);
    setHasVideo(false);
    setStats(null);
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
    const audio = audioRef.current;

    if (!media && !audio) return;

    const nextMuted = !(media?.muted ?? audio?.muted ?? true);
    if (media) media.muted = nextMuted;
    if (audio) audio.muted = nextMuted;
    setMuted(nextMuted);
  };

  const toggleFullscreen = () => {
    const container = mediaRef.current?.parentElement;
    if (!container) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else container.requestFullscreen?.();
  };

  return (
    <div className={`relative overflow-hidden rounded-[1.8rem] border border-white/12 bg-black/95 shadow-2xl ${className || ""}`}>
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
        <Badge variant="outline" className="rounded-full border-white/15 bg-black/45 text-white backdrop-blur">
          {state === "LIVE" ? "Connected" : state === "RECONNECTING" ? "Reconnecting" : state === "OFFLINE" ? "Disconnected" : "Connecting"}
        </Badge>
        {stats?.qualityText && <Badge variant="outline" className="rounded-full border-white/15 bg-black/45 text-white backdrop-blur">{stats.qualityText}</Badge>}
      </div>
      <video
        ref={mediaRef}
        className="h-full w-full object-contain bg-black"
        poster={poster}
        autoPlay
        playsInline
        muted={muted}
        controls={false}
      />
      <audio ref={audioRef} autoPlay playsInline muted={muted} aria-hidden="true" />

      {!hasVideo && state !== "LIVE" && state !== "RECONNECTING" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white backdrop-blur-sm">
          <div className="text-center">
            <div className="mb-2 text-sm font-medium">
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

      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-full border border-white/10 bg-black/45 p-1.5 backdrop-blur-md">
        <button
          type="button"
          onClick={togglePlay}
          className="rounded-full p-2 text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          aria-label={playing ? "توقف" : "پخش"}
        >
          {playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>

        <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleMute}
          className="rounded-full p-2 text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          aria-label={muted ? "فعال کردن صدا" : "بی‌صدا کردن"}
        >
          {muted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>
        <button type="button" onClick={toggleFullscreen} className="rounded-full p-2 text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" aria-label="تمام صفحه">
          <Maximize2 className="h-4 w-4" />
        </button>
        </div>
      </div>
    </div>
  );
}
