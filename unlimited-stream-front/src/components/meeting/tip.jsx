"use client";

// Hover label for icon-only buttons (shows the name right under / above / beside the button).
const POS = {
  bottom: "top-full mt-1.5 left-1/2 -translate-x-1/2",
  top: "bottom-full mb-1.5 left-1/2 -translate-x-1/2",
  right: "left-full ms-2 top-1/2 -translate-y-1/2",
};

export function Tip({ label, side = "bottom", children, className = "" }) {
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children}
      <span role="tooltip" className={`pointer-events-none absolute z-[90] whitespace-nowrap room-float rounded-md px-2 py-1 text-[11px] font-normal opacity-0 transition-opacity delay-150 group-hover/tip:opacity-100 ${POS[side]}`}>{label}</span>
    </span>
  );
}
