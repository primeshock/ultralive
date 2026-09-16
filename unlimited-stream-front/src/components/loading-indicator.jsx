export function LoadingIndicator({ label = "در حال بارگذاری...", className = "", overlay = true }) {
  const content = (
    <div className={`loading-orbital-content ${className}`} role="status" aria-live="polite">
      <div className="loading-orbit" aria-hidden="true">
        <span className="loading-orb loading-orb-one" />
        <span className="loading-orb loading-orb-two" />
        <span className="loading-orb loading-orb-three" />
        <span className="loading-orb loading-orb-four" />
        <span className="loading-orb loading-orb-five" />
        <span className="loading-orbital-core" />
      </div>
      <span className="loading-orbital-label">{label}</span>
    </div>
  );

  if (!overlay) return content;

  return <div className="loading-overlay">{content}</div>;
}
