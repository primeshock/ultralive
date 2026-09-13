# Koosha Live

پلتفرم کلاس آنلاین زنده (بر پایه‌ی موتور پخش/چت Unlimited Stream) — نقش‌بندی
owner/admin/teacher، ورود دانش‌آموز فقط از سایت وردپرس مؤسسه با قانون
«یک سشن/یک دستگاه»، بن/میوت تایمی، چت خصوصی/عمومی با ریپلای، نظرسنجی/کوئیز
با تایمر و چارت، لینک مانیتور بدون لاگین، و داشبورد سوپرادمین (تنظیمات
ظاهری، مانیتورینگ سرور، آمار کاربران).

## نصب کامل و خودکار (روی یه سرور اوبونتو/دبیان تازه)

```bash
git clone <لینک-گیتهاب-شما>.git koosha-live
cd koosha-live
sudo bash install.sh <IP-عمومی-سرور>
```

اگه IP رو ندی، اسکریپت خودش حدس می‌زنه (که پشت NAT ممکنه اشتباه باشه —
بهتره صریح بدی). اسکریپت idempotent‌ه، یعنی اگه وسط راه قطع شد یا خواستی
دوباره اجراش کنی، از همونجا ادامه میده و چیزی رو خراب نمی‌کنه.

**اسکریپت خودش این‌ها رو انجام می‌ده:** Docker + MongoDB، Node + ffmpeg + pm2،
Nginx (با مسیر `/live/` که از پشت بک‌اند احراز هویت می‌شه، نه مستقیم)،
فایروال، build فرانت‌اند، **ساخت اکانت سوپرادمین**، و بالا آوردن همه‌چی.

### اکانت سوپرادمین (owner) پیش‌فرض
```
یوزرنیم: shadowstrix
رمز:     Azar@1386
```
از `/login` با همین وارد شو، بعد حتماً رمزت رو عوض کن. اگه می‌خوای از همون
اول یوزر/پسورد دیگه‌ای بسازه، قبل از اجرای اسکریپت این‌ها رو export کن:
```bash
export SEED_OWNER_USERNAME="یوزرنیم-دلخواه"
export SEED_OWNER_PASSWORD="رمز-قوی-دلخواه"
sudo -E bash install.sh <IP>
```

## معماری خیلی خلاصه

هر «کانال» (یوزرنیم یه اکانت) دقیقاً یه «کلاس»ه — مدل جدا برای اتاق نداریم.
- **owner** (سوپرادمین، خودت): همه‌چی رو می‌بینه، ادمین/کانال می‌سازه،
  تنظیمات ظاهری/فنی سایت و مانیتورینگ سرور دستشه.
- **admin**: فقط کانال‌هایی که خودش/owner بهش داده رو مدیریت می‌کنه
  (بن/میوت، حالت چت، لینک مانیتور، نظرسنجی).
- **teacher**: یه اکانت پخش‌کننده معمولی (همون مفهوم قبلی "کانال").
- **دانش‌آموز**: اصلاً اکانت روی این سیستم نداره — فقط از یه لینک امضاشده
  که سایت وردپرس مؤسسه می‌سازه وارد می‌شه.

## اتصال به وردپرس

کلید مشترک (`WP_JOIN_SECRET`) توی `unlimited-stream-backend/.env` بعد از
نصب ساخته شده. این اسنیپت رو با همون مقدار توی وردپرس بذار:

```php
<?php
define('KL_JOIN_SECRET', 'همون مقدار WP_JOIN_SECRET از .env سرور');
define('KL_SERVER_URL', 'http://IP-یا-دامنه-سرور');

function kl_build_join_link($channel_slug) {
    $user = wp_get_current_user();
    if (!$user->exists()) return null;
    // اینجا چک اشتراک فعال بودن کاربر رو جایگزین کن:
    // if (!user_has_active_subscription($user->ID)) return null;

    $payload = [
        'channel'     => $channel_slug,
        'userId'      => (string) $user->ID,
        'displayName' => $user->display_name,
        'exp'         => time() + 90,
    ];
    $b64 = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
    $sig = hash_hmac('sha256', $b64, KL_JOIN_SECRET);
    return KL_SERVER_URL . '/api/session/join?token=' . urlencode($b64 . '.' . $sig);
}

// [kl_join_button channel="algebra1"]
add_shortcode('kl_join_button', function ($atts) {
    $atts = shortcode_atts(['channel' => ''], $atts);
    $link = kl_build_join_link($atts['channel']);
    if (!$link) return '<p>برای ورود باید مشترک فعال باشید.</p>';
    return '<a href="' . esc_url($link) . '" class="button">ورود به کلاس</a>';
});
```

## تست کردن بدون وردپرس (همین الان)

هر ادمین/owner از پنل خودش می‌تونه برای هر کانالی یه «لینک تست» بسازه که
دقیقاً مثل لینک وردپرس رفتار می‌کنه — بدون نیاز به وردپرس:
```
POST /api/admin/channels/:channel/test-link
```
جواب یه URL می‌ده؛ بازش کن (یا توی یه پنجره Incognito جدا) تا رفتار
دانش‌آموز واقعی رو ببینی — از جمله اینکه اگه همون لینک رو (یا اکانت رو) از
یه دستگاه دیگه باز کنی، رد می‌شه.

## همه‌ی endpointهای جدید

**پنل مادر (owner) — `/api/master/*`**
- `POST /admins` — ساخت ادمین
- `POST /channels` — ساخت کانال/کلاس (یوزرنیم، رمز، `managedBy`: آیدی ادمین)
- `GET /channels`, `GET /admins`
- `GET /settings`, `PATCH /settings` — نام سایت، لوگو (`logoUrl`)، باز/بسته
  بودن ثبت‌نام عمومی
- `GET /system-stats` — CPU/RAM/دیسک/pm2 برای مانیتورینگ سرور
- `GET /activity` — لاگ لاگین/لاگ‌اوت همه‌ی اکانت‌های واقعی

**پنل ادمین — `/api/admin/*`** (برای owner هم کار می‌کنه)
- `GET /channels` — فقط کانال‌های خودش
- `POST /channels/:channel/chat-mode` — `{chatMode: "public"|"private"}`
- `POST /channels/:channel/test-link`
- `GET /channels/:channel/active-students`, `GET /channels/:channel/attendance`
- `POST /channels/:channel/monitor-link`, `DELETE .../monitor-link`
- `POST /channels/:channel/moderation` — `{externalUserId, type: mute|ban, scope: timed|permanent, minutes?, reason?}`
- `GET /channels/:channel/moderation`, `DELETE /moderation/:id`
- `POST /channels/:channel/polls` — `{question, mode: poll|quiz, options:[{text,isCorrect?}], timerSeconds?, revealAt?}`
- `POST /polls/:id/options` — اضافه کردن گزینه بعد از ساخت
- `POST /polls/:id/close`, `POST /polls/:id/reveal`, `POST /polls/:id/reset`
- `GET /polls/:id/results` — شمارش هر گزینه، آماده برای چارت

**دانش‌آموز/بیننده — `/api/rooms/:channel/*`**
- `GET /polls/active`, `POST /polls/:id/vote`

**ورود دانش‌آموز و مانیتور بدون لاگین**
- `GET /api/session/join?token=...`
- `GET /api/monitor/:token`, HLS از `/api/monitor/:token/live`

## چیزهایی که هنوز UI ندارن (فقط API آماده‌ست)
پنل مادر/ادمین، صفحه مانیتورینگ سرور، فرم تنظیمات ظاهری، و UI چت
(باکس دور پیام، ایموجی‌پیکر، دکمه ریپلای) — این‌ها صفحه‌ی فرانت‌اند
(Next.js) لازم دارن که هنوز ساخته نشدن؛ همه‌ی endpointهای بالا آماده و
تست‌شدنی با curl/Postman هستن، فقط دکمه و فرم روشون نیست.

## نکته امنیتی
لینک مانیتور و لینک تست، هردو bearer token هستن — هرکی لینک رو داشته باشه
می‌تونه ببینه. مثل رمز عبور نگهشون دار.
