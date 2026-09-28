"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const EMPTY_ITEMS = [];

export function isActiveRestriction(item) {
  return item.scope === "permanent" || new Date(item.expiresAt).getTime() > Date.now();
}

export function useModeration(identity, mode = "channel", enabled = true) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    if (!enabled || !identity) return;
    const rows = await (mode === "class" ? api.classModeration(identity) : api.listModeration(identity));
    setItems(rows); setReady(`${mode}:${identity}`); setError("");
  }, [identity, mode, enabled]);
  useEffect(() => {
    let cancelled = false;
    let timer;
    let inFlight = false;
    async function load() {
      if (inFlight || cancelled || !enabled || !identity) return;
      inFlight = true;
      try {
        const rows = await (mode === "class" ? api.classModeration(identity) : api.listModeration(identity));
        if (!cancelled) { setItems(rows); setReady(`${mode}:${identity}`); setError(""); }
      } catch (err) { if (!cancelled) setError(err.message); }
      finally { inFlight = false; }
    }
    async function poll() { await load(); if (!cancelled) timer = setTimeout(poll, 5000); }
    void poll();
    const sync = () => { void load(); };
    window.addEventListener("moderation:changed", sync);
    window.addEventListener("focus", sync);
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener("moderation:changed", sync); window.removeEventListener("focus", sync); };
  }, [identity, mode, enabled]);
  function restrictionFor(externalUserId, type) {
    if (ready !== `${mode}:${identity}`) return undefined;
    return items.find((item) => item.type === type && isActiveRestriction(item) &&
      [item.externalUserId, ...(item.identities || [])].map(String).includes(String(externalUserId)));
  }
  async function change(student, type, scope = "permanent") {
    setBusy(true); setError("");
    try {
      const existing = restrictionFor(student.externalId || student.externalUserId, type);
      if (existing) {
        if (mode === "class") await api.removeClassModeration(identity, existing._id);
        else await api.removeModeration(existing._id);
      } else {
        const payload = { externalUserId: student.externalId || student.externalUserId, type, scope, minutes: scope === "timed" ? 10 : undefined };
        if (mode === "class") await api.moderateStudent(identity, { ...payload, studentId: student._id });
        else await api.moderate(identity, payload);
      }
      await refresh();
      window.dispatchEvent(new Event("moderation:changed"));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return { items: ready === `${mode}:${identity}` ? items : EMPTY_ITEMS, error, busy, ready: ready === `${mode}:${identity}`, refresh, restrictionFor, change };
}
