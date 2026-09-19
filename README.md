# Ultra Live / Koosha Live

این سند وضعیت فعلی پروژه، معماری، مسیر deploy و نکات عیب‌یابی را ثبت می‌کند. اطلاعات حساس مانند رمز MongoDB، JWT secret، کلید LiveKit، stream key و cookie نباید در Git یا این فایل ذخیره شوند.

## وضعیت فعلی

- Branch deploy: `koosha-live-current`
- آخرین commit فعلی: شاخهٔ `koosha-live-current` روی GitHub
- Repository: `https://github.com/primeshock/ultralive`
- Backend: Node.js + Express + MongoDB + Socket.io
- Frontend: Next.js 16.3.3 + React 19.2.8
- LiveKit client: `2.22.3`
- LiveKit server SDK: `2.19.0`
- LiveKit server/Ingress: Docker، با پورت‌های جداگانه برای signaling، media و RTMP ingress

## کارت سریع عملیات

### اتصال به سرور

```bash
ssh root@PUBLIC_IP
cd /opt/unlimited-stream
```

اگر در `~/.ssh/config` یک alias به نام `livekit` تعریف شده باشد، این هم قابل استفاده است:

```bash
ssh livekit
```

### نصب تازه

روی Ubuntu/Debian تازه، از سیستم محلی یا بعد از ورود به سرور:

```bash
cd /opt
git clone -b koosha-live-current https://github.com/primeshock/ultralive.git unlimited-stream
cd /opt/unlimited-stream
sudo bash install.sh PUBLIC_IP --with-livekit
```

اگر LiveKit از قبل جداگانه نصب شده یا فعلاً HLS کافی است، فلگ `--with-livekit` را حذف کنید:

```bash
sudo bash install.sh PUBLIC_IP
```

### به‌روزرسانی عادی

```bash
cd /opt/unlimited-stream
git status --short --branch
sudo bash install.sh
```

`install.sh` فقط وقتی source روی سرور clean باشد ادامه می‌دهد؛ فایل‌های `.env`، MongoDB، Docker، Nginx و state لایو را overwrite نمی‌کند.

### بررسی سریع بعد از نصب یا update

```bash
pm2 status
curl -fsS http://127.0.0.1/api/health && echo
curl -fsS http://127.0.0.1:7880/ && echo
docker compose -f /opt/livekit/docker-compose.yml ps
```

خروجی مطلوب: هر دو برنامهٔ PM2 در حالت `online`، health با `{"ok":true}`، پاسخ `OK` از پورت LiveKit و کانتینرهای LiveKit در حالت running.

### پایش لحظه‌ای

```bash
# پایش PM2 و مصرف هر برنامه
pm2 monit

# لاگ backend و frontend؛ خروج با Ctrl-C
pm2 logs unlimited-stream-backend --lines 100
pm2 logs unlimited-stream-frontend --lines 100

# مصرف CPU/RAM کل سرور
top -o %CPU

# فهرست processهای پرمصرف
ps -eo pid,ppid,comm,%cpu,%mem,args --sort=-%cpu | head -15

# مصرف کانتینرها
docker stats --no-stream
```

`Restarts` در `pm2 status` شمارندهٔ تجمعی است. افزایش آن بعد از deploy معمولاً طبیعی است؛ اگر بدون deploy مرتب زیاد می‌شود، این‌ها را بررسی کنید:

```bash
pm2 describe unlimited-stream-backend
pm2 describe unlimited-stream-frontend
pm2 logs --lines 200
tail -n 200 /var/log/unlimited-stream-install.log
```

### بررسی شبکه و پورت‌ها

```bash
ss -lntup | grep -E ':(80|3000|5050|7880|7881|1935|1936|3478)\\b'
ufw status verbose
docker compose -f /opt/livekit/docker-compose.yml ps
```

برای پخش LiveKit، پورت‌های `7880/tcp`، `7881/tcp`، بازهٔ `50000-50100/udp` و در صورت استفاده `3478/udp` باید در firewall و provider باز باشند.

### تست branding و quiz

```bash
curl -fsS http://127.0.0.1/api/site
curl -I http://127.0.0.1/site-logo
curl -I http://127.0.0.1/site-favicon
```

برای quiz زمان‌دار، پس از ساخت quiz این رفتار را تست کنید: timer در دو مرورگر نمایش داده شود، با صفر شدن فقط submit بسته شود، سؤال باقی بماند، و فقط دکمهٔ «بستن» آن را حذف کند.

### انتشار نسخه در GitHub

```bash
cd /path/to/KooshaLive
git switch koosha-live-current
git status --short

# قبل از commit
cd unlimited-stream-front && npm run lint && npm run build
cd ../unlimited-stream-backend && node -e "require('./src/app.js'); console.log('backend load passed')"
cd ..
git diff --check

git add path/to/intended/files
git commit -m "describe the release"
git push origin koosha-live-current
```

پس از push، روی سرور فقط `sudo bash install.sh` را اجرا کنید؛ روی production مستقیماً `git reset`، `git clean` یا حذف MongoDB انجام ندهید.

## معماری پخش

مسیر اصلی فعلی:

```text
OBS
  -> RTMP Ingress روی LiveKit
  -> LiveKit room: class_<channel>
  -> token خواننده از backend
  -> LiveKit Room.connect در browser
  -> TrackSubscribed
  -> video/audio element
```

مسیر قدیمی RTMP/HLS و `node-media-server` هنوز در پروژه وجود دارد و برای compatibility/rollback حذف نشده است.

### اجزای مهم

- Frontend player: `unlimited-stream-front/src/components/livekit-player.jsx`
- تنظیمات اتصال frontend: `unlimited-stream-front/src/lib/livekit-settings.js`
- جمع‌آوری آمار WebRTC: `unlimited-stream-front/src/lib/livekit-stats.js`
- token و Ingress backend: `unlimited-stream-backend/src/services/livekit.js`
- endpointها: `unlimited-stream-backend/src/routes/livekit.routes.js`
- webhook: `unlimited-stream-backend/src/routes/livekit-webhook.routes.js`
- مدل تنظیمات LiveKit: `unlimited-stream-backend/src/models/SiteSettings.js`
- متغیرهای محیطی: `unlimited-stream-backend/src/config/env.js`
- فرایندهای PM2: `ecosystem.config.js`
- نصب و update: `install.sh`

## نظرسنجی و کوئیز زمان‌دار

- از پنل ادمین یا داشبورد کلاس، mode را روی `quiz` بگذارید و مدت را بر حسب ثانیه وارد کنید.
- تا قبل از پایان زمان، دانش‌آموز می‌تواند یک پاسخ ثبت کند.
- با رسیدن timer به صفر، فقط ثبت پاسخ بسته می‌شود؛ سؤال، گزینه‌ها و نتیجه‌ها روی صفحه باقی می‌مانند.
- کوئیز فقط با دکمهٔ «بستن» از صفحهٔ دانش‌آموز حذف می‌شود.
- گزینهٔ «نمایش نتیجه» و «نمایش پاسخ صحیح» مستقل از پایان timer هستند.
- برای شروع دوباره، از «ریست گزینه‌ها» استفاده کنید؛ رأی‌ها پاک و زمان‌بندی دوباره فعال می‌شود.

منطق deadline در backend هم بررسی می‌شود؛ بنابراین تغییر ساعت یا دست‌کاری UI نمی‌تواند بعد از پایان مهلت رأی ثبت کند.

## Phase 2: Class Management Architecture

Phase 2 backend architecture extends the existing teacher/channel system without replacing it:

- `Class` mirrors existing `User(role=teacher)` channels through an idempotent startup sync. Existing channels, stream keys and access modes are preserved.
- `LiveSession` stores multiple live sessions per class and is updated from LiveKit ingress lifecycle events.
- `Student` stores the external identity and display name observed from the current join integration. Its `integrationMetadata` is intentionally open for the future KooshaHoosh API contract.
- `Attendance` records student join/leave times and duration per live session.
- `AdminNote` stores private notes for a class and is available only to Admin/Owner users.

### Phase 2 API

All management endpoints require authentication. Admins can access only classes assigned to them; Owners can access all classes. Student accounts receive `403` on these management routes.

```text
GET  /api/classes
GET  /api/classes/:id-or-slug
GET  /api/classes/:id-or-slug/sessions
POST /api/classes/:id-or-slug/sessions
GET  /api/sessions/:id/attendance
GET  /api/classes/:id-or-slug/notes
POST /api/classes/:id-or-slug/notes
```

No collection is dropped or reset. Mongoose creates the declared indexes on normal application startup, and the class sync uses upserts. LiveKit, authentication, legacy `/api/admin/channels`, streaming and existing student join flows remain supported.

This phase intentionally does not add dashboard UI, SSO, Web Studio, video calls, or a replacement streaming protocol. It also does not deploy to production automatically.

## اصلاحات LiveKit انجام‌شده

### خطای `e is not iterable`

علت قطعی در frontend پیدا شد. `DefaultReconnectPolicy` در `livekit-client@2.22.3` آرایه‌ی delay می‌خواهد، اما کد قبلی یک object به آن می‌داد. خود SDK روی مقدار ورودی spread می‌کند و به خطای iterable می‌رسد.

اکنون `roomOptionsFromLivekit()` یک آرایه‌ی معتبر از delayها می‌سازد. همچنین `prepareConnection()` که خطاهایش نادیده گرفته می‌شد حذف شده و اتصال مستقیماً از مسیر معتبر زیر انجام می‌شود:

```js
await room.connect(serverUrl, participantToken, connectOptions)
```

eventهای `TrackSubscribed`، `TrackUnsubscribed` و `TrackSubscriptionFailed` مطابق declaration رسمی SDK ثبت شده‌اند. لاگ‌های امن برای state اتصال، participant، reconnect و track اضافه شده‌اند؛ token و secret لاگ نمی‌شوند.

### خطای `invalid video parameters: video codec unsupported`

این خطا در مسیر LiveKit Ingress بود، نه در token خواننده. payload باید با protobuf مورد انتظار `livekit-server-sdk@2.19.0` ساخته شود:

- codec از enum رسمی SDK استفاده می‌کند.
- H264 برای تنظیم پیش‌فرض انتخاب می‌شود.
- sourceهای درست `TrackSource.CAMERA` و `TrackSource.MICROPHONE` هستند.
- تنظیمات ویدیو هدف: 1280x720، 30fps، bitrate قابل‌قبول.
- room و participant identity برای Ingress با token reader یکسان می‌مانند.

بعد از تغییر encoding، Ingressهای موجود باید با زدن دکمه دریافت/ساخت کلید LiveKit از پنل دوباره update شوند. حذف Ingress فقط در صورت باقی‌ماندن تنظیمات قدیمی لازم است.

## پورت‌ها و شبکه

در نصب فعلی معمولاً این پورت‌ها استفاده می‌شوند:

- `80/tcp`: Nginx و سایت
- `3000`: Next.js داخلی
- `5050`: backend داخلی
- `7880/tcp`: LiveKit signaling/WebSocket مستقیم browser
- `7881/tcp`: LiveKit ICE/TCP fallback
- `50000-50100/udp`: LiveKit media
- `1936/tcp`: LiveKit Ingress RTMP
- `3478/udp`: TURN
- `1935/tcp`: مسیر قدیمی RTMP

در نصب بدون TLS، مقدار browser معمولاً `ws://PUBLIC_IP:7880` است. اگر سایت به HTTPS منتقل شد، `ws://` ممکن است به‌خاطر mixed content مسدود شود و باید LiveKit از مسیر `wss://` با TLS و reverse proxy مناسب ارائه شود.

## علت‌های محتمل Down شدن سرور

از روی خطای update به‌تنهایی نمی‌توان علت down شدن را قطعی تشخیص داد. اسکریپت `install.sh` عمداً در این موارد متوقف می‌شود:

1. فایل tracked روی سرور تغییر محلی دارد؛ برای جلوگیری از overwrite.
2. `npm ci` یا build frontend شکست می‌خورد.
3. PM2 reload می‌شود اما `/api/health` پاسخ نمی‌دهد.
4. Docker/LiveKit، MongoDB یا Redis بالا نیستند.
5. `.env` یا متغیرهای `NEXT_PUBLIC_*` اشتباه هستند. متغیرهای frontend هنگام build داخل bundle قرار می‌گیرند.
6. IP عمومی، firewall، پورت‌های UDP یا Docker host networking اشتباه است.

خطای گزارش‌شده‌ی سرور:

```text
source روی سرور تغییر محلی دارد:
 M unlimited-stream-front/src/components/livekit-player.jsx
```

این خطا به‌خودی‌خود server crash نیست؛ یعنی update قبل از pull/build متوقف شده است. برای فهمیدن علت واقعی down باید لاگ‌های PM2، systemd، Docker و install خوانده شوند.

## Recovery امن روی VPS

ابتدا وضعیت را بدون حذف داده بررسی کن:

```bash
cd /opt/unlimited-stream
git status --short --branch
pm2 list
pm2 logs --lines 100
docker compose -f /opt/livekit/docker-compose.yml ps
curl -i --max-time 5 http://127.0.0.1/api/health
```

اگر فقط همان تغییر محلی player وجود دارد، ابتدا backup بگیر و سپس update را اجرا کن:

```bash
cd /opt/unlimited-stream

mkdir -p /root/ultra-live-local-backups
cp unlimited-stream-front/src/components/livekit-player.jsx \
  /root/ultra-live-local-backups/livekit-player.jsx.$(date +%Y%m%d%H%M%S)

git diff -- unlimited-stream-front/src/components/livekit-player.jsx \
  > /root/ultra-live-local-backups/livekit-player.diff

git stash push -m "backup old server livekit player" -- \
  unlimited-stream-front/src/components/livekit-player.jsx

sudo bash install.sh
```

اسکریپت باید این مراحل را انجام دهد:

```text
fetch/fast-forward branch
backend npm ci --omit=dev
frontend npm ci
frontend npm run build -- --webpack
pm2 reload ecosystem.config.js --update-env
pm2 save
health check /api/health
```

### Update عادی روی سرور موجود

```bash
cd /opt/unlimited-stream
sudo bash install.sh
```

اسکریپت branch `koosha-live-current` را fast-forward می‌کند، dependencyها را نصب می‌کند، frontend را build می‌کند، PM2 را reload می‌کند و health check می‌گیرد.

بعد از update:

```bash
pm2 status
pm2 logs unlimited-stream-backend --lines 100
pm2 logs unlimited-stream-frontend --lines 100
curl -fsS http://127.0.0.1/api/health
curl -fsS http://127.0.0.1:7880/
```

## بررسی پس از deploy

از browser DevTools، بدون نمایش token، این موارد را بررسی کن:

1. درخواست `/api/livekit/monitor-token/<token>` باید HTTP 200 باشد.
2. پاسخ باید `serverUrl`، `participantToken` و room صحیح داشته باشد؛ مقدار token را چاپ یا share نکن.
3. Console باید لاگ `[LiveKit] connecting` و سپس `ConnectionStateChanged: connected` یا `[LiveKit] connected` را نشان دهد.
4. باید `ParticipantConnected` مربوط به Ingress و سپس `TrackSubscribed` برای video/audio دیده شود.
5. اگر اتصال شکست خورد، لاگ `[LiveKit] connection failed` شامل name/message/stack/code/reason و room/serverUrl را بررسی کن.
6. اگر `TrackSubscribed` دیده شد ولی تصویر نیست، مشکل در codec/track یا browser playback است؛ اگر قبل از آن شکست خورد، مشکل token، room، WebSocket یا شبکه است.

### تشخیص سریع مرحله‌ی شکست

```text
token endpoint failed       -> backend auth/monitor link/LiveKit config
token 200, connect failed   -> serverUrl, WebSocket, token room, firewall/TLS
connected, no participant   -> Ingress/roomName/webhook/publisher
participant, no track       -> Ingress publication/codec/subscription
track subscribed, no video  -> attach/playback/browser media policy
```

## نکات change control

- `.env`ها و secretها نباید commit شوند.
- قبل از update، `git status` گرفته شود.
- تغییر محلی سرور هرگز بدون backup overwrite نشود.
- `install.sh` را برای update عادی استفاده کن؛ پکیج‌ها، MongoDB، Nginx، firewall و فایل‌های LiveKit operational state هستند و نباید دستی reset شوند.
- تا وقتی لاگ قطعی نداریم، سرور را reboot یا LiveKit room/Ingress را delete نکن.
- پس از هر تغییر، frontend build، backend load و `/api/health` بررسی شود.

## محدودیت گزارش فعلی

از محیط توسعه، endpointهای عمومی `/api/health` و LiveKit روی VPS پاسخ‌گو بودند، اما PM2/Docker و لاگ‌های داخلی VPS در اختیار این workspace نیستند. بنابراین علت دقیق down شدن production فقط با خروجی‌های زیر قابل نهایی‌کردن است:

```bash
pm2 status
pm2 logs --lines 200
docker compose -f /opt/livekit/docker-compose.yml ps
tail -n 200 /var/log/unlimited-stream-install.log
```