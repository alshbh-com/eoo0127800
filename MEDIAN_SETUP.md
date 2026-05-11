# دليل تجهيز تطبيق Median.co مع إشعارات OneSignal

الكود جاهز يكتشف تلقائياً إذا كان شغّال في متصفح أو داخل تطبيق Median ويستخدم الطريقة المناسبة. كل اللي عليك هو الإعدادات اليدوية التالية **مرة واحدة بس**.

> الـ App ID بتاع OneSignal (محتاج تستخدمه في كل خطوة):
> `13096a2e-b5f2-4d42-a446-02b83d93bbc5`

---

## ١) Firebase (مجاني — مطلوب لإشعارات Android)

1. ادخل: https://console.firebase.google.com
2. **Add project** → اختار أي اسم (مثلاً `O&R Delivery`) → Continue → Disable Google Analytics → Create.
3. بعد ما يفتح المشروع، اضغط أيقونة **Android** (Add app).
4. **Android package name**: لازم يطابق اللي هتحطه في Median (مثلاً `com.orapp.delivery`). اكتبه واحفظه عندك.
5. اضغط **Register app** → **Download `google-services.json`** (هتحتاجه في Median).
6. ارجع لإعدادات المشروع: ⚙️ → **Project settings** → تبويب **Cloud Messaging**.
7. لو شفت قسم **Cloud Messaging API (Legacy)** = Disabled، اضغط النقاط الثلاث → **Manage API in Google Cloud Console** → Enable.
8. هتلاقي **Server key** — انسخه (هتحطه في OneSignal).

---

## ٢) OneSignal Dashboard

1. ادخل: https://dashboard.onesignal.com
2. افتح تطبيقك (نفس الـ App ID فوق).
3. **Settings → Platforms → Google Android (FCM)** → Activate.
4. الصق **Server key** اللي نسخته من Firebase.
5. ارفع `google-services.json` لو طلب منك.
6. اضغط Save.

> لـ iOS لاحقاً: تحتاج Apple Developer Account ($99/سنة) + إعداد APNs Key من OneSignal Settings → Apple iOS.

---

## ٣) Median.co Dashboard

1. ادخل: https://median.co → افتح تطبيقك (أو أنشئ تطبيق جديد بالـ URL: `https://project--7111be33-b0c5-47c5-80a1-7a40bc65823a.lovable.app`).
2. **App Settings → Android Settings**:
   - **Package Name** = نفس اللي حطيته في Firebase.
   - ارفع `google-services.json`.
3. **Native Plugins → OneSignal**:
   - **Enable** = ON.
   - **OneSignal App ID** = `13096a2e-b5f2-4d42-a446-02b83d93bbc5`.
   - احفظ.
4. **Build → Android → Build APK / AAB** → استنى لحد ما يخلص.
5. حمّل الـ APK وثبّته على موبايلك للاختبار.

---

## ٤) اختبار

1. افتح التطبيق على الموبايل وسجل دخول.
2. وافق على إذن الإشعارات لما يطلبه.
3. من حساب تاني (مثلاً مطعم)، اعمل طلب جديد.
4. الإشعار المفروض يوصلك على شريط الإشعارات حتى لو التطبيق مقفول.

> لو الإشعار ما وصلش، افتح OneSignal Dashboard → **Audience → Subscriptions** → اتأكد إن جهازك ظاهر هناك. لو ظاهر بس الإشعار ما وصلش → غالباً مشكلة في FCM Server Key (راجع خطوة ٧ في Firebase).

---

## مميزات النظام دلوقتي

✅ نفس المستخدم يستلم الإشعار على كل أجهزته (متصفح + تطبيق Android).
✅ مفيش تغيير لازم في الكود لما تبني نسخ جديدة من التطبيق.
✅ السيرفر يبعث تلقائياً عند كل إشعار جديد في DB — بدون أي تدخّل يدوي.
