# Ultra Live - Project Context

این سند مرجع اصلی پروژه است و برای تحویل به agent یا توسعه‌دهنده‌ی بعدی نوشته شده است. مستندات قدیمی پروژه حذف شده‌اند؛ برای فهم پروژه ابتدا همین فایل را بخوان، سپس فقط فایل‌های مستقیم مرتبط با کاری که انجام می‌دهی را باز کن.

## 1. هدف پروژه

Ultra Live یک پلتفرم کلاس آنلاین زنده برای یک مؤسسه است. دانش‌آموز از سایت WordPress مؤسسه یک لینک امضاشده دریافت می‌کند و بدون ساخت حساب داخلی وارد کلاس می‌شود. ادمین کلاس‌ها را مدیریت می‌کند و owner ادمین‌ها را می‌سازد.

مدل ساده‌ی نقش‌ها:

- `owner`: مالک اصلی سیستم؛ ساخت و مدیریت adminها، تنظیمات کلی و مانیتورینگ.
- `admin`: مدیر عملیاتی؛ ساخت تعداد نامحدود کلاس و مدیریت کلاس‌های خودش.
- کلاس: در دیتابیس فعلی به‌صورت رکورد `User` با `role: teacher` نگه‌داری می‌شود. این یک compatibility decision است و به معنی نقش قابل‌ورود برای کاربر نهایی نیست.
- student: حساب داخلی ندارد؛ فقط session امضاشده‌ی WordPress دارد.

هدف نهایی تجربه‌ای شبیه پنل استریم سرویس‌هایی مثل آپارات/YouTube Live است: admin کلاس را می‌سازد، همان‌جا credential پخش LiveKit را می‌گیرد، وارد صفحه‌ی کلاس می‌شود و چت، moderation، poll و quiz را از همان صفحه کنترل می‌کند.

## 2. وضعیت فعلی مهم

آخرین deploy موفق روی VPS با مشخصات زیر تأیید شده است:

- IP: `37.202.246.54`
- branch deploy: `koosha-live-current`
- آخرین commit این workspace و branch deploy: `e1d36d8`؛ قبل از این سند، deploy موفق `3997cc8` تأیید شده بود. تغییرات بعدی باید پس از push جداگانه روی VPS update شوند.
- Backend و frontend با PM2 آنلاین بودند.
- `GET http://127.0.0.1/api/health` پاسخ `{"ok":true}` داده است.
- LiveKit، Redis و LiveKit Ingress در Docker اجرا شدند.
- نصب‌کننده از repository فعلی GitHub می‌خواند:
  `https://github.com/primeshock/ultralive.git`
- نصب‌کننده branch `koosha-live-current` را clone می‌کند.

اطلاعات حساس مثل password Mongo، JWT secret، LiveKit secret و `WP_JOIN_SECRET` نباید در این سند یا GitHub نوشته شوند. فایل‌های `.env` در ignore هستند.

## 3. ساختار repository

```text
/
  install.sh                         نصب و update روی Ubuntu/Debian
  PROJECT_CONTEXT.md                 همین سند مرجع
  unlimited-stream-backend/
    package.json
    .env.example
    scripts/
      fix-node-media-server.js       patch لازم برای node-media-server
      seed-owner.js                  ساخت یا update owner اولیه
    src/
      app.js                         mount همه routeها و middlewareها
      server.js                      اتصال Mongo، HTTP server، chat و media server
      config/
        db.js
        env.js                       همه env variableها
      controllers/
        auth.controller.js
        stream.controller.js
        user.controller.js
      middleware/
        auth.middleware.js
        errorHandler.js
        requireRole.js
      models/
        User.js                       owner/admin/class compatibility model
        Moderation.js
        MonitorLink.js
        RoomSession.js
        AttendanceLog.js
        ChatMessage.js
        LoginLog.js
        Poll.js
        SiteSettings.js
      routes/
        auth.routes.js
        user.routes.js
        stream.routes.js
        admin.routes.js
        master.routes.js
        session.routes.js
        monitor.routes.js
        live.routes.js                  HLS compatibility proxy
        livekit.routes.js
        livekit-webhook.routes.js
        poll.routes.js
        pollVote.routes.js
        media.routes.js
      services/
        chat.js
        livekit.js
        mediaServer.js
      utils/
        checkStudentAccess.js
        joinToken.js
        jwt.js
        password.js
        serialize.js
        streamKey.js
        upload.js
  unlimited-stream-front/
    package.json
    next.config.mjs
    src/app/
      page.js
      login/page.js
      register/page.js
      dashboard/page.js
      master/page.js
      admin/page.js
      channel/[username]/page.js
      monitor/[token]/page.js
    src/components/
      livekit-player.jsx
      live-chat.jsx
      class-admin-panel.jsx
      poll-results-chart.jsx
      poll-widget.jsx
      hls-player.jsx             compatibility/rollback player
      site-header.jsx
      ui/*
    src/lib/
      api.js
      auth-context.jsx
      socket.js
      linkify.js
      utils.js
```

## 4. معماری پخش

### مسیر مطلوب فعلی: LiveKit فقط

- OBS باید فقط به RTMP Ingress مربوط به LiveKit وصل شود.
- برای هر کلاس باید از endpoint ساخت ingress، `url` و `streamKey` همان کلاس گرفته شود.
- HLS/RTMP قدیمی هنوز در repository وجود دارد تا rollback و migration امن باشد، اما مسیر فعلی frontend برای کلاس باید LiveKit را انتخاب کند.
- `node-media-server` فعلاً همچنان در backend بالا می‌آید؛ حذف کامل آن یک کار جداگانه و پرریسک است و نباید بدون برنامه انجام شود.

پورت‌های فعلی:

- RTMP قدیمی: `1935`
- LiveKit signaling: `7880/tcp`
- LiveKit ICE TCP fallback: `7881/tcp`
- LiveKit media: بازه‌ی UDP `50000-50100`
- LiveKit Ingress RTMP: `1936/tcp`
- TURN داخلی LiveKit: `3478/udp`

LiveKit با `network_mode: host` اجرا می‌شود و config آن در `/opt/livekit` ساخته می‌شود. تنظیمات مهم شامل API key/secret، `node-ip`، `use_external_ip`، Redis، Ingress و TURN است.

نکته‌ی مهم: TURN زمانی واقعاً کار می‌کند که پورت `3478/udp` و بازه‌ی media در firewall خود VPS و firewall ارائه‌دهنده‌ی cloud هم باز باشند. پروژه هنوز تست جامع WebRTC/TURN از شبکه‌های واقعی مختلف ندارد.

## 5. نقش‌ها و جریان ورود

### owner

- ورود از `/login`
- redirect به `/master`
- ساخت admin از `/api/master/admins`
- تنظیمات سایت از `/api/master/settings`
- مانیتورینگ از `/api/master/system-stats`

### admin

- ورود از `/login`
- redirect به `/admin`
- دیدن کلاس‌هایی که `managedBy` آن admin است.
- ساخت تعداد نامحدود کلاس از `/api/admin/channels`.
- مدیریت چت، لینک تست، monitor، moderation، poll/quiz و LiveKit همان کلاس.
- token LiveKit و chat باید فقط برای کلاس‌های خودش صادر شود؛ owner دسترسی سراسری دارد.

### class record

کلاس فعلاً در مدل `User` ساخته می‌شود:

```js
{
  role: "teacher",
  username: "class_slug",
  managedBy: adminId,
  streamKey: generatedKey,
  livekitIngressId: "...",
  livekitIngressUrl: "...",
  livekitStreamKey: "..."
}
```

admin نباید برای stream کردن وارد حساب کلاس شود. password داخلی کلاس به‌صورت تصادفی ساخته می‌شود و UI آن را از admin نمی‌خواهد. credential قابل استفاده در OBS، credential LiveKit Ingress همان کلاس است.

### student

- از WordPress لینک HMAC کوتاه‌مدت می‌گیرد.
- endpoint ورود: `GET /api/session/join?token=...`
- backend پس از اعتبارسنجی، cookieهای session/device کلاس را می‌سازد.
- قانون فعلی یک session/یک device برای هر student و channel است.
- student به panelهای admin/owner دسترسی ندارد.

## 6. endpointهای مهم

### auth

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### owner

```text
POST  /api/master/admins
GET   /api/master/admins
GET   /api/master/settings
PATCH /api/master/settings
GET   /api/master/system-stats
GET   /api/master/activity
```

### admin و owner

```text
GET    /api/admin/channels
POST   /api/admin/channels
POST   /api/admin/channels/:channel/chat-mode
POST   /api/admin/channels/:channel/test-link
GET    /api/admin/channels/:channel/active-students
GET    /api/admin/channels/:channel/attendance
POST   /api/admin/channels/:channel/monitor-link
DELETE /api/admin/channels/:channel/monitor-link
POST   /api/admin/channels/:channel/moderation
GET    /api/admin/channels/:channel/moderation
DELETE /api/admin/moderation/:id
```

### LiveKit

```text
GET    /api/livekit/status
GET    /api/livekit/token?channel=...
GET    /api/livekit/monitor-token/:token
POST   /api/livekit/channels/:channel/ingress
DELETE /api/livekit/channels/:channel/ingress
POST   /api/livekit/webhook
```

### کلاس و student

```text
GET  /api/streams/:username
GET  /api/rooms/:channel/polls/active
POST /api/rooms/:channel/polls/:pollId/vote
GET  /api/session/join?token=...
GET  /api/monitor/:token
```

صفحه‌های اصلی:

```text
/master
/admin
/channel/:username
/monitor/:token
```

## 7. چت و moderation

Socket.io روی همان HTTP server backend اجرا می‌شود. دانش‌آموز پس از `chat:join` با room-session شناخته می‌شود؛ admin/owner با JWT شناخته می‌شوند.

ویژگی‌ها:

- چت عمومی یا خصوصی
- history محدود
- reply
- emoji
- system message
- mute/ban تایمی یا دائمی در مدل `Moderation`
- منوی سه‌نقطه روی پیام دانش‌آموز برای admin/owner در `live-chat.jsx`
- admin از داخل صفحه‌ی کلاس moderation را به endpoint همان کلاس می‌فرستد.

در تغییرات اخیر `externalUserId` برای پیام student به frontend ارسال شده تا moderation روی شناسه‌ی واقعی WordPress اعمال شود.

## 8. poll و quiz

مدل Poll و PollResponse در backend وجود دارند. admin می‌تواند از `class-admin-panel.jsx` داخل صفحه‌ی کلاس:

- poll یا quiz بسازد.
- گزینه‌ها و timer تعیین کند.
- گزینه‌ها را هنگام ساخت و بعد از ساخت اضافه یا حذف کند؛ حداقل دو گزینه حفظ می‌شود.
- با سوییچ پیش‌فرض خاموش تعیین کند نتیجه برای دانش‌آموز نمایش داده شود یا نه.
- نمودار دایره‌ای درصدی با رنگ جدا و شماره‌ی هر گزینه ببیند.
- poll را ببندد.
- نتیجه را reveal کند.
- رأی‌ها را reset کند.

student از `PollWidget` رأی می‌دهد و فقط در صورت `showResults: true` نمودار نتایج را می‌بیند. endpoint active poll آخرین poll را برمی‌گرداند؛ چند poll هم‌زمان هنوز طراحی نشده است.

تامبنیل از هر نوع تصویر مرورگرپذیر پذیرفته می‌شود، داخل قاب 16:9 با خروجی JPG و ابعاد
`1280×720` در مرورگر crop می‌شود و سپس به backend ارسال می‌شود. کنترل zoom و جابه‌جایی
افقی/عمودی برای انتخاب محدوده وجود دارد.

## 9. monitor

علت JSON قدیمی این بود که `/api/monitor/:token` مستقیماً JSON برمی‌گرداند. جریان جدید:

- admin لینک را از endpoint monitor می‌سازد.
- لینک UI باید به `/monitor/:token` برود.
- صفحه‌ی frontend token LiveKit مخصوص monitor می‌گیرد.
- `LiveKitPlayer` بدون login به room همان کلاس وصل می‌شود.

لینک‌های قدیمی که `/api/monitor/...` دارند ممکن است هنوز JSON نشان دهند؛ برای تست لینک جدید بساز.

## 10. installer و update سرور

installer در `install.sh` است. برای نصب اولیه:

```bash
curl -fsSL https://raw.githubusercontent.com/primeshock/ultralive/koosha-live-current/install.sh \
  -o /tmp/koosha-install.sh
sudo bash /tmp/koosha-install.sh 37.202.246.54 --with-livekit
```

برای update بدون نصب مجدد:

```bash
curl -fsSL https://raw.githubusercontent.com/primeshock/ultralive/koosha-live-current/install.sh \
  -o /tmp/koosha-update.sh
sudo bash /tmp/koosha-update.sh 37.202.246.54 --with-livekit
```

installer:

- repository `primeshock/ultralive` و branch `koosha-live-current` را می‌گیرد.
- source خراب Docker apt را قبل از apt update غیرفعال می‌کند.
- `.env` را حفظ می‌کند و secretهای موجود را reuse می‌کند.
- Mongo container و volume را حفظ می‌کند.
- frontend/backend را install و build می‌کند.
- LiveKit/Redis/Ingress را با Docker بالا می‌آورد.
- Nginx و firewall را تنظیم می‌کند.
- PM2 را reload و save می‌کند.

در updateهای قبلی `npm install` باعث تغییر `unlimited-stream-front/package-lock.json` می‌شد و `git pull` متوقف می‌شد. installer جدید قبل از pull فقط همین lockfile را backup می‌کند و نسخه‌ی repository را restore می‌کند. این backup در `/root/koosha-package-lock.backup` قرار می‌گیرد.

پس از update:

```bash
pm2 list
curl http://127.0.0.1/api/health
curl http://127.0.0.1/api/livekit/status
pm2 logs --lines 100
```

## 11. deploy فعلی و Git

repository عمومی فعلی:

```text
https://github.com/primeshock/ultralive
```

branch قابل deploy:

```text
koosha-live-current
```

به‌دلیل unrelated history، branch جدید با `main` قدیمی merge نشده است. تا وقتی ساختار Git عمداً تغییر نکرده، deploy باید با branch `koosha-live-current` انجام شود. force push یا حذف `main` ممنوع است مگر owner صریحاً درخواست کند.

## 12. قواعد ایمنی برای agent بعدی

1. قبل از edit فقط فایل مستقیم مرتبط و call-site آن را بخوان.
2. نقش `teacher` در دیتابیس فعلی همان class compatibility record است؛ آن را بدون migration حذف نکن.
3. RTMP/HLS قدیمی را بدون rollback plan حذف نکن.
4. هیچ secret، password، `.env` یا `/opt/livekit/.keys` را commit نکن.
5. `managedBy` را برای adminها رعایت کن؛ admin نباید کلاس admin دیگر را ببیند یا کنترل کند.
6. LiveKit credential هر کلاس را با credential کلاس دیگر قاطی نکن.
7. بعد از هر edit، syntax یا build مربوط به همان slice را اجرا کن.
8. روی VPS `git reset --hard` اجرا نکن؛ ممکن است `.env` یا تغییرات عملیاتی از بین برود.
9. تغییرات را کوچک commit کن و روی `koosha-live-current` push کن.
10. قبل از اعلام موفقیت، `pm2 list` و `/api/health` را بررسی کن.

## 13. کارهای باقی‌مانده و ریسک‌ها

اولویت بالا:

- تست واقعی LiveKit از مرورگر بیرونی با OBS و یک کلاس واقعی.
- تست TURN از شبکه‌ی محدود یا موبایل.
- بررسی دقیق webhook و اینکه شروع/پایان ingress، وضعیت `isLive` را درست تغییر دهد.
- اضافه‌کردن HTTPS/WSS؛ deployment فعلی HTTP و `ws://` است.
- rate limit برای session join، test-link، token و monitor token.
- ممیزی کامل IDOR همه‌ی routeها.
- بررسی اینکه frontend فقط LiveKit را render می‌کند و HLS فقط rollback code است.
- رفع warning فعلی lint در `admin/page.js` درباره‌ی dependency `refreshChannelData`.

اولویت متوسط:

- حذف کامل dashboard قدیمی streamer پس از اطمینان از migration کلاس‌ها.
- حذف یا archive کردن endpointهای ساخت channel در owner اگر دیگر compatibility لازم نیست.
- نمایش وضعیت Ingress و دکمه‌ی delete/recreate در پنل کلاس.
- نمایش logo/fav icon واقعی.
- تست خودکار API، role access، chat moderation، poll vote و LiveKit token.
- پشتیبانی از چند poll فعال، در صورت نیاز.

خارج از scope فعلی:

- ضبط و Egress LiveKit
- ارسال هم‌زمان به YouTube یا سرویس‌های دیگر
- scale افقی و CDN

## 14. تست دستی پیشنهادی

1. owner وارد `/master` شود و یک admin بسازد.
2. با admin وارد `/admin` شود و دو کلاس بسازد.
3. مطمئن شو هر کلاس username، URL و ingress جدا دارد.
4. برای یک کلاس LiveKit ingress بساز.
5. فقط همان URL و key را در OBS وارد کن.
6. `/channel/class_slug` را در مرورگر باز کن.
7. با لینک WordPress یا test-link student وارد شو.
8. چت را امتحان کن و از منوی سه‌نقطه mute/ban بزن.
9. از داخل صفحه کلاس poll و quiz بساز و رأی student را بررسی کن.
10. monitor link جدید بساز و `/monitor/:token` را در پنجره‌ی بدون login باز کن.
11. با قطع/وصل شبکه، reconnect و TURN را بررسی کن.

## 15. اطلاعاتی که نباید با agent بعدی share شود

- password owner
- password Mongo
- `JWT_SECRET`
- `WP_JOIN_SECRET`
- `ROOM_SESSION_SECRET`
- `LIVEKIT_API_SECRET`
- محتوای `/opt/livekit/.keys`
- credential واقعی OBS/Ingress
