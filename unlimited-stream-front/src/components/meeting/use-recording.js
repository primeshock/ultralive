"use client";

import { useState } from "react";
import { api } from "@/lib/api";

// Recording state machine shared by the class rooms: idle -> recording <-> paused (each resume = a new file).
export function useRecording(channel, flash, initial) {
  const [rec, setRec] = useState(initial || { state: "idle", acc: 0, since: 0 });
  async function recAction(action) {
    try {
      const t = Date.now();
      if (action === "start" || action === "resume") {
        await api.meetingRecording(channel, "start");
        setRec((r) => ({ state: "recording", acc: action === "start" ? 0 : r.acc, since: t }));
        flash(action === "start" ? "ضبط کلاس شروع شد." : "ضبط ادامه یافت (فایل جدید).");
      } else if (action === "pause") {
        await api.meetingRecording(channel, "stop");
        setRec((r) => ({ state: "paused", acc: r.acc + Math.round((t - r.since) / 1000), since: 0 }));
        flash("ضبط موقتاً متوقف شد؛ فایل این بخش ذخیره می‌شود.");
      } else {
        if (rec.state === "recording") await api.meetingRecording(channel, "stop");
        setRec({ state: "idle", acc: 0, since: 0 });
        flash("ضبط پایان یافت؛ فایل‌ها در تب «فایل‌ها» ظاهر می‌شوند.");
      }
    } catch (e) { flash(e.message, 10000); }
  }
  return [rec, setRec, recAction];
}
