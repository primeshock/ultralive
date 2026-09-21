"use client";

import { useEffect, useState } from "react";
import { use as usePromise } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Radio, Users, Sparkles, Activity } from "lucide-react";
import { LiveKitPlayer } from "@/components/livekit-player";
import { LiveChat } from "@/components/live-chat";
import { PollWidget } from "@/components/poll-widget";
import { ClassAdminPanel } from "@/components/class-admin-panel";
import { NetworkMonitor } from "@/components/network-monitor";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function ChannelPage({ params }) {
  const { username } = usePromise(params);
  const searchParams = useSearchParams();
  const previewOnly = searchParams.get("preview") === "1";
  const { user, loading: authLoading, setUser } = useAuth();
  const [channel, setChannel] = useState(null);
  const [accessAllowed, setAccessAllowed] = useState(null);
  const [accessOptions, setAccessOptions] = useState({ loginAllowed: true, guestAllowed: false });
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [guestPhone, setGuestPhone] = useState("");
  const [accessError, setAccessError] = useState("");
  const [accessBusy, setAccessBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [playback, setPlayback] = useState({ enabled: false, mode: "auto" });
  const [chatMode, setChatMode] = useState("public");
  const [livekitStatus, setLivekitStatus] = useState(null);
  const [networkStats, setNetworkStats] = useState(null);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [appearance, setAppearance] = useState(null);

  useEffect(() => {
    api.sessionAccess(username).then((result) => { setAccessOptions(result); setAccessAllowed(result.allowed); }).catch(() => setAccessAllowed(false));
  }, [username, user]);

  useEffect(() => {
    api.site().then((site) => setAppearance((current) => current || site.appearance || null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!accessAllowed) return;
    // Checked once — if LiveKit isn't configured on the server this stays
    // false forever and the player below behaves exactly as before.
    api.livekitStatus().then((s) => {
      setPlayback({ enabled: Boolean(s?.enabled), mode: s?.playbackMode || "auto" });
      setLivekitStatus(s || null);
    }).catch(() => {});
  }, [accessAllowed]);

  useEffect(() => {
    if (authLoading || accessAllowed !== true) return;
    let cancelled = false;

    async function load() {
      try {
        const { channel } = await api.channel(username);
        if (!cancelled) {
          setChannel(channel);
          setChatMode(channel.chatMode || "public");
          setAppearance(channel.appearance || null);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      }
    }

    load();
    const id = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [authLoading, username, accessAllowed]);

  async function refreshAccess() {
    const result = await api.sessionAccess(username);
    setAccessOptions(result);
    setAccessAllowed(result.allowed);
    return result;
  }

  async function handleStudentLogin(event) {
    event.preventDefault();
    setAccessBusy(true);
    setAccessError("");
    try {
      const result = await api.login(loginForm.username, loginForm.password);
      setUser(result.user);
      const access = await refreshAccess();
      if (!access.allowed) setAccessError("این دانش‌آموز به این کلاس دسترسی ندارد.");
    } catch (error) {
      setAccessError(error.message || "ورود انجام نشد.");
    } finally {
      setAccessBusy(false);
    }
  }

  async function handleGuestJoin(event) {
    event.preventDefault();
    setAccessBusy(true);
    setAccessError("");
    try {
      await api.guestJoin(username, guestPhone);
      await refreshAccess();
    } catch (error) {
      setAccessError(error.message || "ورود مهمان انجام نشد.");
    } finally {
      setAccessBusy(false);
    }
  }

  if (accessAllowed === false) return <div className="spatial-shell flex flex-1 items-center justify-center overflow-hidden px-4 py-10" data-appearance={appearance?.preset || "aurora"} style={{ "--background-darkness": `${(appearance?.backgroundDarkness ?? 52) / 100}`, "--glass-blur": `${appearance?.glassBlur ?? 22}px`, "--glass-opacity": `${(appearance?.glassOpacity ?? 62) / 100}`, "--glow-alpha": `${(appearance?.glowIntensity ?? 55) / 260}` }}><div className="relative w-full max-w-2xl"><div className="pointer-events-none absolute -inset-12 rounded-[3rem] bg-cyan-400/10 blur-3xl" /><div className="glass-float relative rounded-[2rem] p-6 sm:p-8"><div className="mb-7 text-center"><div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-cyan-200/25 bg-cyan-300/10 text-cyan-100 shadow-[0_0_40px_rgb(34_211_238_/_0.18)]"><Radio className="size-7" /></div><Badge className="mb-3 border-cyan-200/20 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/10">ورود به کلاس</Badge><h1 className="text-2xl font-bold text-white sm:text-3xl">آماده‌ای وارد کلاس بشی؟</h1><p className="mt-2 text-sm text-slate-300">یکی از روش‌های ورود فعال این کلاس را انتخاب کن.</p></div>{accessError && <p className="mb-4 rounded-xl border border-rose-300/30 bg-rose-400/10 p-3 text-sm text-rose-100">{accessError}</p>}{accessOptions.loginAllowed || accessOptions.guestAllowed ? <div className={`grid gap-4 ${accessOptions.loginAllowed && accessOptions.guestAllowed ? "md:grid-cols-2" : "max-w-md mx-auto"}`}>{accessOptions.loginAllowed && <form onSubmit={handleStudentLogin} className="space-y-3 rounded-2xl border border-white/15 bg-white/[0.07] p-4 shadow-inner shadow-white/5"><div><h2 className="font-semibold text-white">ورود دانش‌آموز</h2><p className="mt-1 text-xs text-slate-300">برای اعضای ثبت‌شده کلاس</p></div><input className="h-10 w-full rounded-xl border border-white/15 bg-slate-950/35 px-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20" dir="ltr" placeholder="نام کاربری" value={loginForm.username} onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })} required /><input className="h-10 w-full rounded-xl border border-white/15 bg-slate-950/35 px-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20" dir="ltr" type="password" placeholder="رمز عبور" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} required /><Button className="w-full rounded-xl bg-cyan-300 text-slate-950 hover:bg-cyan-200" type="submit" disabled={accessBusy}>ورود دانش‌آموز</Button></form>}{accessOptions.guestAllowed && <form onSubmit={handleGuestJoin} className="space-y-3 rounded-2xl border border-fuchsia-200/20 bg-fuchsia-300/[0.08] p-4 shadow-inner shadow-fuchsia-200/5"><div><h2 className="font-semibold text-white">ورود مهمان</h2><p className="mt-1 text-xs text-slate-300">شماره موبایل ۱۱ رقمی الزامی است</p></div><input className="h-10 w-full rounded-xl border border-white/15 bg-slate-950/35 px-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-fuchsia-300/60 focus:ring-2 focus:ring-fuchsia-300/20" dir="ltr" inputMode="numeric" type="tel" pattern="09[0-9]{9}" placeholder="09123456789" value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} minLength={11} maxLength={11} required /><Button className="w-full rounded-xl border-fuchsia-200/30 text-fuchsia-100 hover:bg-fuchsia-300/15" variant="outline" type="submit" disabled={accessBusy}>ورود به‌عنوان مهمان</Button></form>}</div> : <p className="rounded-xl border border-white/15 bg-white/[0.06] p-4 text-center text-sm text-slate-300">دسترسی این کلاس فقط از لینک اختصاصی یا API امکان‌پذیر است.</p>}</div></div></div>;

  if (notFound) {
    return (
      <div className="flex-1 flex items-center justify-center">
        این کانال وجود نداره.
      </div>
    );
  }

  if (authLoading || accessAllowed === null || !channel) {
    return (
      <div className="flex-1 flex items-center justify-center">
        در حال بارگذاری...
      </div>
    );
  }

  const useLiveKit = playback.enabled || playback.mode === "livekit";
  const canManageClass = user && [
    "admin",
    "owner",
    "SUPER_OWNER",
    "ORGANIZATION_OWNER",
    "ADMIN_L1",
    "ADMIN_L2",
  ].includes(user.role);

  async function handleChatMode(mode) {
    await api.setChatMode(username, mode);
    setChatMode(mode);
  }

  async function handleViewerCount(enabled) {
    await api.setViewerCount(username, enabled);
    setChannel((current) => ({ ...current, showViewerCount: enabled }));
  }

  const appearanceStyle = {
    "--background-darkness": `${(appearance?.backgroundDarkness ?? 52) / 100}`,
    "--glass-blur": `${appearance?.glassBlur ?? 22}px`,
    "--glass-opacity": `${(appearance?.glassOpacity ?? 62) / 100}`,
    "--glow-alpha": `${(appearance?.glowIntensity ?? 55) / 260}`,
    "--appearance-image": appearance?.backgroundUrl ? `url(${appearance.backgroundUrl})` : "none",
    "--appearance-image-opacity": appearance?.backgroundUrl ? `${1 - ((appearance?.backgroundDarkness ?? 52) / 130)}` : "0",
  };

  return (
    <div className="spatial-shell min-h-[calc(100dvh_-_3.5rem)]" data-appearance={appearance?.preset || "aurora"} style={appearanceStyle}>
      <div className={`relative mx-auto grid w-full max-w-[1540px] grid-cols-1 gap-5 px-4 py-5 lg:px-8 ${previewOnly ? "max-w-5xl" : "xl:grid-cols-[minmax(0,1fr)_390px]"}`}>
      <div className="flex min-h-0 flex-col gap-5">
        <div className="glass-float relative aspect-video overflow-hidden rounded-[2rem] border-white/20 p-1 shadow-[0_30px_100px_rgb(0_0_0_/_0.38)]">
          <div className="pointer-events-none absolute inset-0 z-10 rounded-[1.8rem] ring-1 ring-inset ring-white/10" />
          {channel.isLive && useLiveKit ? (
            <LiveKitPlayer
              channel={username}
              poster={channel.thumbnailUrl}
              livekitSettings={livekitStatus?.livekit}
              onTelemetry={setNetworkStats}
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

        <div className="flex flex-wrap items-center justify-between gap-4 px-2">
          <div>
            {channel.organization?.logoUrl && <img src={channel.organization.logoUrl} alt={channel.organization.name || "سازمان"} className="mb-3 h-10 w-auto object-contain" />}
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-cyan-200/70"><Sparkles className="size-3.5" /> Ultra Live classroom</div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {channel.streamTitle || channel.displayName || "کلاس زنده"}
            </h1>
            <p className="mt-1 text-sm text-white/55">
              {channel.displayName || "کلاس"}{channel.showViewerCount && ` · ${channel.viewerCount || 0} بیننده`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {channel.isLive && <Badge className="live-pulse rounded-full border-rose-300/30 bg-rose-500/15 text-rose-100"><Radio className="size-3" /> LIVE</Badge>}
            {channel.showViewerCount && <div className="glass-float flex items-center gap-2 rounded-full px-3 py-2 text-xs text-white/70"><Users className="size-3.5 text-cyan-200" /> {channel.viewerCount || 0}</div>}
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

        {!previewOnly && <PollWidget channel={username} />}
        {!previewOnly && canManageClass && <ClassAdminPanel channel={username} thumbnailUrl={channel.thumbnailUrl} chatMode={chatMode} showViewerCount={channel.showViewerCount} viewerCount={channel.viewerCount || 0} onChatMode={handleChatMode} onViewerCount={handleViewerCount} onThumbnail={(thumbnailUrl) => setChannel((current) => ({ ...current, thumbnailUrl }))} />}
      </div>

      {!previewOnly && <div className="flex min-h-0 flex-col gap-3 xl:sticky xl:top-20 xl:h-[calc(100dvh_-_6.5rem)]">
        <div className="relative flex min-h-[480px] flex-1 flex-col overflow-visible">
          <button
            type="button"
            onClick={() => setNetworkOpen((open) => !open)}
            aria-expanded={networkOpen}
            aria-controls="network-monitor-panel"
            className="absolute left-3 top-3 z-30 inline-flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/75 px-3 text-[11px] font-medium text-white/80 shadow-lg backdrop-blur-xl transition hover:border-cyan-300/45 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <Activity className="size-3.5 text-cyan-200" />
            Network
            <span className={`size-1.5 rounded-full ${networkStats?.reconnecting ? "bg-amber-300" : networkStats?.state === "connected" ? "bg-emerald-400" : "bg-white/35"}`} />
          </button>
          {networkOpen && (
            <div id="network-monitor-panel" className="absolute inset-x-0 top-12 z-20">
              <NetworkMonitor stats={networkStats} compact />
            </div>
          )}
          <div className="glass-float flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem]">
          <LiveChat key={username} channel={username} initialEnabled={channel.chatEnabled} />
          </div>
        </div>
      </div>}
      </div>
    </div>
  );
}
