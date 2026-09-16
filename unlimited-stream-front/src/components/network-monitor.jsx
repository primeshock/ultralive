import { Badge } from "@/components/ui/badge";

function colorForQuality(text) {
  switch (text) {
    case "Excellent":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-500/20";
    case "Good":
      return "bg-sky-500/15 text-sky-700 border-sky-500/20";
    case "Fair":
      return "bg-amber-500/15 text-amber-800 border-amber-500/20";
    case "Poor":
      return "bg-rose-500/15 text-rose-700 border-rose-500/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function fmtMs(ms) {
  return ms === null || ms === undefined ? "—" : `${ms} ms`;
}

function fmtKbps(kbps) {
  return kbps === null || kbps === undefined ? "—" : `${kbps} kbps`;
}

function fmtResolution(resolution) {
  return resolution ? `${resolution.width}×${resolution.height}` : "—";
}

export function NetworkMonitor({ stats, compact = false }) {
  const quality = stats?.qualityText || "Disconnected";
  const status = stats?.reconnecting ? "Reconnecting" : stats?.state === "connected" ? "Connected" : stats?.state === "reconnecting" ? "Reconnecting" : stats?.state === "disconnected" ? "Disconnected" : "Connecting";

  const items = [
    ["Connection Quality", quality],
    ["Packet Loss", stats?.packetLossPct === null || stats?.packetLossPct === undefined ? "—" : `${stats.packetLossPct}%`],
    ["RTT / Latency", fmtMs(stats?.rttMs)],
    ["Jitter", fmtMs(stats?.jitterMs)],
    ["Incoming Bitrate", fmtKbps(stats?.incomingBitrateKbps ?? stats?.bitrateKbps)],
    ["Outgoing Bitrate", fmtKbps(stats?.outgoingBitrateKbps)],
    ["Resolution", fmtResolution(stats?.resolution)],
    ["FPS", stats?.fps === null || stats?.fps === undefined ? "—" : `${stats.fps}`],
    ["Codec", stats?.codec || "—"],
    ["Connection State", status],
    ["Participants", stats?.participants === null || stats?.participants === undefined ? "—" : `${stats.participants + 1}`],
  ];

  return (
    <section className={`glass-float flex flex-col gap-3 rounded-[1.75rem] text-white ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Network Monitor</p>
          <p className="text-xs text-white/45">Read-only LiveKit / WebRTC</p>
        </div>
        <Badge variant="outline" className={colorForQuality(quality)}>{quality}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 xl:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border/70 bg-background/55 p-3 shadow-sm backdrop-blur-sm dark:border-white/15 dark:bg-black/20">
            <p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p>
            <p className="mt-1 text-sm font-medium">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
