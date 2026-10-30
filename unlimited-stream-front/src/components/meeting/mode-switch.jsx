"use client";

import { useState } from "react";
import { Clapperboard, MonitorSmartphone } from "lucide-react";
import { api } from "@/lib/api";

// Staff-only: flips the class between studio (OBS) and desktop (interactive) on the same link.
export function ModeSwitch({ channel, mode, onChange, className = "" }) {
  const [busy, setBusy] = useState(false);
  const items = [["studio", "استودیویی", Clapperboard], ["desktop", "دسکتاپی", MonitorSmartphone]];
  async function pick(next) {
    if (next === mode || busy) return;
    setBusy(true);
    try { await api.meetingMode(channel, next); onChange?.(next); } finally { setBusy(false); }
  }
  return (
    <div className={`inline-flex gap-1.5 text-xs ${className}`} role="group" aria-label="حالت کلاس">
      {items.map(([value, label, Icon]) => (
        <button key={value} onClick={() => pick(value)} disabled={busy} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-medium transition ${mode === value ? "bg-[var(--accent)] text-white" : "bg-[color-mix(in_oklab,var(--s2)_55%,transparent)] text-[var(--ink-2)] hover:bg-[var(--s3)] hover:text-white"}`}>
          <Icon className="size-3.5" />{label}
        </button>
      ))}
    </div>
  );
}
