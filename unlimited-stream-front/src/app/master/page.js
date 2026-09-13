"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

function fmtMb(mb) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} گیگ` : `${mb} مگ`;
}

export default function MasterPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [admins, setAdmins] = useState([]);
  const [channels, setChannels] = useState([]);
  const [settings, setSettings] = useState(null);
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [msg, setMsg] = useState("");

  const [adminForm, setAdminForm] = useState({ username: "", password: "" });
  const [channelForm, setChannelForm] = useState({ username: "", password: "", managedBy: "" });

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
    setChannels(c);
    setSettings(s);
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

  async function handleCreateChannel(e) {
    e.preventDefault();
    try {
      await api.createChannel(channelForm);
      setChannelForm({ username: "", password: "", managedBy: "" });
      flash("کانال ساخته شد.");
      loadAll();
    } catch (err) {
      flash(err.message);
    }
  }

  async function handleSettingsChange(patch) {
    try {
      const updated = await api.updateSettings(patch);
      setSettings(updated);
      flash("تنظیمات ذخیره شد.");
    } catch (err) {
      flash(err.message);
    }
  }

  if (loading || !user || user.role !== "owner") {
    return <div className="flex-1 flex items-center justify-center">در حال بارگذاری...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl w-full px-4 py-8 flex-1 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">پنل مادر</h1>
      {msg && <p className="text-sm text-primary">{msg}</p>}

      {/* --- Settings --- */}
      <Card>
        <CardHeader>
          <CardTitle>تنظیمات ظاهری و فنی</CardTitle>
          <CardDescription>نام سایت، لوگو، و باز/بسته بودن ثبت‌نام عمومی</CardDescription>
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
                <Label>نام سایت</Label>
                <Input
                  defaultValue={settings.siteName}
                  onBlur={(e) => e.target.value !== settings.siteName && handleSettingsChange({ siteName: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>لینک لوگو</Label>
                <Input
                  defaultValue={settings.logoUrl}
                  placeholder="https://.../logo.png"
                  onBlur={(e) => e.target.value !== settings.logoUrl && handleSettingsChange({ logoUrl: e.target.value })}
                />
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
          <ul className="text-sm flex flex-col gap-1">
            {admins.map((a) => (
              <li key={a._id}>{a.username}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* --- Create channel --- */}
      <Card>
        <CardHeader>
          <CardTitle>ساخت کانال/کلاس جدید</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateChannel} className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label>یوزرنیم کانال</Label>
              <Input value={channelForm.username} onChange={(e) => setChannelForm({ ...channelForm, username: e.target.value })} required />
            </div>
            <div className="grid gap-1.5">
              <Label>رمز عبور</Label>
              <Input type="password" value={channelForm.password} onChange={(e) => setChannelForm({ ...channelForm, password: e.target.value })} required />
            </div>
            <div className="grid gap-1.5">
              <Label>مدیر (ادمین)</Label>
              <select
                className="border rounded-md h-9 px-2 text-sm bg-background"
                value={channelForm.managedBy}
                onChange={(e) => setChannelForm({ ...channelForm, managedBy: e.target.value })}
                required
              >
                <option value="">انتخاب ادمین...</option>
                {admins.map((a) => (
                  <option key={a._id} value={a._id}>{a.username}</option>
                ))}
              </select>
            </div>
            <Button type="submit">ساخت</Button>
          </form>
          <Separator className="my-3" />
          <ul className="text-sm flex flex-col gap-1">
            {channels.map((c) => (
              <li key={c._id}>
                {c.username} — مدیر: {c.managedBy?.username || "—"} {c.isLive && <span className="text-destructive">(لایو)</span>}
              </li>
            ))}
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
