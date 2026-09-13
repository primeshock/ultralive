"use client";

import { useEffect, useState } from "react";
import { use as usePromise } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HlsPlayer } from "@/components/hls-player";
import { LiveKitPlayer } from "@/components/livekit-player";
import { PollPanel } from "@/components/poll-panel";
import { LiveChat } from "@/components/live-chat";
import { api, hlsUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function ChannelPage({ params }) {
  const { username } = usePromise(params);
  const [channel, setChannel] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;

    async function loadAccess() {
      if (user) return true;
      try { await api.studentSession(username); return true; } catch { if (!cancelled) setAccessDenied(true); return false; }
    }

    async function load() {
      if (!(await loadAccess())) return;
      try {
        const { channel } = await api.channel(username);
        if (!cancelled) setChannel(channel);
      } catch {
        if (!cancelled) setNotFound(true);
      }
    }

    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [username, user]);

  if (notFound) {
    return (
      <div className="flex-1 flex items-center justify-center">
        این کانال وجود نداره.
      </div>
    );
  }


  if (accessDenied) {
    return <div className="flex-1 grid place-items-center p-8 text-center"><div><h1 className="text-xl font-bold">دسترسی به کلاس ممکن نیست</h1><p className="text-muted-foreground mt-2">از لینک ورود کلاس که توسط سایت اصلی صادر شده وارد شوید.</p></div></div>;
  }

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center">
        در حال بارگذاری...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl w-full px-4 py-6 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 lg:h-[calc(100dvh_-_3.5rem_-_3rem)]">
      <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
        <div className="aspect-video bg-black rounded-lg overflow-hidden shrink-0">
          {channel.isLive ? (
            process.env.NEXT_PUBLIC_LIVEKIT_ENABLED === "true" ? (
              <LiveKitPlayer channel={username} poster={channel.thumbnailUrl} className="w-full h-full" />
            ) : (
              <HlsPlayer src={hlsUrl(username)} poster={channel.thumbnailUrl} className="w-full h-full" />
            )
          ) : channel.thumbnailUrl ? (
            <div className="relative w-full h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={channel.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover opacity-40"
              />
              <div className="absolute inset-0 flex items-center justify-center text-white/90">
                این کانال الان آفلاینه
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/70">
              این کانال الان آفلاینه
            </div>
          )}
        </div>

        <PollPanel channel={username} />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              {channel.streamTitle || `پخش زنده ${channel.username}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {channel.displayName || channel.username} · {channel.viewerCount} بیننده
            </p>
          </div>
          <div className="flex items-center gap-2">
            {channel.isLive && <Badge variant="destructive">لایو</Badge>}
            {channel.donateUrl && (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href={channel.donateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                دونیت
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="h-[70dvh] lg:h-full min-h-0">
        <LiveChat key={username} channel={username} initialEnabled={channel.chatEnabled} />
      </div>
    </div>
  );
}
