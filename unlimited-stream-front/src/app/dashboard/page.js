"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const { user, loading, setUser } = useAuth();
  const router = useRouter();

  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== "teacher")) router.replace("/");
  }, [loading, user, router]);

  if (loading || !user || user.role !== "teacher") {
    return <div className="flex-1 flex items-center justify-center">در حال بارگذاری...</div>;
  }

  async function copy(text, label) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const { user } = await api.regenerateKey();
      setUser(user);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl w-full px-4 py-8 flex-1 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">داشبورد استریمر</h1>

      <Card>
        <CardHeader>
          <CardTitle>اطلاعات اتصال OBS</CardTitle>
          <CardDescription>
            این اطلاعات رو توی OBS (یا هر نرم‌افزار استریم دیگه) وارد کن. کلید استریم رو در اختیار
            کسی نذار — هرکسی این کلید رو داشته باشه می‌تونه به‌جای تو استریم کنه.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Server</Label>
            <div className="flex gap-2">
              <Input readOnly value={user.rtmpServer} className="font-mono" />
              <Button type="button" variant="outline" onClick={() => copy(user.rtmpServer, "server")}>
                {copied === "server" ? "کپی شد" : "کپی"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Stream Key</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                type={showKey ? "text" : "password"}
                value={user.streamKeyField}
                className="font-mono"
              />
              <Button type="button" variant="outline" onClick={() => setShowKey((v) => !v)}>
                {showKey ? "مخفی کن" : "نمایش"}
              </Button>
              <Button type="button" variant="outline" onClick={() => copy(user.streamKeyField, "key")}>
                {copied === "key" ? "کپی شد" : "کپی"}
              </Button>
            </div>
          </div>

          <Dialog>
            <DialogTrigger
              render={<Button variant="destructive" className="self-start">ساخت کلید جدید</Button>}
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>ساخت کلید استریم جدید؟</DialogTitle>
                <DialogDescription>
                  کلید فعلی از کار میفته و باید تنظیمات OBS رو با کلید جدید آپدیت کنی.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={handleRegenerate} disabled={regenerating}>
                  {regenerating ? "در حال ساخت..." : "بله، کلید جدید بساز"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <ThumbnailCard key={`thumb-${user.username}`} user={user} onSaved={setUser} />

      <ChatControlCard key={`chat-${user.username}`} user={user} onSaved={setUser} />

      <MutedUsersCard key={`muted-${user.username}`} user={user} onSaved={setUser} />

      <ProfileCard key={user.username} user={user} onSaved={setUser} />
    </div>
  );
}

function ThumbnailCard({ user, onSaved }) {
  const [preview, setPreview] = useState(user.thumbnailUrl || "");
  const [source, setSource] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(50);
  const [offsetY, setOffsetY] = useState(50);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("فقط فایل تصویر مجاز است");
      e.target.value = "";
      return;
    }
    setSource(URL.createObjectURL(file));
    setZoom(1);
    setOffsetX(50);
    setOffsetY(50);
    setError("");
    e.target.value = "";
  }

  async function uploadCrop() {
    if (!source) return;
    setUploading(true);
    try {
      const image = new Image();
      image.src = source;
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * zoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const x = (canvas.width - width) * (offsetX / 100);
      const y = (canvas.height - height) * (offsetY / 100);
      context.drawImage(image, x, y, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      const file = new File([blob], "thumbnail.jpg", { type: "image/jpeg" });
      const { user } = await api.uploadThumbnail(file);
      onSaved(user);
      setPreview(user.thumbnailUrl);
      setSource("");
    } catch (err) {
      setError(err.message || "برش تصویر انجام نشد");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>تامبنیل استریم</CardTitle>
        <CardDescription>خروجی سایت با نسبت 16:9 و ابعاد 1280×720 نمایش داده می‌شود.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="w-40 aspect-video bg-muted rounded-md overflow-hidden flex items-center justify-center shrink-0">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground">بدون تامبنیل</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label
            htmlFor="thumbnail"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-fit cursor-pointer",
              uploading && "pointer-events-none opacity-50"
            )}
          >
            {uploading ? "در حال آپلود..." : "انتخاب عکس"}
          </label>
          <input
            id="thumbnail"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          {source && (
            <div className="grid gap-2 rounded-2xl border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">محدوده‌ی 16:9 را انتخاب کن</p>
              <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={source} alt="پیش‌نمایش برش" className="absolute h-full w-full object-cover" style={{ transform: `scale(${zoom})`, objectPosition: `${offsetX}% ${offsetY}%` }} />
                <div className="pointer-events-none absolute inset-0 border-2 border-white/80" />
              </div>
              <label className="text-xs">بزرگ‌نمایی <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="w-full" /></label>
              <label className="text-xs">جابه‌جایی افقی <input type="range" min="0" max="100" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} className="w-full" /></label>
              <label className="text-xs">جابه‌جایی عمودی <input type="range" min="0" max="100" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} className="w-full" /></label>
              <Button type="button" onClick={uploadCrop} disabled={uploading}>{uploading ? "در حال آپلود..." : "ثبت برش و آپلود"}</Button>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ChatControlCard({ user, onSaved }) {
  const [updating, setUpdating] = useState(false);

  async function handleToggle(e) {
    const enabled = e.target.checked;
    setUpdating(true);
    try {
      const { user } = await api.toggleChat(enabled);
      onSaved(user);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>کنترل چت زنده</CardTitle>
        <CardDescription>
          هر وقت بخوای، حتی وسط استریم، می‌تونی چت رو برای بیننده‌ها ببندی یا باز کنی — همون لحظه
          روی صفحه‌ی همه اعمال میشه.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <Label htmlFor="chatEnabled">چت فعال باشه</Label>
          <input
            id="chatEnabled"
            type="checkbox"
            className="size-4"
            checked={user.chatEnabled}
            onChange={handleToggle}
            disabled={updating}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MutedUsersCard({ user, onSaved }) {
  const [pending, setPending] = useState("");

  async function handleUnmute(username) {
    setPending(username);
    try {
      const { user } = await api.unmuteUser(username);
      onSaved(user);
    } finally {
      setPending("");
    }
  }

  const mutedUsers = user.mutedUsers || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>کاربران میوت‌شده</CardTitle>
        <CardDescription>
          می‌تونی از کنار هر پیام توی چت خودت یه کاربر رو میوت کنی. لیستش اینجاست، هر وقت خواستی
          می‌تونی آنمیوتش کنی.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mutedUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">فعلاً کسی میوت نیست.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {mutedUsers.map((username) => (
              <div key={username} className="flex items-center justify-between border rounded-md px-3 py-2">
                <span className="text-sm">{username}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending === username}
                  onClick={() => handleUnmute(username)}
                >
                  {pending === username ? "در حال..." : "آنمیوت"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileCard({ user, onSaved }) {
  const [streamTitle, setStreamTitle] = useState(user.streamTitle || "");
  const [donateUrl, setDonateUrl] = useState(user.donateUrl || "");
  const [reminderText, setReminderText] = useState(user.autoChatMessage?.text || "");
  const [reminderInterval, setReminderInterval] = useState(user.autoChatMessage?.intervalMinutes ?? 10);
  const [reminderEnabled, setReminderEnabled] = useState(user.autoChatMessage?.enabled ?? false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const { user } = await api.updateProfile({
        streamTitle,
        donateUrl,
        autoChatMessage: {
          text: reminderText,
          intervalMinutes: Number(reminderInterval) || 10,
          enabled: reminderEnabled,
        },
      });
      onSaved(user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>تنظیمات کانال</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="streamTitle">عنوان استریم</Label>
            <Input
              id="streamTitle"
              value={streamTitle}
              onChange={(e) => setStreamTitle(e.target.value)}
              maxLength={140}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="donateUrl">لینک دونیت</Label>
            <Input
              id="donateUrl"
              placeholder="https://..."
              value={donateUrl}
              onChange={(e) => setDonateUrl(e.target.value)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <Label htmlFor="reminderEnabled">پیام یادآوری خودکار در چت</Label>
            <input
              id="reminderEnabled"
              type="checkbox"
              className="size-4"
              checked={reminderEnabled}
              onChange={(e) => setReminderEnabled(e.target.checked)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="reminderText">متن پیام</Label>
            <Input
              id="reminderText"
              value={reminderText}
              onChange={(e) => setReminderText(e.target.value)}
              maxLength={200}
              disabled={!reminderEnabled}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="reminderInterval">فاصله زمانی (دقیقه)</Label>
            <Input
              id="reminderInterval"
              type="number"
              min={1}
              max={120}
              value={reminderInterval}
              onChange={(e) => setReminderInterval(e.target.value)}
              disabled={!reminderEnabled}
              className="max-w-32"
            />
          </div>

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}

          <Button type="submit" disabled={saving} className="self-start">
            {saving ? "در حال ذخیره..." : saved ? "ذخیره شد" : "ذخیره تغییرات"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
