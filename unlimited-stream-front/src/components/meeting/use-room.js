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
    // two peer connections (publisher/subscriber) are the most robust choice for interactive publishing:
    // camera/board changes never renegotiate the connection everybody is receiving on
    singlePeerConnection: false,
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

// Reasons for which rejoining makes no sense (kicked, class closed, same user joined elsewhere).
const FINAL = ["PARTICIPANT_REMOVED", "ROOM_DELETED", "DUPLICATE_IDENTITY", "CLIENT_INITIATED"];

// Connects to the class room, re-renders on roster/track changes (throttled — with hundreds of people
// speaking/quality events fire constantly) and silently rejoins with a fresh token after a drop.
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
    let everConnected = false;
    let retry = 0;
    let retryTimer = null;
    let renderTimer = null;
    let lastRender = 0;

    const schedule = () => {
      if (renderTimer) return;
      renderTimer = setTimeout(() => { renderTimer = null; lastRender = Date.now(); bump(); }, Math.max(0, 300 - (Date.now() - lastRender)));
    };

    async function join() {
      try {
        const lk = await import("livekit-client");
        const credentials = await api.livekitToken(channel);
        if (cancelled) return;
        const next = new lk.Room(buildRoomOptions(lk, livekitSettings));
        for (const name of EVENTS) if (lk.RoomEvent[name]) next.on(lk.RoomEvent[name], schedule);
        next.on(lk.RoomEvent.ConnectionStateChanged, (st) => { setState(String(st) === "connected" ? "connected" : String(st)); schedule(); });
        next.on(lk.RoomEvent.Disconnected, (reason) => {
          if (cancelled || next !== current) return;
          const name = Object.keys(lk.DisconnectReason || {}).find((k) => lk.DisconnectReason[k] === reason);
          if (FINAL.includes(name)) { setState("disconnected"); return; }
          setState("reconnecting");
          retryTimer = setTimeout(join, Math.min(10000, 1000 * 1.6 ** retry++));
        });
        next.on(lk.RoomEvent.DataReceived, (payload, participant) => {
          try { dataRef.current?.(JSON.parse(new TextDecoder().decode(payload)), participant); } catch { /* ignore malformed */ }
        });
        const old = current;
        current = next;
        await next.connect(credentials.serverUrl, credentials.participantToken, connectOptionsFromLivekit(livekitSettings));
        if (cancelled) { next.disconnect(); return; }
        old?.disconnect();
        await next.startAudio().catch(() => {});
        everConnected = true; retry = 0;
        setRoom(next);
        setState("connected");
      } catch (err) {
        if (cancelled) return;
        if (everConnected) { setState("reconnecting"); retryTimer = setTimeout(join, Math.min(10000, 1000 * 1.6 ** retry++)); }
        else { setError(err?.message || "اتصال به کلاس برقرار نشد."); setState("failed"); }
      }
    }
    join();
    return () => { cancelled = true; clearTimeout(retryTimer); clearTimeout(renderTimer); current?.disconnect(); };
  }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  return { room, state, error };
}
