# فاز A — نصب و راه‌اندازی

این فایل توضیح می‌ده چطور تغییرات جدید رو روی سرور واقعی فعال کنی. همه‌ی
تغییرات از قبل داخل همین زیپ (روی نسخه‌ی خودت) اعمال شده — فقط باید جایگزین
کنی و مراحل زیر رو انجام بدی.

## ۱. جایگزینی فایل‌ها روی سرور
```
cd /opt/unlimited-stream
# یه بکاپ از نسخه فعلی بگیر:
cp -r unlimited-stream-backend unlimited-stream-backend.bak

# فایل‌های داخل این زیپ رو جایگزین/اضافه کن (نه کل پوشه رو حذف نکن، چون
# node_modules و .env داخلش هست)
```
دقیقاً همین فایل‌ها عوض/اضافه شدن:
- `src/config/env.js` (تغییر یافته)
- `src/app.js` (تغییر یافته)
- `src/models/User.js` (تغییر یافته)
- `src/controllers/auth.controller.js` (تغییر یافته)
- `src/services/chat.js` (تغییر یافته)
- `package.json` (تغییر یافته)
- `src/models/Moderation.js`, `RoomSession.js`, `MonitorLink.js` (جدید)
- `src/utils/joinToken.js`, `checkStudentAccess.js` (جدید)
- `src/middleware/requireRole.js` (جدید)
- `src/routes/master.routes.js`, `admin.routes.js`, `session.routes.js`, `monitor.routes.js`, `live.routes.js` (جدید)

## ۲. نصب پکیج جدید
```
cd unlimited-stream-backend
npm install
```
(`http-proxy-middleware` به package.json اضافه شده، `npm install` خودش نصبش می‌کنه)

## ۳. متغیرهای جدید `.env`
```
WP_JOIN_SECRET=<تولید کن، پایین توضیح داده>
ROOM_SESSION_SECRET=<یه رشته دیگه، متفاوت>
PUBLIC_BASE_URL=http://217.11.164.171
```
تولید سریع یه رشته امن (برای هر کدوم جدا اجرا کن):
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
`WP_JOIN_SECRET` باید دقیقاً همین مقدار توی وردپرس هم باشه (بخش ۶).

## ۴. تعیین اکانت Owner (خودت)
اول از طریق همون فرم signup/login فعلی سایت یه اکانت برای خودت بساز (اگه
نداری)، بعد نقشش رو دستی owner کن:
```
docker exec -it unlimited-stream-mongo mongosh -u <mongo-user> -p <mongo-pass> --authenticationDatabase admin
use unlimited-stream
db.users.updateOne({ username: "yourAccount" }, { $set: { role: "owner" } })
```

## ۵. تغییر ضروری Nginx
مسیر `/live/` الان مستقیم به مدیا سرور (پورت ۸۰۰۰) می‌رفت — باید از پشت
Express رد بشه تا چک احراز هویت انجام بشه:
```nginx
location /live/ {
    proxy_pass http://127.0.0.1:5050;   # قبلاً 127.0.0.1:8000 بود
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
}
```
(اگه پورت بک‌اندت چیزی غیر از ۵۰۵۰ هست، همون رو بذار — همونی که `/api/`
هم بهش proxy میشه)
```
sudo nginx -t
sudo systemctl reload nginx
```

## ۶. اسنیپت وردپرس (برای تست واقعی لازمه)
این کد رو توی یه پلاگین کوچیک یا `functions.php` تم بذار — یه تابع که برای
کاربر لاگین‌شده‌ی وردپرس (که چک می‌کنی مشترک فعال داره) یه لینک ورود امن
می‌سازه:

```php
<?php
define('US_WP_JOIN_SECRET', 'همون مقداری که توی .env گذاشتی برای WP_JOIN_SECRET');
define('US_SERVER_URL', 'http://217.11.164.171');

function us_build_join_link($channel_slug) {
    $user = wp_get_current_user();
    if (!$user->exists()) return null;

    // اینجا چک کن کاربر واقعاً مشترک فعاله (متد خودتو جایگزین کن)
    // if (!user_has_active_subscription($user->ID)) return null;

    $payload = [
        'channel'     => $channel_slug,           // یوزرنیم کانال/کلاس در آن سمت
        'userId'      => (string) $user->ID,
        'displayName' => $user->display_name,
        'exp'         => time() + 90,             // فقط ۹۰ ثانیه اعتبار دارد
    ];

    $payload_b64 = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
    $sig = hash_hmac('sha256', $payload_b64, US_WP_JOIN_SECRET);
    $token = $payload_b64 . '.' . $sig;

    return US_SERVER_URL . '/api/session/join?token=' . urlencode($token);
}

// نمونه شورت‌کد: [us_join_button channel="algebra1"]
add_shortcode('us_join_button', function ($atts) {
    $atts = shortcode_atts(['channel' => ''], $atts);
    $link = us_build_join_link($atts['channel']);
    if (!$link) return '<p>برای ورود به کلاس باید مشترک فعال باشید.</p>';
    return '<a href="' . esc_url($link) . '" class="button">ورود به کلاس</a>';
});
```
نکته: PHP's `base64_encode` استاندارد base64 میده نه base64url — کد بالا
تبدیلش می‌کنه (`+/` → `-_` و حذف `=`)، دقیقاً چیزی که سمت Node با
`Buffer.from(..., 'base64url')` انتظار داره.

## ۷. ساخت یه ادمین و یه کلاس نمونه (بعد از اینکه owner شدی و لاگین کردی)
```bash
curl -X POST http://217.11.164.171/api/master/admins \
  -H "Content-Type: application/json" \
  --cookie "us_token=<کوکی لاگین owner>" \
  -d '{"username":"admin_ahmadi","password":"یه-رمز-قوی"}'

curl -X POST http://217.11.164.171/api/master/channels \
  -H "Content-Type: application/json" \
  --cookie "us_token=<کوکی لاگین owner>" \
  -d '{"username":"algebra1","password":"یه-رمز-قوی","managedBy":"<آیدی ادمین بالا>"}'
```

## چیزهایی که این فاز پوشش داد
- نقش‌ها: owner / admin / teacher (`User.role`)
- پنل مادر: ساخت ادمین + ساخت کلاس (`/api/master/*`)
- پنل ادمین: مدیریت فقط کلاس‌های خودش (`/api/admin/*`)
- ورود دانش‌آموز فقط از لینک امضاشده‌ی وردپرس، با قانون «یک سشن/دستگاه»
- بن (تایمی/دائم) و میوت (تایمی/دائم، هم برای اکانت‌های واقعی هم دانش‌آموز)
- لینک مانیتور بدون لاگین برای هر کلاس
- بستن حفره‌ی امنیتی HLS (که قبلاً بدون چک از nginx رد می‌شد)
- سوییچ برای بستن ثبت‌نام عمومی (`ALLOW_PUBLIC_REGISTER=false`)

## چیزهایی که فاز B هست (هنوز نساختیم)
- چت خصوصی/گروهی واقعی (سرور فعلاً فقط زیرساخت مدیریتشو داره، فیلتر
  دیدن پیام‌ها بر اساس public/private هنوز اعمال نشده روی خروجی سوکت)
- ریپلای/ایموجی/باکس چت در UI
- نظرسنجی و کوئیز + چارت
- گارد فرانت‌اند برای اینکه دانش‌آموز فقط `/channel/[username]` رو ببینه
- حذف صفحه اصلی برای حالت نهایی نصب مؤسسه
- UI پنل مادر/ادمین (فعلاً فقط API هست، صفحه نداره)
