"use client";

import { useEffect, useState } from "react";
import { use as usePromise } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveKitPlayer } from "@/components/livekit-player";
import { LiveChat } from "@/components/live-chat";
import { PollWidget } from "@/components/poll-widget";
import { ClassAdminPanel } from "@/components/class-admin-panel";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function ChannelPage({ params }) {
  const { username } = usePromise(params);
  const { user } = useAuth();
  const [channel, setChannel] = useState(null);
  const [accessAllowed, setAccessAllowed] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [playback, setPlayback] = useState({ enabled: false, mode: "auto" });
  const [chatMode, setChatMode] = useState("public");

  useEffect(() => {
    api.classAccess(username).then(({ allowed }) => setAccessAllowed(allowed)).catch(() => setAccessAllowed(false));
  }, [username]);

  useEffect(() => {
    if (!accessAllowed) return;
    // Checked once — if LiveKit isn't configured on the server this stays
    // false forever and the player below behaves exactly as before.
    api.livekitStatus().then((s) => setPlayback({ enabled: Boolean(s?.enabled), mode: s?.playbackMode || "auto" })).catch(() => {});
  }, [accessAllowed]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { channel } = await api.channel(username);
        if (!cancelled) {
          setChannel(channel);
          setChatMode(channel.chatMode || "public");
        }
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
  }, [username, accessAllowed]);

  if (accessAllowed === false) return <div className="flex-1 flex items-center justify-center px-4 text-center">برای ورود به کلاس باید از لینک سایت اصلی یا لینک همگانی کلاس استفاده کنید.</div>;

  if (notFound) {
    return (
      <div className="flex-1 flex items-center justify-center">
        این کانال وجود نداره.
      </div>
    );
  }

  if (accessAllowed === null || !channel) {
    return (
      <div className="flex-1 flex items-center justify-center">
        در حال بارگذاری...
      </div>
    );
  }

  const useLiveKit = playback.enabled || playback.mode === "livekit";
  const canManageClass = user && ["admin", "owner"].includes(user.role);

  async function handleChatMode(mode) {
    await api.setChatMode(username, mode);
    setChatMode(mode);
  }

  async function handleViewerCount(enabled) {
    await api.setViewerCount(username, enabled);
    setChannel((current) => ({ ...current, showViewerCount: enabled }));
  }

  return (
    <div className="mx-auto max-w-6xl w-full px-4 py-6 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 lg:h-[calc(100dvh_-_3.5rem_-_3rem)]">
      <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
        <div className="aspect-video bg-black rounded-lg overflow-hidden shrink-0">
          {channel.isLive && useLiveKit ? (
              <LiveKitPlayer
                channel={username}
                poster={channel.thumbnailUrl}
                className="w-full h-full"
              />
          ) : channel.thumbnailUrl ? (
            <div className="relative w-full h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={channel.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover opacity-40"
              />
              <div className="absolute inset-0 flex items-center justify-center text-white/90">
                {channel.isLive ? "پخش در دسترس نیست" : "کلاس هنوز شروع نشده"}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/70">
              {channel.isLive ? "پخش در دسترس نیست" : "کلاس هنوز شروع نشده"}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              {channel.streamTitle || `پخش زنده ${channel.username}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {channel.displayName || channel.username}{channel.showViewerCount && ` · ${channel.viewerCount || 0} بیننده`}
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

        <PollWidget channel={username} />
        {canManageClass && <ClassAdminPanel channel={username} thumbnailUrl={channel.thumbnailUrl} chatMode={chatMode} showViewerCount={channel.showViewerCount} viewerCount={channel.viewerCount || 0} onChatMode={handleChatMode} onViewerCount={handleViewerCount} onThumbnail={(thumbnailUrl) => setChannel((current) => ({ ...current, thumbnailUrl }))} />}
      </div>

      <div className="h-[70dvh] lg:h-full min-h-0">
        <LiveChat key={username} channel={username} initialEnabled={channel.chatEnabled} />
      </div>
    </div>
  );
}
