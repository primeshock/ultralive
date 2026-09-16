import { LoaderCircle } from "lucide-react";

const sizes = {
  sm: "size-4",
  md: "size-7",
  lg: "size-10",
};

export function LoadingIndicator({ label = "در حال بارگذاری...", size = "md", className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-muted-foreground ${className}`} role="status" aria-live="polite">
      <LoaderCircle className={`${sizes[size] || sizes.md} animate-spin text-cyan-400`} aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
