# خطة: دعم إشعارات Median.co WebView (Native Push)

## الهدف
تطبيقك Lovable شغّال على المتصفح، ولما تلفّه بـ Median.co كـ WebView، الإشعارات لازم تشتغل **native** عبر OneSignal Native Plugin (مش Web Push)، ويوصل نفس الإشعار لنفس المستخدم على كل أجهزته.

## ما الذي سيتم تعديله في الكود

### تحديث `src/lib/onesignal.ts`
يكتشف البيئة تلقائياً ويستخدم الـ bridge المناسب:
- **داخل Median WebView** → يستخدم `median.onesignal.*` (الـ native bridge اللي Median بيحقنه في `window`)
- **متصفح عادي** → يستخدم `OneSignal` Web SDK (الحالي)

نفس الدوال `osLogin(userId)` و `osLogout()` هتشتغل في الحالتين بدون تغيير في `use-auth.tsx`.

### إضافة `src/lib/median.ts` (جديد)
helper صغير يكتشف:
- `isMedianApp()` — هل احنا جوة Median WebView؟ (بفحص `window.median` أو user-agent)
- يضمن نستنى تحميل الـ bridge قبل ما ننده عليه

## ما يجب عليك فعله **مرة واحدة** خارج الكود (دليل خطوة بخطوة)

سأكتب دليل عربي مفصّل في ملف `MEDIAN_SETUP.md` يشرح:

### أ) Firebase (مجاني — لـ Android Push)
1. ادخل https://console.firebase.google.com → Create project
2. Add Android app → اكتب package name الخاص بتطبيق Median
3. حمّل `google-services.json`
4. خد **Server Key** من Project Settings → Cloud Messaging

### ب) OneSignal Dashboard
1. ادخل https://dashboard.onesignal.com → تطبيقك الموجود
2. Settings → Platforms → **Google Android (FCM)**
3. الصق الـ Firebase Server Key
4. لـ iOS (لو محتاج لاحقاً): Settings → Apple iOS (APNs) — يتطلب Apple Developer Account

### ج) Median.co Dashboard
1. ادخل تطبيقك على median.co
2. **Native Plugins → OneSignal**
3. حط نفس الـ App ID: `13096a2e-b5f2-4d42-a446-02b83d93bbc5`
4. اعمل Build جديد للتطبيق

## النتيجة

```text
طلب جديد → DB trigger → /api/public/notify-push → OneSignal → external_id ──┬→ Web Push (متصفح)
                                                                              └→ Native Push (Median app: Android/iOS)
```

نفس المستخدم يوصله الإشعار سواء فاتح الموقع في المتصفح أو فاتح تطبيق Median أو حتى التطبيق مقفول — تلقائياً.

## ملفات هتتعدّل

- `src/lib/onesignal.ts` (تحديث: detection + Median bridge fallback)
- `src/lib/median.ts` (جديد: helper)
- `MEDIAN_SETUP.md` (جديد: دليل عربي للخطوات اليدوية في Firebase + OneSignal + Median)

## ملاحظة مهمة

الـ backend (DB trigger + endpoint + OneSignal API call) **مش هيتغيّر إطلاقاً**. الإعداد اللي عملناه قبل كده شغّال زي ما هو لـ Web و Native معاً.
