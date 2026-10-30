"use client";

const LABEL = { excellent: ["عالی", "text-emerald-300"], good: ["خوب", "text-emerald-200"], poor: ["ضعیف", "text-amber-300"], lost: ["قطع", "text-rose-300"] };
const dash = (v, unit) => (v === null || v === undefined ? "—" : `${v}${unit}`);

// Minimal connection panel: only what helps someone decide whether their connection is the problem.
export function NetworkMonitor({ stats }) {
  const [text, tone] = LABEL[stats?.connectionQuality] || ["در حال اتصال", "text-white/60"];
  const rows = [
    ["وضعیت اتصال", <span key="q" className={tone}>{text}</span>],
    ["تأخیر", dash(stats?.rttMs, " ms")],
    ["افت بسته", dash(stats?.packetLossPct, "٪")],
    ["سرعت دریافت", dash(stats?.incomingBitrateKbps ?? stats?.bitrateKbps, " kbps")],
    ["کیفیت تصویر", stats?.resolution ? `${stats.resolution.height}p` : "—"],
  ];
  return (
    <div dir="rtl" className="w-60 rounded-2xl border border-white/14 bg-[#0b1226]/92 p-3 text-white shadow-2xl backdrop-blur-xl">
      <p className="mb-2 text-xs font-semibold text-white/85">کیفیت اتصال</p>
      <dl className="space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-b border-white/6 pb-1.5 text-[12px] last:border-0 last:pb-0">
            <dt className="text-white/55">{label}</dt>
            <dd className="tabular-nums" dir="ltr">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
