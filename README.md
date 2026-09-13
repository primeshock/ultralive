# Koosha Live

پلتفرم کلاس آنلاین زنده با مدیریت عملیاتی سراسری، چت، حضور و غیاب، moderation، نظرسنجی/کوئیز و مسیر مهاجرت به LiveKit.

## نقش‌ها

فقط دو نقش کاربری سازمانی وجود دارد:

- **Owner / Hyper Admin**: مدیریت ادمین‌ها، برندینگ، تنظیمات فنی، مانیتورینگ سرور، لاگ‌ها، زیرساخت LiveKit، استقرار و تمام امکانات Admin.
- **Admin / Stream Manager**: دسترسی عملیاتی سراسری به تمام کلاس‌ها، استریم‌ها، دانش‌آموزان، حضور و غیاب، چت، moderation، poll/quiz، مانیتور و تنظیمات کلاس. `managedBy` فقط متادیتاست و محدودیت دسترسی نیست.

`channel` یک موجودیت داخلی برای کلاس/استریم است و **Teacher role وجود ندارد**.

دانش‌آموز حساب مدیریتی ندارد و از لینک امضاشده‌ی WordPress وارد یک session اختصاصی کلاس می‌شود.

## معماری استریم

در حالت فعلی و fallback:

```text
OBS -> RTMP -> node-media-server -> HLS -> browser
```

مسیر LiveKit:

```text
OBS -> LiveKit Ingress -> LiveKit SFU -> WebRTC -> browser
```

LiveKit به‌صورت feature-flagged کنار HLS اجرا می‌شود؛ تا زمان تست کامل، HLS/RTMP/NMS حذف نمی‌شوند.

برای LiveKit self-hosted به دامنه، TLS، Redis، Ingress و پورت‌های WebRTC/TURN نیاز است. مستندات رسمی فعلی LiveKit برای VM پورت‌های 443/TCP، 7881/TCP، 3478/UDP و 50000-60000/UDP را ذکر می‌کند و برای RTMP Ingress پورت 1935 و برای WHIP پورت 7885/UDP را اضافه می‌کند.

## نصب

روی Ubuntu/Debian:

```bash
git clone <repository> koosha-live
cd koosha-live
sudo bash install.sh YOUR_PUBLIC_IP
```

متغیرهای مهم قبل از نصب:

```bash
export REPO_URL="https://..."
export SEED_OWNER_USERNAME="owner"
export SEED_OWNER_PASSWORD="یک-رمز-قوی"
export DOMAIN="live.example.com"
```

اسکریپت idempotent است و **UFW را reset نمی‌کند**. پورت‌های MongoDB، API و HLS داخلی به اینترنت باز نمی‌شوند.

پس از نصب، owner credential در خروجی و فایل محافظت‌شده‌ی نصب قرار می‌گیرد؛ هیچ credential پیش‌فرضی داخل repository وجود ندارد.

### LiveKit

برای LiveKit self-hosted در production باید دامنه‌ی LiveKit و DNS آن را آماده کنید و deployment رسمی LiveKit VM/generator را اجرا کنید. سپس این متغیرها را در backend تنظیم کنید:

```env
LIVEKIT_ENABLED=true
LIVEKIT_URL=https://livekit.example.com
LIVEKIT_WS_URL=wss://livekit.example.com
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

بعد از آن از پنل Admin برای هر کلاس یک RTMP Ingress بسازید؛ URL و Stream Key تولیدشده برای OBS قابل استفاده است.

## مسیرهای مهم

### Owner

- `/api/master/admins`
- `/api/master/channels`
- `/api/master/settings`
- `/api/master/system-stats`
- `/api/master/activity`

### Admin / Stream Manager

- `/api/admin/channels`
- `/api/admin/channels/:channel`
- `/api/admin/channels/:channel/active-students`
- `/api/admin/channels/:channel/attendance`
- `/api/admin/channels/:channel/moderation`
- `/api/admin/channels/:channel/polls`
- `/api/admin/channels/:channel/monitor-link`

Admin روی همه‌ی کلاس‌ها دسترسی عملیاتی دارد؛ هیچ check مربوط به `managedBy` برای authorization استفاده نمی‌شود.

### Student

- `/api/session/join`
- `/api/session/me?channel=...`
- `/api/rooms/:channel/polls/active`
- `/api/rooms/:channel/polls/:pollId/vote`

## WordPress join

`WP_JOIN_SECRET` بین WordPress و backend مشترک است. token کوتاه‌عمر باید شامل `channel`, `userId`, `displayName`, `exp` باشد.

session دانش‌آموز در cookie `httpOnly` نگهداری می‌شود و browser به secret دسترسی ندارد.

## امنیت

در production:

- `NODE_ENV=production`
- `COOKIE_SECURE=true`
- HTTPS/WSS
- JWT/WP/room secrets تصادفی و غیرقابل حدس
- login rate limiting
- Admin/Owner authorization server-side
- دانش‌آموز بدون management API
- MongoDB/API/HLS backend ports فقط local/private

## وضعیت fallback

تا وقتی LiveKit به‌صورت واقعی با OBS، WebRTC، TURN و reconnect تست نشده است، مسیر RTMP/HLS باید فعال بماند.
