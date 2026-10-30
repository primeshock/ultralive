"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Highlighter, Eraser, Minus, Square, Circle, MoveUpRight, Type, Hand, ChevronRight, ChevronLeft, Plus, ZoomIn, ZoomOut, RotateCcw, Link2 } from "lucide-react";
import { api, API_URL } from "@/lib/api";
import { useBoardVersion } from "./board-store";

const BASE_W = 1600;
const MAX_Z = 5;
const COLORS = ["#111827", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ffffff"];
const WIDTHS = [3, 6, 12];
const TOOLS = [
  ["pan", Hand, "جابه‌جایی صفحه"], ["pen", Pencil, "قلم"], ["hl", Highlighter, "هایلایت"], ["eraser", Eraser, "پاک‌کن"],
  ["line", Minus, "خط"], ["rect", Square, "مستطیل"], ["ellipse", Circle, "بیضی"], ["arrow", MoveUpRight, "فلش"], ["text", Type, "متن"],
];

// Only the pages that are actually shown are fetched (HTTP range requests), so a 300-page PDF opens instantly.
const pdfCache = new Map();
export async function loadPdf(url) {
  if (!pdfCache.has(url)) {
    pdfCache.set(url, (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs.getDocument({ url: `${API_URL}${url}`, withCredentials: true, disableAutoFetch: true, rangeChunkSize: 262144 }).promise;
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

const clampZ = (z) => Math.min(MAX_Z, Math.max(1, z));

/**
 * One drawing surface: blank board or a single PDF page, with live shared annotations,
 * zoom + drag-to-pan (mouse, touch, pinch) for everybody, and an optional "follow presenter" view.
 */
export function AnnotatedSurface({ store, channel, boardKey, pdf, canDraw, publish, pager, ink, registerActions, onActivate, remoteView }) {
  const box = useRef(null), baseRef = useRef(null), inkRef = useRef(null), saveTimer = useRef(null), mine = useRef([]);
  const pointers = useRef(new Map()), gesture = useRef(null), lastSent = useRef(0);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [pdfRatio, setRatio] = useState(9 / 16);
  const ratio = pdf ? pdfRatio : 9 / 16;
  const [draft, setDraft] = useState(null);
  const [own, setOwn] = useState({ z: 1, cx: 0.5, cy: 0.5 }); // own view: zoom + centre in page coordinates (0..1)
  const [following, setFollowing] = useState(true);
  const version = useBoardVersion(store);
  const { tool, color, width } = ink || { tool: "pen", color: "#ef4444", width: WIDTHS[0] };

  // fit-to-box size at zoom 1
  const fit = vp.w ? (() => { const w = Math.min(vp.w, vp.h / ratio); return { w: Math.floor(w), h: Math.floor(w * ratio) }; })() : { w: 0, h: 0 };
  const following_ = !canDraw && following && remoteView && remoteView.key === boardKey;
  const view = following_ ? { z: remoteView.z, cx: remoteView.cx, cy: remoteView.cy } : own;
  const z = clampZ(view.z);
  const W = fit.w * z, H = fit.h * z;
  // translate so that (cx, cy) sits at the viewport centre, never letting the page leave the box
  const place = (len, vlen, c) => (len <= vlen ? (vlen - len) / 2 : Math.min(0, Math.max(vlen - len, vlen / 2 - c * len)));
  const tx = place(W, vp.w, view.cx), ty = place(H, vp.h, view.cy);

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setVp({ w: Math.max(0, el.clientWidth), h: Math.max(0, el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // pixel size of the canvases: quantised to 25% zoom steps so zooming does not re-render on every wheel tick
  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const renderZ = Math.ceil(z * 4) / 4;
  const pxW = Math.max(1, Math.min(Math.round(fit.w * renderZ * dpr), 4096));
  const pxH = Math.max(1, Math.round(pxW * ratio));

  // base layer: PDF page or paper
  useEffect(() => {
    let cancelled = false;
    const base = baseRef.current;
    if (!base || !fit.w) return undefined;
    base.width = pxW; base.height = pxH;
    const ctx = base.getContext("2d");
    if (!pdf?.doc) { ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, pxW, pxH); return undefined; }
    pdf.doc.getPage(pdf.page).then((page) => {
      if (cancelled) return;
      const vpt = page.getViewport({ scale: 1 });
      const nextRatio = vpt.height / vpt.width;
      if (Math.abs(nextRatio - ratio) > 0.001) { setRatio(nextRatio); return; }
      page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: pxW / vpt.width }), canvas: base }).promise.catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pdf?.doc, pdf?.page, pxW, pxH, ratio, fit.w]); // eslint-disable-line react-hooks/exhaustive-deps

  // load persisted strokes once per key
  useEffect(() => {
    if (store.isLoaded(boardKey)) return;
    api.meetingBoardGet(channel, boardKey).then((r) => store.markLoaded(boardKey, r.strokes || [])).catch(() => store.markLoaded(boardKey, []));
  }, [store, channel, boardKey]);

  // ink layer
  useEffect(() => {
    const el = inkRef.current;
    if (!el || !fit.w) return;
    el.width = pxW; el.height = pxH;
    const ctx = el.getContext("2d");
    ctx.setTransform(pxW / BASE_W, 0, 0, pxW / BASE_W, 0, 0);
    const Hh = BASE_W * ratio;
    for (const s of store.get(boardKey)) drawStroke(ctx, s, BASE_W, Hh);
    if (draft) drawStroke(ctx, draft, BASE_W, Hh);
  }, [store, boardKey, pxW, pxH, ratio, draft, version, fit.w]);

  const save = useCallback(() => {
    if (!canDraw) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => api.meetingBoardSave(channel, boardKey, store.get(boardKey)).catch(() => {}), 1200);
  }, [canDraw, channel, boardKey, store]);
  useEffect(() => () => clearTimeout(saveTimer.current), [boardKey]);

  const norm = (e) => { const r = inkRef.current.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  const fire = (message) => { publish?.({ ...message, key: boardKey }); };

  // ---- view changes (zoom / pan). The presenter's view is broadcast; viewers may detach and move freely.
  const commitView = useCallback((next) => {
    const nz = clampZ(next.z);
    const nextView = { z: nz, cx: Math.min(1, Math.max(0, next.cx)), cy: Math.min(1, Math.max(0, next.cy)) };
    setOwn(nextView);
    if (!canDraw) setFollowing(false);
    else if (Date.now() - lastSent.current > 80) { lastSent.current = Date.now(); publish?.({ type: "wb-view", key: boardKey, ...nextView }); }
  }, [canDraw, publish, boardKey]);
  const zoomAt = (factor, px, py) => {
    const nz = clampZ(z * factor);
    if (nz === z) return;
    // keep the point under the cursor fixed
    const ax = px === undefined ? 0.5 : (px - tx) / W, ay = py === undefined ? 0.5 : (py - ty) / H;
    const sx = px === undefined ? vp.w / 2 : px, sy = py === undefined ? vp.h / 2 : py;
    const nW = fit.w * nz, nH = fit.h * nz;
    commitView({ z: nz, cx: ax + (nW > vp.w ? (vp.w / 2 - sx) / nW : 0), cy: ay + (nH > vp.h ? (vp.h / 2 - sy) / nH : 0) });
  };

  useEffect(() => { // ctrl/cmd + wheel zooms at the cursor; plain wheel pans a zoomed page
    const el = box.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey) && z <= 1) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
      else commitView({ z, cx: view.cx + e.deltaX / W, cy: view.cy + e.deltaY / H });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  function erase(p) {
    const ids = store.get(boardKey).filter((s) => hit(s, p, 0.02)).map((s) => s.id);
    if (!ids.length) return;
    store.remove(boardKey, ids); fire({ type: "wb-del", ids }); save();
  }

  function down(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) { // pinch
      const [a, b] = [...pointers.current.values()];
      gesture.current = { type: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y), z };
      setDraft(null);
      return;
    }
    const panning = !canDraw || tool === "pan";
    if (panning) { gesture.current = { type: "pan", x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; return; }
    onActivate?.(boardKey);
    const p = norm(e);
    if (tool === "eraser") { erase(p); setDraft({ t: "eraser-active", p: [], c: "#000", w: 1 }); return; }
    if (tool === "text") {
      const text = window.prompt("متن را وارد کنید");
      if (text?.trim()) commit({ id: crypto.randomUUID(), t: "text", c: color, w: width, p: [p], s: text.trim().slice(0, 300) });
      return;
    }
    gesture.current = { type: "draw" };
    setDraft({ id: crypto.randomUUID(), t: tool, c: color, w: width, p: [p] });
  }
  function move(e) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g?.type === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      commitView({ z: g.z * (d / (g.d || 1)), cx: view.cx, cy: view.cy });
      return;
    }
    if (g?.type === "pan") {
      commitView({ z, cx: g.cx - (e.clientX - g.x) / W, cy: g.cy - (e.clientY - g.y) / H });
      return;
    }
    if (!draft || !canDraw) return;
    const p = norm(e);
    if (tool === "eraser") { erase(p); return; }
    setDraft((d) => {
      if (!d) return d;
      if (d.t === "pen" || d.t === "hl") { const last = d.p[d.p.length - 1]; return Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.0015 ? d : { ...d, p: [...d.p, p] }; }
      return { ...d, p: [d.p[0], p] };
    });
  }
  function up(e) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.type === "pinch" || g?.type === "pan") { if (pointers.current.size === 0) gesture.current = null; return; }
    gesture.current = null;
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
  const gbtn = "grid size-7 place-items-center rounded-lg border border-white/20 bg-slate-950/80 text-white shadow-lg shadow-black/40 backdrop-blur-md transition hover:bg-slate-800/90 disabled:opacity-40";
  const panCursor = !canDraw || tool === "pan" ? (z > 1 ? "cursor-grab" : "") : "cursor-crosshair";
  return (
    <div className="relative flex h-full w-full flex-col">
      <div ref={box} className="relative min-h-0 flex-1 overflow-hidden bg-slate-900/60">
        {fit.w > 0 && (
          <div className="absolute left-0 top-0 shadow-2xl will-change-transform" style={{ width: W, height: H, transform: `translate(${tx}px, ${ty}px)` }}>
            <canvas ref={baseRef} className="absolute inset-0 h-full w-full" />
            <canvas ref={inkRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className={`absolute inset-0 h-full w-full ${panCursor}`} style={{ touchAction: "none" }} />
          </div>
        )}
        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1" dir="ltr">
          <button aria-label="کوچک‌نمایی" title="کوچک‌نمایی" onClick={() => zoomAt(1 / 1.25)} disabled={z <= 1} className={gbtn}><ZoomOut className="size-3.5" /></button>
          <span className="min-w-[38px] rounded-lg border border-white/20 bg-slate-950/80 px-1.5 py-1 text-center text-[10px] tabular-nums text-white shadow-lg shadow-black/40 backdrop-blur-md">{Math.round(z * 100)}%</span>
          <button aria-label="بزرگ‌نمایی" title="بزرگ‌نمایی" onClick={() => zoomAt(1.25)} disabled={z >= MAX_Z} className={gbtn}><ZoomIn className="size-3.5" /></button>
          <button aria-label="اندازهٔ اصلی" title="اندازهٔ اصلی" onClick={() => commitView({ z: 1, cx: 0.5, cy: 0.5 })} disabled={z === 1} className={gbtn}><RotateCcw className="size-3.5" /></button>
        </div>
        {!canDraw && remoteView && remoteView.key === boardKey && !following && (
          <button onClick={() => setFollowing(true)} className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 rounded-lg border border-sky-300/40 bg-slate-950/85 px-2.5 py-1 text-[11px] text-sky-100 shadow-lg shadow-black/40 backdrop-blur-md hover:bg-slate-800/90"><Link2 className="size-3" />همگام با ارائه‌دهنده</button>
        )}
      </div>
      {pager && <div className="flex shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-white/80">{pager.canChange ? (<>
        <button onClick={() => pager.set(pager.page + 1)} disabled={pager.page >= pager.total && !pager.canAdd} className={`${btn} hover:bg-white/10 disabled:opacity-30`} aria-label="بعدی">{pager.page >= pager.total && pager.canAdd ? <Plus className="size-4" /> : <ChevronRight className="size-4" />}</button>
        <span className="tabular-nums" dir="ltr">{pager.page} / {Math.max(pager.total, pager.page)}</span>
        <button onClick={() => pager.set(pager.page - 1)} disabled={pager.page <= 1} className={`${btn} hover:bg-white/10 disabled:opacity-30`} aria-label="قبلی"><ChevronLeft className="size-4" /></button>
      </>) : <span className="tabular-nums" dir="ltr">{pager.page} / {Math.max(pager.total, pager.page)}</span>}</div>}
    </div>
  );
}

export { TOOLS as INK_TOOLS, COLORS as INK_COLORS, WIDTHS as INK_WIDTHS };
