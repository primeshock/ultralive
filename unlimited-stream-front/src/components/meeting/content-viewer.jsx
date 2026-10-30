"use client";

import { API_URL } from "@/lib/api";

// Renders what the host presents inside its own panel: PDF, image, video or audio.
// Media is letter-boxed (object-contain) so the full frame is always visible and the
// panel never grows beyond its box.
export function ContentViewer({ content }) {
  const src = `${API_URL}${content.url}`;
  const mime = content.mime || "";
  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-950/70">
      {mime === "application/pdf" && <iframe title={content.name} src={`${src}#view=FitH&toolbar=1`} className="absolute inset-0 h-full w-full border-0 bg-white" />}
      {mime.startsWith("image/") && (
        <div className="absolute inset-0 flex items-center justify-center p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={content.name} className="max-h-full max-w-full rounded-md object-contain shadow-2xl" />
        </div>
      )}
      {mime.startsWith("video/") && (
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <video src={src} controls playsInline className="max-h-full max-w-full rounded-md bg-black object-contain shadow-2xl" />
        </div>
      )}
      {mime.startsWith("audio/") && <div className="absolute inset-0 grid place-items-center p-6"><div className="w-full max-w-md space-y-3 text-center"><p className="text-sm text-white/80">{content.name}</p><audio src={src} controls className="w-full" /></div></div>}
    </div>
  );
}
