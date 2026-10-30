"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { roomOptionsFromLivekit, connectOptionsFromLivekit } from "@/lib/livekit-settings";
import { api } from "@/lib/api";

// Tuned for interactive classes: simulcast + dynacast + adaptive stream keep CPU/bandwidth
// low, Opus DTX/RED protects speech on bad links, VP8 is the lowest-latency codec every
// browser can encode in software, screen share favours legibility over frame rate.
export function buildRoomOptions(lk, livekitSettings) {
  const base = roomOptionsFromLivekit(livekitSettings);
  return {
    ...base,
    adaptiveStream: true,
    dynacast: true,
    stopLocalTrackOnUnpublish: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    videoCaptureDefaults: { resolution: lk.VideoPresets.h720.resolution, facingMode: "user" },
    publishDefaults: {
      simulcast: true,
      videoCodec: "vp8",
      backupCodec: true,
      videoSimulcastLayers: [lk.VideoPresets.h180, lk.VideoPresets.h360],
      videoEncoding: lk.VideoPresets.h720.encoding,
      screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 },
      screenShareSimulcastLayers: [],
      dtx: true,
      red: true,
      audioPreset: lk.AudioPresets.speech,
    },
  };
}

const EVENTS = [
  "ParticipantConnected", "ParticipantDisconnected", "TrackPublished", "TrackUnpublished", "TrackSubscribed",
  "TrackUnsubscribed", "TrackMuted", "TrackUnmuted", "ParticipantAttributesChanged", "ParticipantPermissionsChanged",
  "ActiveSpeakersChanged", "ConnectionQualityChanged", "LocalTrackPublished", "LocalTrackUnpublished", "ParticipantNameChanged",
];

// Connects to the class room and re-renders on any roster/track change.
export function useClassRoom({ channel, livekitSettings, onData }) {
  const [room, setRoom] = useState(null);
  const [state, setState] = useState("connecting");
  const [error, setError] = useState("");
  const [, bump] = useReducer((n) => n + 1, 0);
  const dataRef = useRef(onData);
  useEffect(() => { dataRef.current = onData; });

  useEffect(() => {
    let cancelled = false;
    let current = null;
    (async () => {
      try {
        const lk = await import("livekit-client");
        const credentials = await api.livekitToken(channel);
        current = new lk.Room(buildRoomOptions(lk, livekitSettings));
        for (const name of EVENTS) if (lk.RoomEvent[name]) current.on(lk.RoomEvent[name], bump);
        current.on(lk.RoomEvent.ConnectionStateChanged, (next) => { setState(String(next)); bump(); });
        current.on(lk.RoomEvent.Disconnected, () => setState("disconnected"));
        current.on(lk.RoomEvent.DataReceived, (payload, participant) => {
          try { dataRef.current?.(JSON.parse(new TextDecoder().decode(payload)), participant); } catch { /* ignore malformed */ }
        });
        await current.connect(credentials.serverUrl, credentials.participantToken, connectOptionsFromLivekit(livekitSettings));
        if (cancelled) { current.disconnect(); return; }
        await current.startAudio().catch(() => {});
        setRoom(current);
        setState("connected");
      } catch (err) {
        if (!cancelled) { setError(err?.message || "اتصال به کلاس برقرار نشد."); setState("failed"); }
      }
    })();
    return () => { cancelled = true; current?.disconnect(); };
  }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  return { room, state, error };
}
