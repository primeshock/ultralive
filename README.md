# Ultra Live / Koosha Live

این سند وضعیت فعلی پروژه، معماری، مسیر deploy و نکات عیب‌یابی را ثبت می‌کند. اطلاعات حساس مانند رمز MongoDB، JWT secret، کلید LiveKit، stream key و cookie نباید در Git یا این فایل ذخیره شوند.

## وضعیت فعلی

- Branch deploy: `koosha-live-current`
- آخرین commit فعلی: `d567855` (`fix: repair LiveKit reconnect and ingress payload`)
- Repository: `https://github.com/primeshock/ultralive`
- Backend: Node.js + Express + MongoDB + Socket.io
- Frontend: Next.js 16.3.3 + React 19.2.8
- LiveKit client: `2.22.3`
- LiveKit server SDK: `2.19.0`
- LiveKit server/Ingress: Docker، با پورت‌های جداگانه برای signaling، media و RTMP ingress

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