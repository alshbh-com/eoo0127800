# خطة: إرسال إشعارات OneSignal تلقائياً (والتطبيق مقفول)

الهدف: لما يدخل أي إشعار جديد في جدول `notifications`، يطلع Push Notification على موبايل المستخدم على طول، حتى لو التطبيق مقفول — **بدون ما تدخل لوحة Supabase أو تعمل أي شيء يدوي**.

## الفكرة

هنخلي قاعدة البيانات نفسها (Postgres) هي اللي تنادي السيرفر تلقائياً كل ما يدخل إشعار جديد. ده باستخدام إضافة اسمها `pg_net` موجودة جاهزة في Supabase.

## الخطوات

### 1. تفعيل pg_net في قاعدة البيانات
امتداد Postgres يسمح للـ DB تبعت طلبات HTTP لأي URL.

### 2. تخزين السر (webhook secret) في إعدادات قاعدة البيانات
عشان trigger الـ Postgres يقدر يبعت الـ secret في الـ header وتتأكد منه الـ endpoint. هيتخزن في `app_settings` كصف خاص (مش في الكود).

### 3. عمل دالة + trigger على جدول notifications
كل ما يدخل صف جديد في `notifications`:
- الـ trigger ينده `pg_net` يبعت POST request للـ URL:
  `https://project--7111be33-b0c5-47c5-80a1-7a40bc65823a.lovable.app/api/public/notify-push`
- بـ header `x-webhook-secret` = نفس السر
- وفي الـ body: `user_id`, `title`, `body`, `link`

### 4. الـ endpoint الجاهز فعلاً
`/api/public/notify-push` (موجود من المرة اللي فاتت) هيستقبل الطلب، يتأكد من السر، ويبعت Push عبر OneSignal للمستخدم.

## النتيجة

```text
طلب جديد → DB trigger → pg_net → /api/public/notify-push → OneSignal → موبايل المستخدم
```

كل ده أوتوماتيك. مفيش أي خطوة يدوية بعد ما توافق على الخطة.

## تفاصيل تقنية

- migration واحد: تفعيل `pg_net`، إنشاء جدول صغير `app_secrets` لتخزين السر (مع RLS تمنع أي قراءة من العملاء)، إنشاء الدالة `tg_push_onesignal()` و trigger `AFTER INSERT` على `notifications`.
- السر هيتم توليده عشوائياً داخل migration نفسه (`gen_random_uuid()::text`) ويتخزن في `app_secrets`. نفس القيمة عوزينها في env var `ONESIGNAL_WEBHOOK_SECRET` — موجودة فعلاً، فهنحط نفس قيمة env var داخل الجدول في خطوة منفصلة.

**ملاحظة مهمة**: عشان نضمن السر اللي في DB = السر اللي في env var، الأبسط أنّ migration تنشئ السر عشوائي وتخزنه، والـ endpoint يقرأ نفس السر من DB بدل env var. كده مفيش تعارض ولا نحتاج تدخّل منك.

## ملفات هتتعدّل

- migration جديد للـ DB (pg_net + جدول السر + الدالة + الـ trigger)
- `src/routes/api/public/notify-push.ts` — يقرأ السر من DB بدل env var
