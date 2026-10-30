"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

// Hover label for icon-only buttons. Rendered in a portal (position: fixed) so it is never clipped by a
// scrolling rail or hidden under a popover, with a comfortable gap from the button.
const GAP = 14;

export function Tip({ label, side = "bottom", children, className = "" }) {
  const [at, setAt] = useState(null);
  const timer = useRef(null);
  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAt(r), 250);
  };
  const hide = () => { clearTimeout(timer.current); setAt(null); };
  let style;
  let cls = "";
  if (at) {
    if (side === "right") { style = { left: at.right + GAP, top: at.top + at.height / 2 }; cls = "-translate-y-1/2"; }
    else if (side === "top") { style = { left: at.left + at.width / 2, top: at.top - GAP }; cls = "-translate-x-1/2 -translate-y-full"; }
    else { style = { left: at.left + at.width / 2, top: at.bottom + GAP }; cls = "-translate-x-1/2"; }
  }
  return (
    <span className={`relative inline-flex ${className}`} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onPointerDown={hide}>
      {children}
      {at && typeof document !== "undefined" && createPortal(
        <span role="tooltip" style={style} className={`pointer-events-none fixed z-[200] whitespace-nowrap room-float rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${cls}`}>{label}</span>,
        document.body
      )}
    </span>
  );
}
