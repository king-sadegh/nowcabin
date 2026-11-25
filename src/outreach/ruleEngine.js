const config = require('../config');
const { getSetting } = require('../db');

function normalizePersianText(input) {
  if (!input) return '';
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  return String(input)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/\u200c/g, ' ')
    .replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .toLowerCase()
    .trim();
}

function getBaseUrl() {
  return String(process.env.PUBLIC_BASE_URL || 'https://nowcabin.ir').replace(/\/+$/, '');
}

function buildReferralLink(phone) {
  const norm = config.normalizePhone(phone);
  return `${getBaseUrl()}/?ref=${encodeURIComponent(norm)}`;
}

/**
 * Evaluates an inbound message from a real estate agent using smart Persian rule/keyword matching.
 * Returns { category, replyText, isSerious, seriousReason, isOptOut, autoRegisterAgent }
 */
function evaluateAgentReply(messageText, contact = {}) {
  const text = normalizePersianText(messageText);
  const rawLen = text.length;
  const name = contact.full_name ? `${contact.full_name} عزیز` : 'همکار گرامی';
  const baseUrl = getBaseUrl();
  const refLink = buildReferralLink(contact.phone || '');
  const commissionPct = Number(getSetting('default_commission_percent', config.DEFAULT_AGENT_COMMISSION_PERCENT)) || 5;

  if (!text) {
    return {
      category: 'ignored',
      replyText: null,
      isSerious: false,
      seriousReason: '',
      isOptOut: false,
      autoRegisterAgent: false,
    };
  }

  // 1. Opt-out / Unsubscribe / Negative
  const optOutPatterns = [
    'مزاحم نشو',
    'پیام نده',
    'نمیخوام',
    'نمی خوام',
    'نمیخواهم',
    'علاقه ندارم',
    'تمایل ندارم',
    'لغو',
    'بلاک',
    'ریپورت',
    'تبلیغ نفرست',
    'نفرستید',
    'املاک نیستم',
    'مشاور نیستم',
    'اشتباه گرفتید',
  ];
  if (optOutPatterns.some((kw) => text.includes(kw))) {
    return {
      category: 'opt_out',
      replyText: `با عرض پوزش بابت مزاحمت ${name} 🙏\nشماره شما از لیست ارسال نوکابین خارج شد و دیگر پیامی دریافت نخواهید کرد. روز خوبی داشته باشید.`,
      isSerious: false,
      seriousReason: '',
      isOptOut: true,
      autoRegisterAgent: false,
    };
  }

  // 2. Serious Lead / Ready Customer / Direct Call Request (Escalates immediately to Admin)
  const seriousPatterns = [
    { kw: 'مشتری دارم', reason: 'اعلام داشتن مشتری آماده' },
    { kw: 'فایل دارم', reason: 'اعلام داشتن فایل/پروژه بازسازی' },
    { kw: 'یه واحد', reason: 'معرفی واحد برای بازدید/بازسازی' },
    { kw: 'یک واحد', reason: 'معرفی واحد برای بازدید/بازسازی' },
    { kw: 'بازدید بیاید', reason: 'درخواست اعزام کارشناس بازدید' },
    { kw: 'کارشناس بفرست', reason: 'درخواست اعزام کارشناس بازدید' },
    { kw: 'تماس بگیرید', reason: 'درخواست تماس تلفنی مستقیم' },
    { kw: 'زنگ بزن', reason: 'درخواست تماس تلفنی مستقیم' },
    { kw: 'شماره تماس', reason: 'درخواست شماره تماس مستقیم مدیریت' },
    { kw: 'حضوری', reason: 'درخواست جلسه یا بازدید حضوری' },
    { kw: 'قرارداد', reason: 'مذاکره درباره قرارداد همکاری/پروژه' },
    { kw: 'پروژه داریم', reason: 'اعلام پروژه آماده همکاری' },
  ];
  const matchedSerious = seriousPatterns.find((item) => text.includes(item.kw));
  if (matchedSerious) {
    return {
      category: 'serious_lead',
      replyText:
        `سپاس از شما ${name} 🌟\n` +
        `پیام شما به عنوان «مورد ویژه همکاری» برای مدیریت نوکابین ارسال شد و همکاران ما در اسرع وقت مستقیماً در همین چت یا تلفنی با شما هماهنگ می‌کنند.\n\n` +
        `🔗 لینک اختصاصی شما جهت ثبت بازدید رایگان با ۲ میلیون تخفیف مشتری:\n${refLink}\n` +
        `📞 شماره مستقیم مدیریت: ${config.CONTACT_PHONE_DISPLAY}`,
      isSerious: true,
      seriousReason: matchedSerious.reason,
      isOptOut: false,
      autoRegisterAgent: true,
    };
  }

  // 3. Commission / Percentage / Referral Fee Questions
  const commissionPatterns = ['پورسانت', 'درصد', 'سهم مشاور', 'کمیسیون', 'چقدر به ما', 'چند درصد', 'تسویه'];
  if (commissionPatterns.some((kw) => text.includes(kw))) {
    return {
      category: 'faq_commission',
      replyText:
        `${name}، شرایط مالی همکاری با مشاورین املاک در نوکابین به این صورت است:\n\n` +
        `💰 پورسانت شما: ${commissionPct}٪ از کل مبلغ قرارداد (با توجه به میانگین ۷۰ میلیون تومانی هر آشپزخانه، حدود ۳.۵ میلیون تومان برای هر معرفی موفق)\n` +
        `🎁 مزیت برای مشتری شما: ۲ میلیون تومان تخفیف مستقیم روی قرارداد با ذکر شماره موبایل شما\n` +
        `📊 شفافیت کامل: با ورود به پنل مشاورین (${baseUrl}/panel.html?role=agent) با شماره موبایل خودتان، وضعیت تمام معرفی‌ها و مبالغ پورسانت را لحظه‌ای می‌بینید.\n\n` +
        `🔗 لینک اختصاصی شما:\n${refLink}`,
      isSerious: false,
      seriousReason: '',
      isOptOut: false,
      autoRegisterAgent: true,
    };
  }

  // 4. Price / Cost / Comparison with Full Replacement
  const pricePatterns = ['قیمت', 'هزینه', 'چند در میاد', 'متری چند', '۷۰ میلیون', '70 میلیون', 'تعرفه', 'چقدر میشه'];
  if (pricePatterns.some((kw) => text.includes(kw))) {
    return {
      category: 'faq_pricing',
      replyText:
        `در مورد هزینه بازسازی در نوکابین:\n\n` +
        `🏷 در حالی که تعویض کامل کابینت یک آشپزخانه معمولی امروز حدود ۶۰۰ تا ۷۰۰ میلیون تومان هزینه و یک ماه تخریب دارد، بازسازی کامل و تغییر رنگ تخصصی با رنگ پلی‌اورتان در نوکابین به‌طور میانگین حدود **۷۰ میلیون تومان** (یک‌دهم هزینه تعویض) تمام می‌شود.\n` +
        `📐 بازدید و کارشناسی اولیه در تمام مناطق تهران (به‌ویژه شمال و شرق تهران) کاملاً **رایگان** است.\n\n` +
        `مشتری با کد معرف شما (${contact.phone || ''}) ۲ میلیون تومان هم تخفیف می‌گیرد. اگر واحدی برای برآورد دقیق دارید بفرمایید تا کارشناس اعزام شود.`,
      isSerious: false,
      seriousReason: '',
      isOptOut: false,
      autoRegisterAgent: false,
    };
  }

  // 5. Portfolio / Before & After Photos
  const portfolioPatterns = ['نمونه کار', 'نمونه‌کار', 'عکس', 'تصویر', 'قبل و بعد', 'تغییرات', 'کیفیت کار', 'پروژه ها'];
  if (portfolioPatterns.some((kw) => text.includes(kw))) {
    return {
      category: 'faq_portfolio',
      replyText:
        `حتماً ${name} 🌟\n` +
        `تصاویر واقعی قبل و بعد پروژه‌های اجراشده در نیاوران، پاسداران و تهرانپارس (با اسلایدر مقایسه مستقیم بدون تغییر چیدمان) در لینک زیر قرار دارد:\n` +
        `👉 ${baseUrl}/changes.html\n\n` +
        `همچنین لینک اختصاصی شما برای ارسال به مالکان:\n${refLink}`,
      isSerious: false,
      seriousReason: '',
      isOptOut: false,
      autoRegisterAgent: false,
    };
  }

  // 6. Technical / Polyurethane Paint / Duration / How it works
  const technicalPatterns = [
    'پلی اورتان',
    'پلی‌اورتان',
    'رنگ',
    'پوسته',
    'دوام',
    'چند روز',
    'مدت',
    '۱۵ روز',
    '15 روز',
    'تخریب',
    'ام دی اف',
    'چوب',
    'چطوری',
    'روش کار',
  ];
  if (technicalPatterns.some((kw) => text.includes(kw))) {
    return {
      category: 'faq_technical',
      replyText:
        `توضیح فنی بازسازی کابینت در «نوکابین»:\n\n` +
        `🛠 بدون تخریب بدنه و بدون تغییر چیدمان: درب‌ها و قطعات نما باز شده، زیرسازی و بتونه‌کاری صنعتی انجام می‌شود و با **رنگ تخصصی پلی‌اورتان** (مقاوم در برابر رطوبت، خط‌وخش و تغییر رنگ) به رنگ دلخواه مشتری (سفید، کرم، طوسی گرم، گریژ و...) تبدیل می‌گردد.\n` +
        `⏱ مدت زمان تحویل: **۱۵ روز کاری**\n` +
        `📍 اولویت پوشش: شمال، شرق، مرکز و غرب تهران\n\n` +
        `نمونه‌کارهای واقعی را اینجا ببینید:\n${baseUrl}/changes.html`,
      isSerious: false,
      seriousReason: '',
      isOptOut: false,
      autoRegisterAgent: false,
    };
  }

  // 7. Positive Collaboration / Wants Referral Link
  const positiveCollabPatterns = [
    'همکاری میکنم',
    'همکاری می کنم',
    'مایل هستم',
    'مایلم',
    'لینک اختصاصی',
    'لینک دعوت',
    'ثبت نام',
    'کد معرف',
    'موافقم',
    'بفرستید',
    'بفرست',
    'حتما',
    'خوبه',
    'عالیه',
    'شرایط رو بفرست',
    'شرایط همکاری',
  ];
  if (positiveCollabPatterns.some((kw) => text.includes(kw))) {
    return {
      category: 'interested_collab',
      replyText:
        `خوشحالیم از همکاری با شما ${name} 🌹\n\n` +
        `✅ حساب همکاری شما در «نوکابین» فعال شد.\n` +
        `🔗 لینک دعوت اختصاصی شما:\n${refLink}\n\n` +
        `📌 نحوه کار بسیار ساده است:\n` +
        `۱. هر زمان مالکی قصد بازسازی آشپزخانه داشت، یا لینک بالا را برایش بفرستید و یا در فرم بازدید سایت، شماره موبایل شما (${contact.phone || ''}) را به عنوان معرف وارد کند.\n` +
        `۲. به مشتری شما ۲ میلیون تومان تخفیف مستقیم داده می‌شود.\n` +
        `۳. معادل ${commissionPct}٪ مبلغ قرارداد (حدود ۳.۵ میلیون تومان در هر پروژه) پورسانت نقدی به شما تعلق می‌گیرد و وضعیت آن را در پنل مشاورین (${baseUrl}/panel.html?role=agent) می‌بینید.\n\n` +
        `🖼 مشاهده نمونه‌کارهای واقعی قبل و بعد:\n${baseUrl}/changes.html\n\n` +
        `اگر الان فایل یا موردی در نظر دارید بفرمایید تا مدیریت مستقیماً با شما هماهنگ کند.`,
      isSerious: true,
      seriousReason: 'اعلام تمایل به همکاری و دریافت لینک اختصاصی',
      isOptOut: false,
      autoRegisterAgent: true,
    };
  }

  // 8. Short Greeting / "Who is this?" / Basic acknowledgment
  const greetingPatterns = ['سلام', 'درود', 'وقت بخیر', 'خسته نباشید', 'بفرمایید', 'شما؟', 'شما', 'بله؟', 'جانم'];
  if (rawLen <= 28 && greetingPatterns.some((kw) => text.includes(kw))) {
    return {
      category: 'greeting',
      replyText:
        `سلام و ارادت ${name} 🌹\n` +
        `از مجموعه «نوکابین» (بازسازی تخصصی کابینت بدون تعویض در ۱۵ روز) در خدمتتون هستیم.\n` +
        `با معرفی مالکانی که قصد نوسازی آشپزخانه با ۱/۱۰ هزینه تعویض را دارند، ۲ میلیون تخفیف به مشتری شما و ${commissionPct}٪ پورسانت نقدی (~۳.۵ میلیون تومان) به شما تقدیم می‌شود.\n\n` +
        `🖼 مشاهده نمونه‌کارهای قبل و بعد:\n${baseUrl}/changes.html\n` +
        `🔗 لینک دعوت اختصاصی شما:\n${refLink}`,
      isSerious: false,
      seriousReason: '',
      isOptOut: false,
      autoRegisterAgent: false,
    };
  }

  // 9. Unclassified / Detailed question -> escalate as Serious so admin can jump in cleanly
  return {
    category: 'escalated_custom',
    replyText:
      `ممنون از پیام شما ${name} 🙏\n` +
      `پیام شما را برای مدیر همکاری با مشاورین املاک نوکابین فوروارد کردم تا دقیق راهنمایی‌تان کنند.\n` +
      `در این فاصله می‌توانید نمونه‌کارهای واقعی قبل و بعد را در ${baseUrl}/changes.html مشاهده فرمایید.`,
    isSerious: true,
    seriousReason: 'سوال یا پیام اختصاصی نیازمند پاسخ مستقیم مدیریت',
    isOptOut: false,
    autoRegisterAgent: false,
  };
}

function renderCampaignTemplate(templateStr, contact = {}) {
  const cleanName = (contact.full_name || '').trim();
  const displayName = cleanName ? cleanName : 'مشاور محترم املاک';
  const displayAgency = (contact.agency_name || '').trim() || 'دفتر املاک شما';
  const displayDistrict = (contact.district || '').trim() || 'تهران';
  const refLink = buildReferralLink(contact.phone || '');

  return String(templateStr || '')
    .replace(/\{\{\s*name\s*\}\}/gi, displayName)
    .replace(/\{\{\s*agency\s*\}\}/gi, displayAgency)
    .replace(/\{\{\s*district\s*\}\}/gi, displayDistrict)
    .replace(/\{\{\s*phone\s*\}\}/gi, contact.phone || '')
    .replace(/\{\{\s*link\s*\}\}/gi, refLink);
}

module.exports = {
  normalizePersianText,
  buildReferralLink,
  evaluateAgentReply,
  renderCampaignTemplate,
};
