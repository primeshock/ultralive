"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Volume2, VolumeX, Pause, Play, RefreshCw, Maximize2 } from "lucide-react";
import { api } from "@/lib/api";
import { collectRtcStats, qualityLabel } from "@/lib/livekit-stats";
import { connectOptionsFromLivekit, normalizeLivekitSettings, roomOptionsFromLivekit } from "@/lib/livekit-settings";

function describeLivekitError(error, context = {}) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
    stack: error?.stack || null,
    code: error?.code ?? null,
    reason: error?.reason ?? null,
    ...context,
  };
}

export function LiveKitPlayer({ channel, className, poster, connection, livekitSettings, onTelemetry }) {
  const mediaRef = useRef(null);
  const roomRef = useRef(null);
  const currentTrackRef = useRef(null);
  const statsTimerRef = useRef(null);
  const lastVideoTimeRef = useRef(null);
  const stalledChecksRef = useRef(0);

  const [state, setState] = useState("CONNECTING");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);
  const [stats, setStats] = useState(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    let room;
    let currentVideoTrack = null;
    let currentAudioTrack = null;
    const media = mediaRef.current;

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

      const collected = await Promise.resolve(collectRtcStats({ room: roomToInspect, track: currentTrack })).catch(() => baseStats);
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

    async function recoverPlayback() {
      if (!media || cancelled || media.readyState < 2) return;
      try {
        await media.play();
        setPlaying(true);
        stalledChecksRef.current = 0;
        setError("");
      } catch {
        setPlaying(false);
      }
    }

    function checkPlayback() {
      if (!media || cancelled || !currentVideoTrack || stateRef.current !== "LIVE") return;
      const currentTime = media.currentTime;
      if (media.readyState >= 2 && !media.paused && lastVideoTimeRef.current === currentTime) {
        stalledChecksRef.current += 1;
        if (stalledChecksRef.current >= 3) void recoverPlayback();
      } else {
        stalledChecksRef.current = 0;
      }
      lastVideoTimeRef.current = currentTime;
    }

    function detachTrack(track) {
      if (!track) return;

      if (media) track.detach(media);

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

      const element = media;
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
      } else if (track.kind === "audio" && media.paused) {
        try {
          await media.play();
        } catch {
          // Browser autoplay policy may require the viewer to press play.
        }
      }

      await refreshStats(room, currentVideoTrack || currentTrackRef.current);
    }

    async function start() {
      let credentials = null;
      try {
        setState("CONNECTING");
        credentials = connection || await api.livekitToken(channel);
        const { serverUrl, participantToken } = credentials;

        if (cancelled || !serverUrl || !participantToken) {
          throw new Error("LiveKit is not configured");
        }

        const lk = await import("livekit-client");

        room = new lk.Room(roomOptionsFromLivekit(normalizedSettings));

        roomRef.current = room;

        room.on(lk.RoomEvent.ConnectionStateChanged, (nextState) => {
          console.info("[LiveKit] ConnectionStateChanged", {
            room: credentials?.roomName || null,
            state: nextState,
          });
          if (nextState === lk.ConnectionState.Connected) setState("LIVE");
          else if (nextState === lk.ConnectionState.Reconnecting || nextState === lk.ConnectionState.SignalReconnecting) setState("RECONNECTING");
          else if (nextState === lk.ConnectionState.Disconnected) setState("OFFLINE");
          else setState("CONNECTING");
        });

        room.on(lk.RoomEvent.Reconnecting, () => {
          console.warn("[LiveKit] Reconnecting", { room: credentials?.roomName || null });
          if (!cancelled) {
            setState("RECONNECTING");
            refreshStats(room, currentVideoTrack || currentTrackRef.current);
          }
        });

        room.on(lk.RoomEvent.Reconnected, () => {
          console.info("[LiveKit] Reconnected", { room: credentials?.roomName || null });
          if (!cancelled) {
            setState("LIVE");
            void refreshStats(room, currentVideoTrack || currentTrackRef.current);
          }
        });

        room.on(lk.RoomEvent.Disconnected, (reason) => {
          console.warn("[LiveKit] Disconnected", {
            room: credentials?.roomName || null,
            reason: reason || null,
          });
          if (!cancelled) {
            setError("ارتباط قطع شد. لطفاً دوباره تلاش کنید.");
            setState("FAILED");
            stopStatsTimer();
          }
        });

        room.on(lk.RoomEvent.ParticipantConnected, (participant) => {
          console.info("[LiveKit] ParticipantConnected", {
            room: credentials?.roomName || null,
            participant: participant?.identity || null,
          });
          void refreshStats(room, currentVideoTrack || currentTrackRef.current);
        });

        room.on(lk.RoomEvent.ParticipantDisconnected, (participant, reason) => {
          console.info("[LiveKit] ParticipantDisconnected", {
            room: credentials?.roomName || null,
            participant: participant?.identity || null,
            reason: reason || null,
          });
          void refreshStats(room, currentVideoTrack || currentTrackRef.current);
        });

        room.on(lk.RoomEvent.ConnectionQualityChanged, () => {
          void refreshStats(room, currentVideoTrack || currentTrackRef.current);
        });

        room.on(lk.RoomEvent.TrackSubscribed, (track, publication, participant) => {
          console.info("[LiveKit] TrackSubscribed", {
            room: room.name,
            participant: participant?.identity || null,
            trackSid: publication?.trackSid || publication?.sid || null,
            kind: track?.kind || null,
          });
          void attachTrack(track).catch((err) => {
            console.error("[LiveKit] TrackSubscribed handler error", describeLivekitError(err, {
              room: room.name,
              participant: participant?.identity || null,
            }));
            if (!cancelled) setError("پخش ناپایدار است. در حال تلاش برای بازیابی...");
          });
        });

        room.on(lk.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
          console.info("[LiveKit] TrackUnsubscribed", {
            room: room.name,
            participant: participant?.identity || null,
            trackSid: publication?.trackSid || publication?.sid || null,
            kind: track?.kind || null,
          });
          detachTrack(track);
          void refreshStats(room, currentVideoTrack || currentTrackRef.current);
        });

        room.on(lk.RoomEvent.TrackSubscriptionFailed, (trackSid, participant) => {
          const subscriptionError = new Error("LiveKit track subscription failed");
          console.error("[LiveKit] TrackSubscriptionFailed", describeLivekitError(subscriptionError, {
            room: room.name,
            participant: participant?.identity || null,
            trackSid: trackSid || null,
          }));
          if (!cancelled) {
            setError("دریافت تصویر با مشکل مواجه شد. در حال تلاش برای بازیابی...");
            void refreshStats(room, currentVideoTrack || currentTrackRef.current);
          }
        });

        room.on(lk.RoomEvent.TrackMuted, (publication) => {
          if (!cancelled && publication?.kind === "video") {
            setError("تصویر موقتاً متوقف شده؛ در حال بازیابی...");
          }
        });

        room.on(lk.RoomEvent.TrackUnmuted, (publication) => {
          if (!cancelled && publication?.kind === "video") {
            setError("");
            void recoverPlayback();
          }
        });

        if (cancelled) return;

        console.info("[LiveKit] connecting", {
          roomName: credentials.roomName || room.name || null,
          serverUrl,
          hasToken: Boolean(participantToken),
        });
        await room.connect(serverUrl, participantToken, connectOptionsFromLivekit(normalizedSettings));

        if (cancelled) return;

        console.info("[LiveKit] connected", {
          room: credentials.roomName || null,
          serverUrl,
          state: room.state,
          participants: room.remoteParticipants?.size || 0,
        });
        setState("LIVE");

        stopStatsTimer();
        statsTimerRef.current = setInterval(() => {
          void refreshStats(room, currentVideoTrack || currentTrackRef.current);
          checkPlayback();
        }, 2000);

        await refreshStats(room, currentVideoTrack || currentTrackRef.current);
      } catch (err) {
        if (!cancelled) {
          const details = describeLivekitError(err, {
            room: room?.name || credentials?.roomName || null,
            state: room?.state || "not-created",
            serverUrl: credentials?.serverUrl || null,
          });
          console.error("[LiveKit] connection failed", details);
          setError("امکان اتصال به پخش زنده وجود ندارد.");
          setState("FAILED");
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
    if (!media) return;

    const nextMuted = !media.muted;
    media.muted = nextMuted;
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
          {state === "LIVE" ? "پخش زنده" : state === "RECONNECTING" ? "در حال اتصال مجدد..." : state === "FAILED" ? "ارتباط قطع است" : "در حال اتصال..."}
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
