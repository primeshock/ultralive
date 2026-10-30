"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { api } from "@/lib/api";
import { ParticipantRow } from "./panels";

// Studio mode, admin only: live student roster with "request activation" (call) controls.
export function StudioStudentList({ channel }) {
  const [rows, setRows] = useState([]);
  const load = useCallback(() => api.meetingParticipants(channel).then(setRows).catch(() => {}), [channel]);
  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);
  const students = rows.filter((r) => !r.isStaff).sort((a, b) => Number(b.handRaised) - Number(a.handRaised));
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-white shadow-xl backdrop-blur">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Users className="size-4 text-sky-300" />دانش‌آموزان آنلاین</h3>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">{students.length}</span>
      </header>
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {students.length === 0 && <p className="py-5 text-center text-sm text-white/45">هنوز دانش‌آموزی وارد نشده است.</p>}
        {students.map((row) => <ParticipantRow key={row.identity} channel={channel} data={row} isStaff onChanged={load} />)}
      </div>
    </section>
  );
}
