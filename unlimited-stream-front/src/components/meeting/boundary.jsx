"use client";

import { Component } from "react";

// A broken panel must never take the whole class down; show what failed and let the user retry.
export class PanelBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[class panel]", error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="m-3 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
        <p className="font-medium">این بخش با خطا مواجه شد (کلاس ادامه دارد).</p>
        <p className="mt-1 break-words text-[11px] opacity-80" dir="ltr">{String(this.state.error?.message || this.state.error)}</p>
        <button onClick={() => this.setState({ error: null })} className="mt-2 rounded-lg bg-[var(--s3)] px-3 py-1 hover:bg-[var(--s3)]">تلاش دوباره</button>
      </div>
    );
  }
}
