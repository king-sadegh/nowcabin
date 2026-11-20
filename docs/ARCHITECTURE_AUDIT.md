# گزارش ممیزی فنی پروژه فعلی و معماری هدف موتور بازسازی هوشمند نوکابین (فاز ۱)

تاریخ ممیزی: ۱۴۰۵/۰۸/۲۹ (2026-11-20)  
مسیر پروژه: `/home/antigravity/king-sadegh/karami`

---

## ۱. بررسی و ممیزی پروژه فعلی (As-Is Audit)

### ۱-۱. ساختار پوشه‌ها و فایل‌ها
```text
.
├── server.js                    # نقطه ورود سرور Express + Static files + Healthcheck
├── package.json                 # Node.js >=24, express, cookie-parser, helmet, multer
├── Dockerfile / docker-compose.yml / deploy.sh / nginx/nokabin.conf
├── .github/workflows/deploy.yml # دیپلوی خودکار روی VPS از طریق SSH & Docker
├── data/
│   └── nokabin.db               # دیتابیس SQLite (با WAL)
├── uploads/                     # فایل‌های آپلودی مشتریان و گالری
├── src/
│   ├── config.js                # تنظیمات، نرمال‌سازی شماره موبایل، سقف ۳ عکس
│   ├── db.js                    # تعریف جداول SQLite و داده‌های پیش‌فرض
│   ├── auth.js                  # احراز هویت HMAC-SHA256 Token در Cookie و Bearer
│   ├── upload.js                # مدیریت آپلود با Multer (فقط JPG/PNG/WebP تا ۶ مگابایت)
│   └── routes/
│       ├── auth.js              # OTP ورود/پروفایل
│       ├── inspections.js       # ثبت سفارش بازدید رایگان و سهمیه عکس کاربر
│       ├── agents.js            # ثبت‌نام و داشبورد مشاورین املاک
│       ├── gallery.js           # گالری تغییرات واقعی
│       ├── admin.js             # پنل مدیریت
│       └── ai-studio.js         # اندپوینت فعلی استودیو هوش مصنوعی
└── public/
    ├── index.html               # صفحه اصلی لندینگ + استودیو هوش مصنوعی
    ├── changes.html             # صفحه گالری تغییرات واقعی
    ├── panel.html               # پنل مشتری / مشاور املاک / مدیر
    ├── css/styles.css           # استایل‌ها و ریسپانسیو موبایل
    └── js/{common,home,changes,panel}.js
```

### ۱-۲. فناوری‌های Frontend و Backend
- **Backend:** Node.js `v24.22.3`، `express@^4.21.2`، `helmet@^8.1.0`، `cookie-parser@^1.4.7`، `multer@^2.5.0`، و ماژول داخلی `node:sqlite` (`DatabaseSync`).
- **Frontend:** HTML5 / CSS3 / Vanilla JS بدون React یا bundler؛ فونت Vazirmatn و آیکون FontAwesome. پیش‌نمایش استودیو در `public/js/home.js` صرفاً با Canvas 2D مرورگر اجرا می‌شود.

### ۱-۳. نحوه مدیریت آپلود تصاویر
- ماژول `src/upload.js` با `multer.diskStorage` فایل‌های `image/jpeg`, `image/png`, `image/webp` را تا سقف ۶ مگابایت در پوشه پایدار `uploads/` ذخیره می‌کند (`${Date.now()}-${rand}.${ext}`).
- محدودیت فعلی: حداکثر ۳ عکس به ازای هر کاربر (`MAX_PHOTOS_PER_USER=3`) در جدول `uploaded_photos` ردیابی می‌شود.

### ۱-۴. APIهای موجود
- `GET /api/health`: بررسی سلامت سرویس برای Docker/aaPanel
- `POST /api/auth/request-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/logout`, `GET /api/auth/me`, `PATCH /api/auth/profile`
- `POST /api/inspections`, `GET /api/inspections/my`, `POST /api/inspections/:id/photos`, `DELETE /api/inspections/photos/:photoId`
- `POST /api/agents/apply`, `GET /api/agents/dashboard`
- `GET /api/gallery`
- `GET /api/admin/overview`, `PATCH /api/admin/requests/:id`, `PATCH /api/admin/agents/:userId`, `PATCH /api/admin/commissions/:id`, `POST /api/admin/gallery`, `DELETE /api/admin/gallery/:id`, `PATCH /api/admin/settings`
- `GET /api/ai-studio/options`, `POST /api/ai-studio/analyze`

### ۱-۵. دیتابیس و ساختار ذخیره‌سازی
- `data/nokabin.db` (`node:sqlite`): جداول موجود شامل `users`, `otp_codes`, `inspection_requests`, `uploaded_photos`, `agent_applications`, `commissions`, `gallery_projects`, `settings`.
- هم‌اکنون هیچ جدولی برای پروژه‌های مدل‌سازی سه‌بعدی (`kitchen_projects`)، نسخه‌های صحنه هندسی (`kitchen_scene_versions`)، یا صف رندر پس‌زمینه (`render_jobs`) وجود ندارد.

### ۱-۶. سیستم احراز هویت
- OTP موبایل ۶ رقمی (در `OTP_TEST_MODE=true` کد در خروجی لاگ و پاسخ تست برمی‌گردد) + امضای توکن `HMAC-SHA256` روی کوکی `nokabin_session` (`HttpOnly`, `SameSite=Lax`, اعتبار ۷ روز) با نقش‌های `customer`, `agent`, `admin`.

### ۱-۷. بررسی واقعی امکانات هوش مصنوعی فعلی (یافته بحرانی ممیزی)
- **آیا در نسخه فعلی مدل سه‌بعدی ساخته می‌شود؟ خیر.**
  - فایل `src/routes/ai-studio.js` (`POST /api/ai-studio/analyze`) تصاویر آپلودشده را ذخیره می‌کند اما هیچ تحلیل بینایی ماشینی واقعی انجام نمی‌دهد و صرفاً یک آبجکت JSON ثابت برمی‌گرداند.
  - فایل `public/js/home.js` دو حالت Canvas 2D دارد: `renderArchitectural3DSketch` (یک نمای ثابت پنج‌ستونی پرسپکتیو دوبعدی روی Canvas 2D که ارتباط هندسی با عکس/اندازه‌های مشتری ندارد) و `renderSobelLineSketchFromUserPhoto` (استخراج لبه Sobel دوبعدی روی عکس ورودی).
  - پیش از ممیزی هیچ کتابخانه یا کدی برای `Three.js`، `React Three Fiber`، `Blender`، `GLB`، `glTF` یا اعتبارسنجی هندسی در پروژه وجود نداشت.

### ۱-۸. استقرار و Docker
- `Dockerfile` بر پایه `node:24-slim` با Volumeهای پایدار `/app/data` و `/app/uploads` روی پورت `3000`.
- `deploy.sh` و `.github/workflows/deploy.yml` روی سرور VPS از طریق SSH (با تنظیم mirror رجیستری ایران) بیلد و راه‌اندازی می‌کنند.

---

## ۲. بررسی محدودیت‌های محیطی و تصمیم فنی صادقانه (طبق بند ۱۱-۹)

| ابزار / زیرساخت | وضعیت در سرور/VM فعلی | تصمیم اجرایی دقیق و عملی |
|---|---|---|
| Node.js `v24.22.3` + `three` (`0.187.0`) | نصب و آماده | موتور ساخت هندسه پارامتریک `KitchenScene`، اعتبارسنج هندسی، موتور تغییرات و خروجی استاندارد `.glb` (glTF 2.0) به صورت واقعی و مستقل روی Node.js ساخته می‌شود. |
| Python `3.11.2` + `numpy` + `Pillow` | نصب و آماده | ماژول تحلیل تصویر واقعی (`cv_analyzer.py`) با `numpy` و `Pillow` پیاده‌سازی می‌شود و خروجی آن با **ابعاد واردشده مشتری** ترکیب می‌گردد (طبق قانون ۱۱-۱۰، هرگز ادعا نمی‌شود ابعاد دقیق صرفاً از روی تک‌عکس استخراج می‌شود). |
| Chromium Headless + WebGL (`SwiftShader`) | آزمایش شد: **فعال و عملیاتی (`WEBGL_OK:WebKit WebGL`)** | برای رندر فوتورئال چندزاویه‌ای بدون توقف کار، موتور رندر **Three.js PBR WebGL Renderer** روی Chromium Headless به‌صورت فوری و واقعی راه‌اندازی می‌شود (نورپردازی فیزیکی، سایه نرم `PCFSoftShadowMap`، متریال‌های PBR با بافت چوب و سنگ رگه‌دار و بازتاب فلز، تولید حداقل ۳ زاویه همگام از یک مدل هندسی مشترک). |
| Blender (`bpy`) | در VM و کانتینر فعلی `node:24-slim` نصب **نیست** | اسکریپت کامل و قابل اجرای `blender_render.py` (`src/engine/blenderScriptGenerator.js`) نیز تولید می‌شود تا در صورت استقرار Worker دارای Blender Cycles مستقیماً خروجی Cycles تولید کند؛ اما سیستم اصلی فعلاً بر Three.js PBR WebGL Headless متکی است تا همه رندرها بدون وابستگی نمایشی واقعاً اجرا و تست شوند. |
| Redis / BullMQ | سرویس Redis فعال نیست | صف پس‌زمینه غیرمسدودکننده (`src/workers/renderQueue.js`) با ذخیره‌سازی پایدار در SQLite (و واسط استاندارد سازگار با ارتقا به BullMQ) پیاده‌سازی می‌شود تا تلاش مجدد (Retry)، کش جلوگیری از رندر تکراری (Hash Deduplication) و گزارش گام‌به‌گام بدون نیاز به سرور Redis مجزا کار کند. |

---

## ۳. ساختار داده استاندارد `KitchenScene` (مرجع هندسی مشترک)

```json
{
  "schemaVersion": "1.0.0",
  "sceneId": "scene_...",
  "version": 1,
  "dimensions": {
    "width": 3.8,
    "depth": 3.2,
    "ceilingHeight": 2.8,
    "layoutType": "l_shape",
    "unit": "meters"
  },
  "walls": [{ "id": "wall_back", "start": [0, 0], "end": [3.8, 0], "height": 2.8, "thickness": 0.15, "color": "#f3efe7" }],
  "openings": [{ "id": "win_1", "type": "window", "wallId": "wall_right", "offset": 1.2, "width": 1.1, "height": 1.1, "sillHeight": 1.15, "confidence": 0.85 }],
  "cabinets": [
    {
      "id": "cab_base_1",
      "kind": "base",
      "row": "row_back",
      "position": [0.95, 0.0, 0.30],
      "size": { "width": 0.90, "height": 0.86, "depth": 0.60 },
      "rotationY": 0,
      "materialId": "mat_cream",
      "doorStyle": "shaker",
      "handleStyle": "matte_black",
      "doors": [{ "id": "cab_base_1_door_1", "kind": "door", "hinge": "left", "width": 0.445, "height": 0.72 }],
      "confidence": 0.95
    }
  ],
  "countertops": [{ "id": "ct_back", "row": "row_back", "position": [1.55, 0.86, 0.31], "size": { "width": 2.9, "height": 0.04, "depth": 0.62 }, "materialId": "counter_quartz_white" }],
  "backsplashes": [{ "id": "bs_back", "row": "row_back", "position": [1.55, 0.90, 0.015], "size": { "width": 2.9, "height": 0.60, "depth": 0.02 }, "materialId": "bs_calacatta" }],
  "appliances": [
    { "id": "app_fridge", "type": "fridge", "position": [0.45, 0, 0.35], "size": { "width": 0.85, "height": 1.95, "depth": 0.70 }, "rotationY": 0, "confidence": 0.95 }
  ],
  "coffeeBars": [],
  "islands": [],
  "materials": { "upperColor": "#f4efe6", "lowerColor": "#d7cec2", "countertopId": "counter_quartz_white", "backsplashId": "bs_calacatta", "handleId": "matte_black" },
  "lighting": { "ceilingSpots": [], "underCabinetLed": true, "warmthKelvin": 3500 },
  "cameras": [
    { "id": "cam_front", "label": "نمای کلی روبه‌رو", "position": [1.9, 1.55, 3.15], "target": [1.9, 1.20, 0.35], "fov": 48 },
    { "id": "cam_right", "label": "نمای زاویه‌دار راست", "position": [3.45, 1.65, 2.75], "target": [1.55, 1.15, 0.50], "fov": 50 },
    { "id": "cam_left", "label": "نمای زاویه‌دار چپ", "position": [0.35, 1.65, 2.75], "target": [2.05, 1.15, 0.50], "fov": 50 }
  ],
  "validation": { "valid": true, "approved": true, "errors": [], "warnings": [], "missingDimensions": [] }
}
```

---

## ۴. نقشه توسعه مرحله‌به‌مرحله

1. **فاز ۱ (تکمیل شد):** ممیزی پروژه، تهیه پشتیبان `data/nokabin.db.bak` و طراحی معماری `KitchenScene`.
2. **فاز ۲ (ماژول هندسی و تغییرات):** `materials.js` + `kitchenSchema.js` + `geometryValidator.js` + `prototypeKitchen.js` + `changeEngine.js` + `glbExporter.js` + تست‌های واحد مستقل (`tests/phase2.test.js`).
3. **فاز ۳ (موتور رندر فوتورئال چندزاویه):** موتور Three.js PBR WebGL روی Chromium Headless + `blenderScriptGenerator.js` + تست رندر چند دوربین همگام روی هندسه مشترک (`tests/phase3.test.js`).
4. **فاز ۴ (اتصال تصاویر واقعی مشتری و ابعاد):** تحلیلگر بینایی ماشین `cv_analyzer.py` + `sceneReconstructor.js` (تلفیق ابعاد مشتری و چند عکس، تشخیص بخش‌های نامطمئن و درخواست اندازه تکمیلی) + تست (`tests/phase4.test.js`).
5. **فاز ۵ (صف پردازش، دیتابیس، برآورد قیمت، API و UI):** جداول جدید SQLite، `renderQueue.js`، `pricingEngine.js`، مسیر `/api/projects`، اتصال به صفحه اصلی سایت با UX ساده و تست E2E (`tests/phase5.test.js`).
