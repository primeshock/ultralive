"use client";

const COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#bf5af2", "#64d2ff", "#ffd60a", "#ac8e68"];

export function PollResultsChart({ results = [] }) {
  const safeResults = Array.isArray(results) ? results : [];
  const total = safeResults.reduce((sum, option) => sum + (Number(option.count) || 0), 0);
  let cursor = 0;
  const segments = safeResults.map((option, index) => {
    const start = total ? (cursor / total) * 360 : 0;
    cursor += Number(option.count) || 0;
    const end = total ? (cursor / total) * 360 : 360;
    return `${COLORS[index % COLORS.length]} ${start}deg ${end}deg`;
  });

  return (
    <div className="grid gap-4 sm:grid-cols-[150px_1fr] items-center rounded-2xl border border-white/40 bg-white/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.75)] backdrop-blur-xl dark:bg-white/10">
      <div
        className="mx-auto size-32 rounded-full shadow-inner"
        style={{ background: total ? `conic-gradient(${segments.join(", ")})` : "#d2d2d7" }}
        aria-label="نمودار درصد پاسخ‌ها"
      >
        <div className="m-5 flex size-22 items-center justify-center rounded-full bg-background/90 text-center text-xs font-semibold">
          {total ? `${total} رأی` : "بدون رأی"}
        </div>
      </div>
      <div className="grid gap-2">
        {safeResults.map((option, index) => {
          const percent = total ? Math.round(((Number(option.count) || 0) / total) * 100) : 0;
          return (
            <div key={String(option.optionId || option.id)} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-sm">
              <span className="flex size-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS[index % COLORS.length] }}>{index + 1}</span>
              <span className="min-w-0 truncate">{option.text}</span>
              <span className="text-muted-foreground">{percent}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
