const express = require('express');
const { upload, cleanupFiles } = require('../upload');

const router = express.Router();

const STUDIO_OPTIONS = [
  {
    id: 'color_greige',
    category: 'رنگ کابینت (رنگ پلی‌اورتان)',
    title: 'گریژ گرم دو رنگ (کد نیپون NP N 1864T + 3026P)',
    subtitle: 'کابینت بالا گریژ روشن گرم + کابینت پایین گریژ متوسط (پیشنهاد اول نوکابین)',
    swatch: '#b8a99a',
    extraCostMillions: 0,
    previewImage: '/assets/studio-color-greige.jpg',
    beforeImage: '/assets/before-1.jpg',
    aiNote: 'بهترین هماهنگی با صفحه و کاشی کرم/بژ و کف سنگ خاکستری؛ بدون دلزدگی و بسیار مدرن.',
  },
  {
    id: 'color_nordic',
    category: 'رنگ کابینت (رنگ پلی‌اورتان)',
    title: 'سفید گرم نوردیک (Ivory / Alabaster)',
    subtitle: 'روشن‌ترین انتخاب برای بزرگ‌تر و دلبازتر دیده شدن فضای آشپزخانه',
    swatch: '#FAF8F5',
    extraCostMillions: 0,
    previewImage: '/assets/studio-color-nordic.jpg',
    beforeImage: '/assets/before-1.jpg',
    aiNote: 'مناسب آشپزخانه‌های کم‌نور؛ اجرای سوپرمات ابریشمی با رنگ پلی‌اورتان.',
  },
  {
    id: 'color_sage',
    category: 'رنگ کابینت (رنگ پلی‌اورتان)',
    title: 'سبز زیتونی / سیج مات + بالا کرم گرم',
    subtitle: 'ترکیب خاص و اروپایی، فوق‌العاده هماهنگ با صفحه و کاشی‌های گرم',
    swatch: '#4B5842',
    extraCostMillions: 2,
    previewImage: '/assets/studio-color-sage.jpg',
    beforeImage: '/assets/before-1.jpg',
    aiNote: 'کابینت را از حالت چوبی قدیمی خارج کرده و هویت طراحی داخلی لوکس به فضا می‌دهد.',
  },
  {
    id: 'color_smoky',
    category: 'رنگ کابینت (رنگ پلی‌اورتان)',
    title: 'طوسی اسموکی / زغالی مدرن + بالا گریژ روشن',
    subtitle: 'کنتراست مدرن و شیک بدون تاریک شدن نیمه بالایی آشپزخانه',
    swatch: '#5A5E63',
    extraCostMillions: 2,
    previewImage: '/assets/studio-color-smoky.jpg',
    beforeImage: '/assets/before-1.jpg',
    aiNote: 'ایجاد کنتراست مدرن با صفحه روشن و کف خاکستری در عین حفظ روشنایی سقف.',
  },
  {
    id: 'add_island',
    category: 'ارتقای دکوراسیون و فضا',
    title: 'ساخت جزیره مدرن هم‌رنگ کابینت',
    subtitle: 'افزودن کانتر جزیره کاربردی در مرکز آشپزخانه با صفحه سنگی و فضای نشیمن',
    swatch: '#936c30',
    extraCostMillions: 24,
    previewImage: '/assets/studio-island.jpg',
    beforeImage: '/assets/before-1.jpg',
    aiNote: 'افزایش سطح کار و فضای ذخیره‌سازی + تفکیک مدرن آشپزخانه از نشیمن.',
  },
  {
    id: 'add_coffeebar',
    category: 'ارتقای دکوراسیون و فضا',
    title: 'ساخت کافی‌بار اختصاصی (Coffee Bar)',
    subtitle: 'شلف‌های چوب طبیعی، نور مخفی گرم و جایگاه ویژه اسپرسوساز و ماگ‌ها',
    swatch: '#6f4e1b',
    extraCostMillions: 12,
    previewImage: '/assets/studio-coffeebar.jpg',
    beforeImage: '/assets/before-1.jpg',
    aiNote: 'تبدیل کنج پرت روی صفحه کابینت به نقطه کانونی لوکس و پرکاربرد.',
  },
  {
    id: 'refinish_countertop',
    category: 'سطوح و بین‌کابینتی',
    title: 'نوسازی / رنگ و روکش صفحه کابینت',
    subtitle: 'تبدیل صفحه قدیمی به طرح سنگ کوارتز سفید رگه‌دار گرم بدون تخریب',
    swatch: '#ede6da',
    extraCostMillions: 14,
    previewImage: '/assets/studio-countertop.jpg',
    beforeImage: '/assets/before-1.jpg',
    aiNote: 'هماهنگی کامل صفحه کانتر با رنگ جدید پلی‌اورتان کابینت‌ها.',
  },
  {
    id: 'change_backsplash',
    category: 'سطوح و بین‌کابینتی',
    title: 'تغییر کاشی بین‌کابینتی به اسلب مدرن + نور مخفی',
    subtitle: 'جایگزینی کاشی‌های قدیمی با اسلب پرسلان طرح ماربل گرم و لاین نوری زیرکابینتی',
    swatch: '#d9cbb8',
    extraCostMillions: 16,
    previewImage: '/assets/studio-backsplash.jpg',
    beforeImage: '/assets/before-1.jpg',
    aiNote: 'حذف بندکشی‌های قدیمی کاشی و دوچندان کردن جلوه رنگ جدید کابینت.',
  },
];

router.get('/options', (_req, res) => {
  res.json({
    ok: true,
    maxPhotos: 3,
    options: STUDIO_OPTIONS,
  });
});

router.post('/analyze', upload.array('photos', 3), (req, res) => {
  const files = req.files || [];
  try {
    if (files.length === 0) {
      return res.status(400).json({ error: 'لطفاً حداقل ۱ عکس (و حداکثر ۳ عکس) از آشپزخانه خود انتخاب کنید.' });
    }
    if (files.length > 3) {
      cleanupFiles(files);
      return res.status(400).json({ error: 'حداکثر ۳ عکس از زوایای آشپزخانه می‌توانید آپلود کنید.' });
    }

    const uploadedUrls = files.map((f) => ({
      url: `/uploads/${f.filename}`,
      name: f.originalname,
      sizeKB: Math.round(f.size / 1024),
    }));

    const analysis = {
      photosCount: files.length,
      detectedLayout: files.length >= 2 ? 'چیدمان خطی / ال‌شکل با یونیت‌های هوایی و زمینی سالم' : 'یونیت‌های دیواری و زمینی استاندارد با اسکلت قابل نگهداری',
      cabinetCondition: 'بدنه و اسکلت سالم — مناسب زیرسازی کارگاهی و اجرای رنگ پلی‌اورتان',
      counterAndTileTone: 'ته‌رنگ گرم (کرم / بژ) — نیازمند پالت‌های خنثی گرم برای ایجاد هارمونی',
      recommendedPrimaryColor: 'گریژ گرم دو رنگ (کد نیپون NP N 1864T برای بالا + NP N 3026P برای پایین)',
      estimatedDelivery: '۱۵ روز کاری',
      costRatioNote: 'یک‌دهم هزینه تعویض کامل (حدود ۷۰ میلیون در برابر ۷۰۰ میلیون تومان)',
      feasibilityScore: 94,
    };

    res.json({
      ok: true,
      uploadedPhotos: uploadedUrls,
      analysis,
      options: STUDIO_OPTIONS,
    });
  } catch (err) {
    cleanupFiles(files);
    res.status(400).json({ error: err.message || 'خطا در تحلیل تصاویر آشپزخانه.' });
  }
});

module.exports = router;
