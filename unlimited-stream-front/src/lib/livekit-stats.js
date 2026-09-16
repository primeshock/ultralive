export function qualityLabel(quality) {
  switch (String(quality || "").toLowerCase()) {
    case "excellent":
      return "Excellent";
    case "good":
      return "Good";
    case "poor":
      return "Poor";
    case "lost":
      return "Disconnected";
    default:
      return "Fair";
  }
}

export function collectRtcStats({ room, track }) {
  const connectionQuality = room?.localParticipant?.connectionQuality || "unknown";
  const stats = {
    connectionQuality,
    qualityText: qualityLabel(connectionQuality),
    state: room?.state || "disconnected",
    reconnecting: String(room?.state || "").toLowerCase().includes("reconnecting"),
    participants: room?.remoteParticipants?.size ?? 0,
    bitrateKbps: track?.currentBitrate ? Math.round(track.currentBitrate / 1000) : null,
    incomingBitrateKbps: track?.currentBitrate ? Math.round(track.currentBitrate / 1000) : null,
    outgoingBitrateKbps: null,
    resolution: null,
    fps: null,
    codec: null,
    rttMs: null,
    jitterMs: null,
    packetLossPct: null,
    trackState: track?.streamState || null,
  };

  const reportPromise = track?.getRTCStatsReport?.() || room?.getStats?.().then((reports) => reports?.[0]);
  if (!reportPromise) return stats;

  return reportPromise.then((report) => {
    if (!report) return stats;

    const codecs = new Map();
    let inbound = null;
    let remoteInbound = null;
    let selectedPair = null;

    report.forEach((entry) => {
      if (entry.type === "codec") codecs.set(entry.id, entry);
      if (entry.type === "inbound-rtp" && entry.kind === "video" && !entry.isRemote) inbound = entry;
      if (entry.type === "remote-inbound-rtp") remoteInbound = entry;
      if (entry.type === "candidate-pair" && entry.state === "succeeded" && entry.nominated) selectedPair = entry;
    });

    const codec = codecs.get(inbound?.codecId || remoteInbound?.codecId);
    const packetLossBase = Number(inbound?.packetsLost || 0) + Number(inbound?.packetsReceived || 0);

    return {
      ...stats,
      bitrateKbps: stats.bitrateKbps,
      incomingBitrateKbps: track?.currentBitrate ? Math.round(track.currentBitrate / 1000) : stats.incomingBitrateKbps,
      outgoingBitrateKbps: null,
      resolution: inbound?.frameWidth && inbound?.frameHeight ? { width: inbound.frameWidth, height: inbound.frameHeight } : null,
      fps: inbound?.framesPerSecond ? Math.round(inbound.framesPerSecond) : null,
      codec: codec?.mimeType ? String(codec.mimeType).split("/")[1]?.toUpperCase() : null,
      rttMs: selectedPair?.currentRoundTripTime ? Math.round(selectedPair.currentRoundTripTime * 1000) : remoteInbound?.roundTripTime ? Math.round(remoteInbound.roundTripTime * 1000) : null,
      jitterMs: inbound?.jitter ? Math.round(inbound.jitter * 1000) : null,
      packetLossPct: packetLossBase > 0 ? Math.round((Number(inbound.packetsLost || 0) / packetLossBase) * 100) : null,
    };
  }).catch(() => stats);
}
