"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { recommendedLivekitSettings } from "@/lib/livekit-settings";

function fmtMb(mb) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} گیگ` : `${mb} مگ`;
}

function FieldHint({ text }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex size-4 items-center justify-center rounded-full border text-[10px] text-muted-foreground">?</span>} />
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const APPEARANCE_PRESETS = {
  aurora: { backgroundDarkness: 52, glassOpacity: 62, glassBlur: 22, glowIntensity: 55 },
  gemini: { backgroundDarkness: 44, glassOpacity: 56, glassBlur: 26, glowIntensity: 78 },
  "apple-dark": { backgroundDarkness: 72, glassOpacity: 70, glassBlur: 18, glowIntensity: 28 },
  custom: { backgroundDarkness: 52, glassOpacity: 62, glassBlur: 22, glowIntensity: 55 },
};

export default function MasterPage() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();

  const [admins, setAdmins] = useState([]);
  const [channels, setChannels] = useState([]);
  const [settings, setSettings] = useState(null);
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [msg, setMsg] = useState("");

  const [adminForm, setAdminForm] = useState({ username: "", password: "" });
  const [adminEdits, setAdminEdits] = useState({});
  const [ownerForm, setOwnerForm] = useState({ username: "", currentPassword: "", password: "" });
  const [logoFile, setLogoFile] = useState(null);
  const [faviconFile, setFaviconFile] = useState(null);
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [livekitForm, setLivekitForm] = useState(recommendedLivekitSettings());
  const [appearanceForm, setAppearanceForm] = useState({ preset: "aurora", backgroundUrl: "", backgroundDarkness: 52, glassOpacity: 62, glassBlur: 22, glowIntensity: 55 });

  useEffect(() => {
    if (!loading && (!user || user.role !== "owner")) router.replace("/");
  }, [loading, user, router]);

  async function loadAll() {
    const [a, c, s, st, log] = await Promise.all([
      api.listAdmins(),
      api.listAllChannels(),
      api.getSettings(),
      api.systemStats().catch(() => null),
      api.activityLog().catch(() => []),
    ]);
    setAdmins(a);
    setChannels(c || []);
    setAdminEdits(Object.fromEntries((a || []).map((admin) => [admin._id || admin.id, { username: admin.username, password: "" }])));
    setSettings(s);
    setLivekitForm(s?.livekit || recommendedLivekitSettings());
    setAppearanceForm(s?.appearance || { preset: "aurora", backgroundUrl: "", backgroundDarkness: 52, glassOpacity: 62, glassBlur: 22, glowIntensity: 55 });
    setStats(st);
    setActivity(log);
  }

  useEffect(() => {
    if (user?.role === "owner") Promise.resolve().then(loadAll);
  }, [user]);

  function flash(text) {
    setMsg(text);
    setTimeout(() => setMsg(""), 2500);
  }

  async function handleCreateAdmin(e) {
    e.preventDefault();
    try {
      await api.createAdmin(adminForm.username, adminForm.password);
      setAdminForm({ username: "", password: "" });
      flash("ادمین ساخته شد.");
      loadAll();
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleUpdateAdmin(id) {
    const edit = adminEdits[id] || {};
    const payload = {};
    if (edit.username) payload.username = edit.username.trim();
    if (edit.password) payload.password = edit.password;
    if (!payload.username && !payload.password) {
      flash("یوزرنیم یا رمز جدید را وارد کنید.");
      return;
    }
    try {
      await api.updateAdmin(id, payload);
      setAdminEdits((current) => ({ ...current, [id]: { ...current[id], password: "" } }));
      flash("اطلاعات ادمین ذخیره شد.");
      loadAll();
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleSettingsChange(patch) {
    try {
      const updated = await api.updateSettings(patch);
      setSettings(updated);
      setLivekitForm(updated?.livekit || recommendedLivekitSettings());
      flash("تنظیمات ذخیره شد.");
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleSaveLivekit(e) {
    e.preventDefault();
    const next = {
      video: {
        width: Number(livekitForm.video.width),
        height: Number(livekitForm.video.height),
        fps: Number(livekitForm.video.fps),
        maxBitrateKbps: Number(livekitForm.video.maxBitrateKbps),
        codec: livekitForm.video.codec,
        simulcast: Boolean(livekitForm.video.simulcast),
        simulcastLayers: Number(livekitForm.video.simulcastLayers),
      },
      connection: {
        adaptiveStream: Boolean(livekitForm.connection.adaptiveStream),
        dynacast: Boolean(livekitForm.connection.dynacast),
        maxRetries: Number(livekitForm.connection.maxRetries),
        peerConnectionTimeoutMs: Number(livekitForm.connection.peerConnectionTimeoutMs),
        retryDelayMs: Number(livekitForm.connection.retryDelayMs),
        maxRetryDelayMs: Number(livekitForm.connection.maxRetryDelayMs),
        iceTransportPolicy: livekitForm.connection.iceTransportPolicy,
      },
    };

    if (next.video.width < 320 || next.video.width > 3840) return flash("عرض ویدیو نامعتبر است.");
    if (next.video.height < 240 || next.video.height > 2160) return flash("ارتفاع ویدیو نامعتبر است.");
    if (next.video.fps < 1 || next.video.fps > 60) return flash("FPS نامعتبر است.");
    if (next.video.maxBitrateKbps < 150 || next.video.maxBitrateKbps > 20000) return flash("حداکثر bitrate نامعتبر است.");
    if (!["vp8", "h264"].includes(next.video.codec)) return flash("codec نامعتبر است.");
    if (next.video.simulcastLayers < 1 || next.video.simulcastLayers > 3) return flash("تعداد simulcast layers نامعتبر است.");
    if (next.connection.retryDelayMs < 100 || next.connection.retryDelayMs > 10000) return flash("تاخیر retry نامعتبر است.");
    if (next.connection.maxRetryDelayMs < next.connection.retryDelayMs || next.connection.maxRetryDelayMs > 30000) return flash("حداکثر تاخیر retry نامعتبر است.");

    try {
      const updated = await api.updateSettings({ livekit: next });
      setSettings(updated);
      setLivekitForm(updated?.livekit || next);
      flash("تنظیمات LiveKit ذخیره شد.");
    } catch (err) {
      flash(err.message);
    }
  }

  function resetLivekitRecommended() {
    setLivekitForm(recommendedLivekitSettings());
  }

  async function handleUpdateOwner(event) {
    event.preventDefault();
    const payload = {};
    const nextUsername = ownerForm.username.trim().toLowerCase();
    if (nextUsername && nextUsername !== user.username) payload.username = nextUsername;

    if (ownerForm.password) {
      if (!ownerForm.currentPassword) {
        flash("برای تغییر رمز، رمز فعلی را وارد کنید.");
        return;
      }
      payload.currentPassword = ownerForm.currentPassword;
      payload.password = ownerForm.password;
    }

    if (!payload.username && !payload.password) {
      flash("تغییری برای ذخیره وجود ندارد.");
      return;
    }

    try {
      await api.updateOwnerCredentials(payload);
      setOwnerForm((current) => ({ ...current, currentPassword: "", password: "" }));
      await refresh();
      flash("مشخصات سوپرادمین ذخیره شد.");
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleDeleteAdmin(id, username) {
    if (!window.confirm(`حذف ادمین ${username} انجام شود؟`)) return;
    try {
      await api.deleteAdmin(id);
      flash("ادمین حذف شد.");
      loadAll();
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleDeleteChannel(id, label) {
    if (!window.confirm(`حذف کلاس ${label} انجام شود؟ این عملیات قابل بازگشت نیست.`)) return;
    try {
      await api.deleteChannel(id);
      flash("کلاس حذف شد.");
      loadAll();
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleLogoUpload() {
    if (!logoFile) return;
    try {
      const updated = await api.uploadLogo(logoFile);
      setSettings(updated);
      setLogoFile(null);
      flash("لوگو ذخیره شد.");
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleFaviconUpload() {
    if (!faviconFile) return;
    try {
      const updated = await api.uploadFavicon(faviconFile);
      setSettings(updated);
      setFaviconFile(null);
      flash("favicon ذخیره شد.");
    } catch (err) {
      flash(err.message);
    }
  }

  async function saveAppearance(patch) {
    const next = { ...appearanceForm, ...patch };
    setAppearanceForm(next);
    try {
      const updated = await api.updateSettings({ appearance: next });
      setSettings(updated);
      setAppearanceForm(updated?.appearance || next);
      flash("تنظیمات ظاهری ذخیره شد.");
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleBackgroundUpload() {
    if (!backgroundFile) return;
    try {
      const updated = await api.uploadBackground(backgroundFile);
      setSettings(updated);
      setAppearanceForm(updated?.appearance || appearanceForm);
      setBackgroundFile(null);
      flash("پس‌زمینه ذخیره شد.");
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleBackgroundRemove() {
    try {
      const updated = await api.removeBackground();
      setSettings(updated);
      setAppearanceForm(updated?.appearance || appearanceForm);
      flash("پس‌زمینه حذف شد.");
    } catch (err) {
      flash(err.message);
    }
  }

  function resetAppearance() {
    saveAppearance({ preset: "aurora", backgroundUrl: "", backgroundDarkness: 52, glassOpacity: 62, glassBlur: 22, glowIntensity: 55 });
  }

  function selectAppearancePreset(preset) {
    saveAppearance({ preset, ...APPEARANCE_PRESETS[preset] });
  }

  if (loading || !user || user.role !== "owner") {
    return <div className="flex-1 flex items-center justify-center">در حال بارگذاری...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl w-full px-4 py-8 flex-1 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Ultra Live · پنل مادر</h1>
      {msg && <p className="text-sm text-primary">{msg}</p>}

      <Card>
        <CardHeader>
          <CardTitle>تنظیمات ظاهری و فنی</CardTitle>
          <CardDescription>نام سایت، عنوان تب، لوگو، favicon و ثبت‌نام عمومی</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {settings && (
            <>
              <div className="grid gap-1.5">
                <Label>اولویت پخش برای بیننده‌ها</Label>
                <select
                  className="border rounded-md h-9 px-2 text-sm bg-background"
                  value={settings.playbackMode || "auto"}
                  onChange={(e) => handleSettingsChange({ playbackMode: e.target.value })}
                >
                  <option value="auto">خودکار: LiveKit، سپس HLS</option>
                  <option value="livekit">فقط LiveKit</option>
                  <option value="hls">فقط HLS</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="flex items-center gap-2">نام سایت <FieldHint text="نام نمایشی سایت در هدر و بخش‌های عمومی" /></Label>
                <Input
                  defaultValue={settings.siteName}
                  onBlur={(e) => e.target.value !== settings.siteName && handleSettingsChange({ siteName: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="flex items-center gap-2">عنوان تب مرورگر <FieldHint text="متن tab browser و title page" /></Label>
                <Input
                  defaultValue={settings.browserTabTitle || settings.siteName}
                  onBlur={(e) => e.target.value !== (settings.browserTabTitle || settings.siteName) && handleSettingsChange({ browserTabTitle: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">آپلود لوگو (PNG) <FieldHint text="لوگو باید PNG واقعی باشد" /></Label>
                <div className="flex flex-wrap items-center gap-2"><Input type="file" accept="image/png" onChange={(event) => setLogoFile(event.target.files?.[0] || null)} /><Button type="button" onClick={handleLogoUpload} disabled={!logoFile}>آپلود لوگو</Button></div>
                {settings.logoUrl && <img src={settings.logoUrl} alt="لوگوی سایت" className="h-14 w-fit rounded-xl object-contain" />}
              </div>
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">آپلود favicon (PNG) <FieldHint text="فقط PNG واقعی؛ بعد از ذخیره tab icon به‌روزرسانی می‌شود" /></Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="file" accept="image/png" onChange={(event) => setFaviconFile(event.target.files?.[0] || null)} />
                  <Button type="button" onClick={handleFaviconUpload} disabled={!faviconFile}>آپلود favicon</Button>
                </div>
                {settings.faviconUrl && <img src={settings.faviconUrl} alt="favicon سایت" className="h-10 w-10 rounded-md object-contain" />}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.allowPublicRegister}
                  onChange={(e) => handleSettingsChange({ allowPublicRegister: e.target.checked })}
                />
                ثبت‌نام عمومی باز باشد (خاموش کن اگر فقط باید ادمین کانال بسازد)
              </label>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-white/15 bg-slate-950/70 text-white shadow-2xl backdrop-blur-xl">
        <CardHeader>
          <CardTitle>Spatial Appearance</CardTitle>
          <CardDescription className="text-white/55">پس‌زمینه و عمق شیشه‌ای که همه کاربران در کلاس می‌بینند</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {[['aurora', 'Aurora'], ['gemini', 'Gemini'], ['apple-dark', 'Apple Dark'], ['custom', 'Custom']].map(([value, label]) => (
                <Button key={value} type="button" variant={appearanceForm.preset === value ? "default" : "outline"} className="rounded-full" onClick={() => selectAppearancePreset(value)}>{label}</Button>
              ))}
            </div>
            {[['backgroundDarkness', 'تاریکی پس‌زمینه'], ['glassOpacity', 'شفافیت شیشه'], ['glassBlur', 'میزان blur'], ['glowIntensity', 'شدت glow']].map(([key, label]) => (
              <label key={key} className="grid gap-2 text-sm">
                <span className="flex justify-between"><span>{label}</span><b>{appearanceForm[key]}{key === 'glassBlur' ? ' px' : '%'}</b></span>
                <input type="range" min="0" max="100" value={appearanceForm[key]} onChange={(event) => setAppearanceForm((current) => ({ ...current, [key]: Number(event.target.value) }))} onPointerUp={() => saveAppearance({ [key]: appearanceForm[key] })} onBlur={() => saveAppearance({ [key]: appearanceForm[key] })} className="accent-cyan-400" />
              </label>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Input type="file" accept="image/png" onChange={(event) => setBackgroundFile(event.target.files?.[0] || null)} className="max-w-sm border-white/15 bg-white/5" />
              <Button type="button" onClick={handleBackgroundUpload} disabled={!backgroundFile} className="rounded-full">آپلود PNG</Button>
              <Button type="button" variant="outline" onClick={handleBackgroundRemove} className="rounded-full border-white/15">حذف پس‌زمینه</Button>
              <Button type="button" variant="ghost" onClick={resetAppearance} className="rounded-full text-white/65">بازنشانی</Button>
            </div>
          </div>
          <div className="relative min-h-48 overflow-hidden rounded-3xl border border-white/15 bg-[radial-gradient(circle_at_20%_20%,#19d8ff,transparent_34%),radial-gradient(circle_at_80%_25%,#9c5cff,transparent_35%),linear-gradient(135deg,#11152e,#080a16)] p-4" style={{ filter: `saturate(${0.8 + appearanceForm.glowIntensity / 100})`, "--preview-darkness": `${appearanceForm.backgroundDarkness / 100}` }}>
            {appearanceForm.backgroundUrl && <img src={appearanceForm.backgroundUrl} alt="پیش‌نمایش پس‌زمینه" className="absolute inset-0 size-full object-cover opacity-50" />}
            <div className="relative mt-16 rounded-2xl border border-white/20 p-4" style={{ backgroundColor: `rgb(255 255 255 / ${appearanceForm.glassOpacity / 1000})`, backdropFilter: `blur(${appearanceForm.glassBlur}px)` }}><p className="text-xs uppercase tracking-widest text-cyan-100/70">Live preview</p><p className="mt-1 font-semibold">Ultra Live classroom</p></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>LiveKit / Streaming Settings</CardTitle>
          <CardDescription>تنظیمات streaming فقط توسط Mother Admin قابل تغییر است</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveLivekit} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="flex items-center gap-2">Resolution width <FieldHint text="رزولوشن پیشنهادی 1280×720 برای تعادل کیفیت و پایداری" /></Label>
                <Input type="number" min="320" max="3840" value={livekitForm.video.width} onChange={(e) => setLivekitForm((current) => ({ ...current, video: { ...current.video, width: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Resolution height</Label>
                <Input type="number" min="240" max="2160" value={livekitForm.video.height} onChange={(e) => setLivekitForm((current) => ({ ...current, video: { ...current.video, height: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>FPS</Label>
                <Input type="number" min="1" max="60" value={livekitForm.video.fps} onChange={(e) => setLivekitForm((current) => ({ ...current, video: { ...current.video, fps: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Maximum bitrate (kbps)</Label>
                <Input type="number" min="150" max="20000" value={livekitForm.video.maxBitrateKbps} onChange={(e) => setLivekitForm((current) => ({ ...current, video: { ...current.video, maxBitrateKbps: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Video codec</Label>
                <select className="border rounded-md h-9 px-2 text-sm bg-background" value={livekitForm.video.codec} onChange={(e) => setLivekitForm((current) => ({ ...current, video: { ...current.video, codec: e.target.value } }))}>
                  <option value="h264">H264</option>
                  <option value="vp8">VP8</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>Simulcast layers</Label>
                <Input type="number" min="1" max="3" value={livekitForm.video.simulcastLayers} onChange={(e) => setLivekitForm((current) => ({ ...current, video: { ...current.video, simulcastLayers: e.target.value } }))} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={livekitForm.video.simulcast} onChange={(e) => setLivekitForm((current) => ({ ...current, video: { ...current.video, simulcast: e.target.checked } }))} /> Simulcast</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={livekitForm.connection.adaptiveStream} onChange={(e) => setLivekitForm((current) => ({ ...current, connection: { ...current.connection, adaptiveStream: e.target.checked } }))} /> Adaptive Stream</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={livekitForm.connection.dynacast} onChange={(e) => setLivekitForm((current) => ({ ...current, connection: { ...current.connection, dynacast: e.target.checked } }))} /> Dynacast</label>
              <div className="grid gap-1.5">
                <Label>Reconnect attempts</Label>
                <Input type="number" min="0" max="12" value={livekitForm.connection.maxRetries} onChange={(e) => setLivekitForm((current) => ({ ...current, connection: { ...current.connection, maxRetries: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Peer connection timeout (ms)</Label>
                <Input type="number" min="3000" max="60000" value={livekitForm.connection.peerConnectionTimeoutMs} onChange={(e) => setLivekitForm((current) => ({ ...current, connection: { ...current.connection, peerConnectionTimeoutMs: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label className="flex items-center gap-2">Retry backoff (ms) <FieldHint text="تاخیر شروع reconnect برای جلوگیری از فشار روی شبکه‌های ضعیف" /></Label>
                <Input type="number" min="100" max="10000" value={livekitForm.connection.retryDelayMs} onChange={(e) => setLivekitForm((current) => ({ ...current, connection: { ...current.connection, retryDelayMs: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label className="flex items-center gap-2">Max retry backoff (ms) <FieldHint text="سقف فاصله بین تلاش‌های reconnect" /></Label>
                <Input type="number" min="500" max="30000" value={livekitForm.connection.maxRetryDelayMs} onChange={(e) => setLivekitForm((current) => ({ ...current, connection: { ...current.connection, maxRetryDelayMs: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>ICE transport policy</Label>
                <select className="border rounded-md h-9 px-2 text-sm bg-background" value={livekitForm.connection.iceTransportPolicy} onChange={(e) => setLivekitForm((current) => ({ ...current, connection: { ...current.connection, iceTransportPolicy: e.target.value } }))}>
                  <option value="all">all</option>
                  <option value="relay">relay only</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={resetLivekitRecommended}>Reset to Recommended</Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>حساب سوپرادمین</CardTitle>
          <CardDescription>تغییر یوزرنیم و رمز عبور صاحب پنل مادر</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateOwner} className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>یوزرنیم جدید</Label>
              <Input value={ownerForm.username} onChange={(e) => setOwnerForm((current) => ({ ...current, username: e.target.value }))} placeholder={user.username || "owner"} />
            </div>
            <div className="grid gap-1.5">
              <Label>رمز فعلی (برای تغییر رمز)</Label>
              <Input type="password" autoComplete="current-password" value={ownerForm.currentPassword} onChange={(e) => setOwnerForm((current) => ({ ...current, currentPassword: e.target.value }))} placeholder="اختیاری" />
            </div>
            <div className="grid gap-1.5">
              <Label>رمز جدید</Label>
              <Input type="password" autoComplete="new-password" value={ownerForm.password} onChange={(e) => setOwnerForm((current) => ({ ...current, password: e.target.value }))} placeholder="اختیاری" />
            </div>
            <Button type="submit" className="sm:col-span-3 justify-self-start">ذخیره مشخصات</Button>
          </form>
        </CardContent>
      </Card>

      {/* --- System monitoring --- */}
      <Card>
        <CardHeader>
          <CardTitle>مانیتورینگ سرور</CardTitle>
        </CardHeader>
        <CardContent>
          {!stats ? (
            <p className="text-sm text-muted-foreground">در دسترس نیست.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">رم</p>
                <p>{fmtMb(stats.memory.totalMb - stats.memory.freeMb)} / {fmtMb(stats.memory.totalMb)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Load Average</p>
                <p>{stats.loadavg.map((n) => n.toFixed(2)).join(" / ")}</p>
              </div>
              <div>
                <p className="text-muted-foreground">هسته‌های CPU</p>
                <p>{stats.cpuCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">آپتایم سرور</p>
                <p>{Math.floor(stats.serverUptimeSeconds / 3600)} ساعت</p>
              </div>
              {stats.disk && (
                <div>
                  <p className="text-muted-foreground">دیسک</p>
                  <p>{stats.disk.usedPercent} پر ({fmtMb(stats.disk.usedMb)} از {fmtMb(stats.disk.totalMb)})</p>
                </div>
              )}
              {stats.pm2?.map((p) => (
                <div key={p.name}>
                  <p className="text-muted-foreground">{p.name}</p>
                  <p>{p.status} · {p.cpu}% CPU · {p.memoryMb} مگ</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Create admin --- */}
      <Card>
        <CardHeader>
          <CardTitle>ساخت ادمین جدید</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateAdmin} className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label>یوزرنیم</Label>
              <Input value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} required />
            </div>
            <div className="grid gap-1.5">
              <Label>رمز عبور</Label>
              <Input type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} required />
            </div>
            <Button type="submit">ساخت</Button>
          </form>
          <Separator className="my-3" />
          <p className="text-xs text-muted-foreground mb-2">رمز فعلی ذخیره نمی‌شود و قابل نمایش نیست. برای تغییر، رمز جدید وارد کنید.</p>
          <ul className="text-sm flex flex-col gap-3">
            {admins.map((a) => {
              const id = a._id || a.id;
              const edit = adminEdits[id] || { username: a.username, password: "" };
              return (
                <li key={id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] items-end border rounded-md p-3">
                  <div className="grid gap-1.5">
                    <Label>یوزرنیم</Label>
                    <Input
                      value={edit.username}
                      onChange={(e) => setAdminEdits((current) => ({ ...current, [id]: { ...edit, username: e.target.value } }))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>رمز عبور جدید</Label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="بدون تغییر"
                      value={edit.password}
                      onChange={(e) => setAdminEdits((current) => ({ ...current, [id]: { ...edit, password: e.target.value } }))}
                    />
                  </div>
                  <Button type="button" onClick={() => handleUpdateAdmin(id)}>ذخیره</Button>
                  <Button type="button" variant="destructive" onClick={() => handleDeleteAdmin(id, a.username)}>حذف ادمین</Button>
                </li>
              );
            })}
            {admins.length === 0 && <li className="text-muted-foreground">ادمینی ساخته نشده است.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>حذف کلاس‌ها</CardTitle>
          <CardDescription>حذف کامل کلاس به‌همراه داده‌های چت، حضور، نظرسنجی و دسترسی‌ها</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm flex flex-col gap-3">
            {channels.map((channel) => {
              const id = channel._id || channel.id;
              const manager = channel.managedBy?.username ? `مدیر: ${channel.managedBy.username}` : "بدون مدیر";
              const label = channel.displayName || channel.username;
              return (
                <li key={id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3">
                  <div>
                    <p className="font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{channel.username} · {manager}</p>
                  </div>
                  <Button type="button" variant="destructive" onClick={() => handleDeleteChannel(id, label)}>حذف کلاس</Button>
                </li>
              );
            })}
            {channels.length === 0 && <li className="text-muted-foreground">کلاسی ثبت نشده است.</li>}
          </ul>
        </CardContent>
      </Card>

      {/* --- Activity log --- */}
      <Card>
        <CardHeader>
          <CardTitle>ورود و خروج اکانت‌ها</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-y-auto text-sm flex flex-col gap-1">
            {activity.map((l, i) => (
              <p key={i}>
                {new Date(l.at).toLocaleString("fa-IR")} — {l.username} — {l.action === "login" ? "ورود" : "خروج"}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
