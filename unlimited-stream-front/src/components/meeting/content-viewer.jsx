"use client";

import { API_URL } from "@/lib/api";

// Renders whatever the host is presenting: PDF, image, video or audio.
export function ContentViewer({ content }) {
  const src = `${API_URL}${content.url}`;
  const mime = content.mime || "";
  return (
    <div className="grid h-full w-full place-items-center overflow-hidden rounded-2xl bg-slate-950/70">
      {mime === "application/pdf" && <iframe title={content.name} src={`${src}#view=FitH&toolbar=1`} className="h-full w-full border-0 bg-white" />}
      {mime.startsWith("image/") && /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt={content.name} className="max-h-full max-w-full object-contain" />}
      {mime.startsWith("video/") && <video src={src} controls autoPlay playsInline className="max-h-full max-w-full" />}
      {mime.startsWith("audio/") && <div className="w-full max-w-md space-y-3 p-6 text-center"><p className="text-sm text-white/80">{content.name}</p><audio src={src} controls autoPlay className="w-full" /></div>}
    </div>
  );
}
