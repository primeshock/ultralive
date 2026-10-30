"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Highlighter, Eraser, Minus, Square, Circle, MoveUpRight, Type, Undo2, Trash2, ChevronRight, ChevronLeft, Plus } from "lucide-react";
import { api, API_URL } from "@/lib/api";
import { useBoardVersion } from "./board-store";

const BASE_W = 1600;
const COLORS = ["#111827", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ffffff"];
const WIDTHS = [3, 6, 12];
const TOOLS = [
  ["pen", Pencil, "قلم"], ["hl", Highlighter, "هایلایت"], ["eraser", Eraser, "پاک‌کن"], ["line", Minus, "خط"],
  ["rect", Square, "مستطیل"], ["ellipse", Circle, "بیضی"], ["arrow", MoveUpRight, "فلش"], ["text", Type, "متن"],
];

const pdfCache = new Map();
export async function loadPdf(url) {
  if (!pdfCache.has(url)) {
    pdfCache.set(url, (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const res = await fetch(`${API_URL}${url}`, { credentials: "include" });
      if (!res.ok) throw new Error("PDF load failed");
      return pdfjs.getDocument({ data: await res.arrayBuffer() }).promise;
    })());
  }
  return pdfCache.get(url);
}

function drawStroke(ctx, s, W, H) {
  const pts = s.p.map(([x, y]) => [x * W, y * H]);
  if (!pts.length) return;
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = s.c; ctx.fillStyle = s.c;
  ctx.lineWidth = s.t === "hl" ? s.w * 3.5 : s.w;
  if (s.t === "hl") ctx.globalAlpha = 0.35;
  if (s.t === "text") {
    ctx.font = `${Math.round(s.w * 6 + 14)}px Vazirmatn, Tahoma, sans-serif`;
    ctx.textBaseline = "top"; ctx.direction = "rtl"; ctx.textAlign = "right";
    s.s.split("\n").forEach((line, i) => ctx.fillText(line, pts[0][0], pts[0][1] + i * (s.w * 6 + 20)));
  } else if (s.t === "pen" || s.t === "hl") {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.1, pts[0][1]);
    ctx.stroke();
  } else if (pts.length > 1) {
    const [[x1, y1], [x2, y2]] = [pts[0], pts[pts.length - 1]];
    ctx.beginPath();
    if (s.t === "line" || s.t === "arrow") {
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      if (s.t === "arrow") {
        const a = Math.atan2(y2 - y1, x2 - x1), h = 16 + s.w * 2;
        ctx.moveTo(x2, y2); ctx.lineTo(x2 - h * Math.cos(a - 0.45), y2 - h * Math.sin(a - 0.45));
        ctx.moveTo(x2, y2); ctx.lineTo(x2 - h * Math.cos(a + 0.45), y2 - h * Math.sin(a + 0.45));
      }
    } else if (s.t === "rect") ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    else ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function hit(s, [px, py], r) {
  if (s.t === "text" || s.t === "rect" || s.t === "ellipse") {
    const xs = s.p.map((p) => p[0]), ys = s.p.map((p) => p[1]);
    return px >= Math.min(...xs) - r && px <= Math.max(...xs) + r * (s.t === "text" ? 12 : 1) && py >= Math.min(...ys) - r && py <= Math.max(...ys) + r * (s.t === "text" ? 4 : 1);
  }
  return s.p.some(([x, y], i) => {
    const near = Math.hypot(x - px, y - py) < r;
    if (near || i === 0) return near;
    const [ax, ay] = s.p[i - 1], dx = x - ax, dy = y - ay, len = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
    return Math.hypot(ax + t * dx - px, ay + t * dy - py) < r;
  });
}

/**
 * One drawing surface: blank board or a single PDF page, with live shared annotations.
 * pdf = { doc, page }  → the page is rendered underneath; otherwise a blank board is shown.
 */
export function AnnotatedSurface({ store, channel, boardKey, pdf, canDraw, publish, pager, ink, registerActions, onActivate }) {
  const box = useRef(null), baseRef = useRef(null), inkRef = useRef(null), saveTimer = useRef(null), mine = useRef([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pdfRatio, setRatio] = useState(9 / 16);
  const ratio = pdf ? pdfRatio : 9 / 16;
  const { tool, color, width } = ink || { tool: "pen", color: "#ef4444", width: WIDTHS[0] };
  const [draft, setDraft] = useState(null);
  const version = useBoardVersion(store);

  // fit the page inside the available box
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const bw = Math.max(0, el.clientWidth - 16), bh = Math.max(0, el.clientHeight - 16);
      const w = Math.min(bw, bh / ratio);
      setSize({ w: Math.floor(w), h: Math.floor(w * ratio) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);

  // base layer: PDF page or paper
  useEffect(() => {
    let cancelled = false;
    const base = baseRef.current;
    if (!base || !size.w) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    base.width = size.w * dpr; base.height = size.h * dpr;
    const ctx = base.getContext("2d");
    if (!pdf?.doc) { ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, base.width, base.height); return undefined; }
    pdf.doc.getPage(pdf.page).then((page) => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1 });
      const nextRatio = vp.height / vp.width;
      if (Math.abs(nextRatio - ratio) > 0.001) { setRatio(nextRatio); return; }
      const scale = (size.w * dpr) / vp.width;
      const task = page.render({ canvasContext: ctx, viewport: page.getViewport({ scale }), canvas: base });
      task.promise.catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pdf?.doc, pdf?.page, size.w, size.h, ratio]); // eslint-disable-line react-hooks/exhaustive-deps

  // load persisted strokes once per key
  useEffect(() => {
    if (store.isLoaded(boardKey)) return;
    api.meetingBoardGet(channel, boardKey).then((r) => store.markLoaded(boardKey, r.strokes || [])).catch(() => store.markLoaded(boardKey, []));
  }, [store, channel, boardKey]);

  // ink layer
  useEffect(() => {
    const ink = inkRef.current;
    if (!ink || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ink.width = size.w * dpr; ink.height = size.h * dpr;
    const ctx = ink.getContext("2d");
    const k = ink.width / BASE_W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const H = BASE_W * ratio;
    for (const s of store.get(boardKey)) drawStroke(ctx, s, BASE_W, H);
    if (draft) drawStroke(ctx, draft, BASE_W, H);
  }, [store, boardKey, size, ratio, draft, version]);

  const save = useCallback(() => {
    if (!canDraw) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => api.meetingBoardSave(channel, boardKey, store.get(boardKey)).catch(() => {}), 1200);
  }, [canDraw, channel, boardKey, store]);
  useEffect(() => () => clearTimeout(saveTimer.current), [boardKey]);

  const norm = (e) => { const r = inkRef.current.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  const fire = (message) => { publish?.({ ...message, key: boardKey }); };

  function erase(p) {
    const ids = store.get(boardKey).filter((s) => hit(s, p, 0.02)).map((s) => s.id);
    if (!ids.length) return;
    store.remove(boardKey, ids); fire({ type: "wb-del", ids }); save();
  }

  function down(e) {
    if (!canDraw) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onActivate?.(boardKey);
    const p = norm(e);
    if (tool === "eraser") { erase(p); setDraft({ t: "eraser-active", p: [], c: "#000", w: 1 }); return; }
    if (tool === "text") {
      const text = window.prompt("متن را وارد کنید");
      if (text?.trim()) commit({ id: crypto.randomUUID(), t: "text", c: color, w: width, p: [p], s: text.trim().slice(0, 300) });
      return;
    }
    setDraft({ id: crypto.randomUUID(), t: tool, c: color, w: width, p: [p] });
  }
  function move(e) {
    if (!draft || !canDraw) return;
    const p = norm(e);
    if (tool === "eraser") { erase(p); return; }
    setDraft((d) => {
      if (!d) return d;
      if (d.t === "pen" || d.t === "hl") { const last = d.p[d.p.length - 1]; return Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.0015 ? d : { ...d, p: [...d.p, p] }; }
      return { ...d, p: [d.p[0], p] };
    });
  }
  function up() {
    if (!draft) return;
    setDraft(null);
    if (tool === "eraser" || draft.t === "eraser-active") return;
    const step = (draft.t === "pen" || draft.t === "hl") && draft.p.length > 300 ? Math.ceil(draft.p.length / 300) : 1;
    const points = draft.p.filter((_, i) => i % step === 0 || i === draft.p.length - 1)
      .map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]);
    commit({ ...draft, p: points });
  }
  function commit(stroke) {
    store.add(boardKey, stroke); mine.current.push({ key: boardKey, id: stroke.id });
    fire({ type: "wb-add", stroke }); save();
  }
  function undo() {
    while (mine.current.length) {
      const last = mine.current.pop();
      if (last.key !== boardKey) continue;
      store.remove(boardKey, [last.id]); fire({ type: "wb-del", ids: [last.id] }); save(); return;
    }
  }
  function clearAll() { if (window.confirm("همهٔ نوشته‌های این صفحه پاک شود؟")) { store.clear(boardKey); fire({ type: "wb-clear" }); save(); } }

  useEffect(() => {
    registerActions?.(boardKey, { undo, clear: clearAll });
    return () => registerActions?.(boardKey, null);
  });

  const btn = "grid size-8 shrink-0 place-items-center rounded-lg transition";
  return (
    <div className="relative flex h-full w-full flex-col">
      <div ref={box} className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-slate-900/60 p-2">
        <div className="relative shadow-2xl" style={{ width: size.w, height: size.h }}>
          <canvas ref={baseRef} className="absolute inset-0 h-full w-full rounded-sm" />
          <canvas ref={inkRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className={`absolute inset-0 h-full w-full ${canDraw ? "cursor-crosshair" : ""}`} style={{ touchAction: canDraw ? "none" : "auto" }} />
        </div>
      </div>
      {pager && <div className="flex items-center justify-center gap-2 border-t border-white/10 bg-slate-950/60 px-2 py-1.5 text-xs text-white/80">{pager.canChange ? (<>
        <button onClick={() => pager.set(pager.page + 1)} disabled={pager.page >= pager.total && !pager.canAdd} className={`${btn} hover:bg-white/10 disabled:opacity-30`} aria-label="بعدی">{pager.page >= pager.total && pager.canAdd ? <Plus className="size-4" /> : <ChevronRight className="size-4" />}</button>
        <span className="tabular-nums" dir="ltr">{pager.page} / {Math.max(pager.total, pager.page)}</span>
        <button onClick={() => pager.set(pager.page - 1)} disabled={pager.page <= 1} className={`${btn} hover:bg-white/10 disabled:opacity-30`} aria-label="قبلی"><ChevronLeft className="size-4" /></button>
      </>) : <span className="tabular-nums" dir="ltr">{pager.page} / {Math.max(pager.total, pager.page)}</span>}</div>}
    </div>
  );
}

export { TOOLS as INK_TOOLS, COLORS as INK_COLORS, WIDTHS as INK_WIDTHS };
