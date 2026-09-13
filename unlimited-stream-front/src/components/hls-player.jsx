"use client";

import { useEffect, useRef } from "react";

// If a browser blocks unmuted autoplay, there's no server/app-side way to force
// sound on — it's a deliberate browser policy (Chrome's Media Engagement Index
// and similar), not something this code controls. The common workaround (used by
// Twitch and others): unmute on the very first interaction anywhere on the page,
// not just a click on the video itself, so sound turns on as soon as the visitor
// does anything at all instead of requiring them to find and click an unmute button.
function armUnmuteOnFirstInteraction(video) {
  const unmute = () => {
    video.muted = false;
    video.play().catch(() => {});
    cleanup();
  };
  const cleanup = () => {
    document.removeEventListener("click", unmute);
    document.removeEventListener("touchstart", unmute);
    document.removeEventListener("keydown", unmute);
  };
  document.addEventListener("click", unmute, { once: true });
  document.addEventListener("touchstart", unmute, { once: true });
  document.addEventListener("keydown", unmute, { once: true });
  return cleanup;
}

async function attemptPlay(video) {
  video.muted = false;
  try {
    await video.play();
    return null;
  } catch {
    video.muted = true;
    await video.play().catch(() => {});
    return armUnmuteOnFirstInteraction(video);
  }
}

export function HlsPlayer({ src, className, poster }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls;
    let cancelled = false;
    let disarmUnmute = null;

    async function play() {
      const cleanup = await attemptPlay(video);
      if (cancelled) {
        cleanup?.();
      } else {
        disarmUnmute = cleanup;
      }
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      play();
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (Hls.isSupported()) {
          hls = new Hls({
            // Segments are now 1s (see backend mediaServer.js) — stay close to the
            // live edge and nudge playback speed up slightly if we fall behind,
            // instead of just accumulating delay.
            liveSyncDuration: 2,
            liveMaxLatencyDuration: 6,
            maxLiveSyncPlaybackRate: 1.2,
            backBufferLength: 10,
          });
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, play);
        }
      });
    }

    return () => {
      cancelled = true;
      disarmUnmute?.();
      hls?.destroy();
    };
  }, [src]);

  return <video ref={videoRef} className={className} poster={poster} controls playsInline />;
}
