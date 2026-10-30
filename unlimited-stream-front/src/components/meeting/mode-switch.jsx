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
    <div className={`inline-flex rounded-xl border border-white/15 bg-white/8 p-1 text-xs backdrop-blur ${className}`} role="group" aria-label="حالت کلاس">
      {items.map(([value, label, Icon]) => (
        <button key={value} onClick={() => pick(value)} disabled={busy} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${mode === value ? "bg-sky-500 text-white shadow" : "text-white/70 hover:bg-white/10"}`}>
          <Icon className="size-3.5" />{label}
        </button>
      ))}
    </div>
  );
}
