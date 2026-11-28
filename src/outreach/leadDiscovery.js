const { GoogleGenAI } = require('@google/genai');
const config = require('../config');
const { db } = require('../db');

/**
 * Northern Tehran neighborhoods (above Enghelab St: Districts 1 to 8)
 * with Divar slugs and Persian search names.
 */
const NORTH_TEHRAN_DISTRICTS = {
  '1': {
    label: 'منطقه 1',
    title: 'منطقه ۱ (شمیرانات، نیاوران، فرمانیه، زعفرانیه، ولنجک، قیطریه)',
    neighborhoods: [
      { name: 'نیاوران', divarSlug: 'niavaran' },
      { name: 'فرمانیه', divarSlug: 'farmanieh' },
      { name: 'قیطریه', divarSlug: 'qeytarieh' },
      { name: 'زعفرانیه', divarSlug: 'zafaranieh' },
      { name: 'ولنجک', divarSlug: 'velenjak' },
      { name: 'کامرانیه', divarSlug: 'kamranieh' },
      { name: 'الهیه', divarSlug: 'elahiyeh' },
      { name: 'اقدسیه', divarSlug: 'aqdasiyeh' },
      { name: 'تجریش', divarSlug: 'tajrish' },
      { name: 'ازگل', divarSlug: 'ozgol' },
    ],
  },
  '2': {
    label: 'منطقه 2',
    title: 'منطقه ۲ (سعادت‌آباد، شهرک غرب، مرزداران، گیشا، پونک)',
    neighborhoods: [
      { name: 'سعادت‌آباد', divarSlug: 'saadat-abad' },
      { name: 'شهرک غرب', divarSlug: 'shahrak-gharb' },
      { name: 'مرزداران', divarSlug: 'marzdaran' },
      { name: 'گیشا', divarSlug: 'gisha' },
      { name: 'پونک', divarSlug: 'punak' },
      { name: 'ستارخان', divarSlug: 'sattarkhan' },
      { name: 'صادقیه', divarSlug: 'sadeghiyeh' },
    ],
  },
  '3': {
    label: 'منطقه 3',
    title: 'منطقه ۳ (پاسداران، دروس، جردن، میرداماد، ظفر، ونک، قلهک)',
    neighborhoods: [
      { name: 'پاسداران', divarSlug: 'pasdaran' },
      { name: 'دروس', divarSlug: 'darrous' },
      { name: 'جردن', divarSlug: 'jordan' },
      { name: 'میرداماد', divarSlug: 'mirdamad' },
      { name: 'ظفر', divarSlug: 'zafar' },
      { name: 'ونک', divarSlug: 'vanak' },
      { name: 'قلهک', divarSlug: 'qolhak' },
      { name: 'دولت', divarSlug: 'dolat' },
    ],
  },
  '4': {
    label: 'منطقه 4',
    title: 'منطقه ۴ (تهرانپارس، هروی، بنی‌هاشم، شمس‌آباد، مجیدیه شمالی)',
    neighborhoods: [
      { name: 'تهرانپارس غربی', divarSlug: 'west-tehranpars' },
      { name: 'تهرانپارس شرقی', divarSlug: 'east-tehranpars' },
      { name: 'هروی', divarSlug: 'heravi' },
      { name: 'شمس‌آباد', divarSlug: 'shams-abad' },
      { name: 'مجیدیه', divarSlug: 'majidiyeh' },
      { name: 'لویزان', divarSlug: 'lavizan' },
    ],
  },
  '5': {
    label: 'منطقه 5',
    title: 'منطقه ۵ (فردوس، جنت‌آباد، آیت‌الله کاشانی، شهران، باغ فیض)',
    neighborhoods: [
      { name: 'بلوار فردوس', divarSlug: 'ferdows' },
      { name: 'جنت‌آباد مرکزی', divarSlug: 'central-jannat-abad' },
      { name: 'جنت‌آباد شمالی', divarSlug: 'north-jannat-abad' },
      { name: 'جنت‌آباد جنوبی', divarSlug: 'south-jannat-abad' },
      { name: 'باغ فیض', divarSlug: 'bagh-feyz' },
      { name: 'شهران', divarSlug: 'shahran' },
    ],
  },
  '6': {
    label: 'منطقه 6',
    title: 'منطقه ۶ بالای انقلاب (یوسف‌آباد، امیرآباد، فاطمی، ولیعصر، مطهری)',
    neighborhoods: [
      { name: 'یوسف‌آباد', divarSlug: 'yusef-abad' },
      { name: 'امیرآباد', divarSlug: 'amir-abad' },
      { name: 'فاطمی', divarSlug: 'fatemi' },
      { name: 'کریمخان', divarSlug: 'karimkhan' },
      { name: 'توانیر', divarSlug: 'tavanir' },
    ],
  },
  '7': {
    label: 'منطقه 7',
    title: 'منطقه ۷ بالای انقلاب (سهروردی شمالی، عباس‌آباد، آپادانا، نیلوفر)',
    neighborhoods: [
      { name: 'سهروردی شمالی', divarSlug: 'north-sohrevardi' },
      { name: 'نیلوفر', divarSlug: 'niloufar' },
      { name: 'عباس‌آباد', divarSlug: 'abbas-abad' },
      { name: 'حشمتیه', divarSlug: 'heshmatiyeh' },
    ],
  },
  '8': {
    label: 'منطقه 8',
    title: 'شمال منطقه ۸ (نارمک، هفت‌حوض، رسالت، فدک)',
    neighborhoods: [
      { name: 'نارمک', divarSlug: 'narmak' },
      { name: 'تهرانپارس جنوبی', divarSlug: 'tehranpars' },
      { name: 'فدک', divarSlug: 'fadak' },
    ],
  },
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function toAsciiDigits(str) {
  if (!str) return '';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return String(str)
    .replace(/[۰-۹]/g, (d) => String(persian.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(arabic.indexOf(d)));
}

/**
 * Extracts all valid Iranian mobile numbers (09xxxxxxxxx) from arbitrary text or HTML.
 */
function extractIranMobilesFromText(rawText) {
  const ascii = toAsciiDigits(rawText || '');
  const matches = new Set();
  // Match +989..., 00989..., 989..., 09... even with spaces or dashes between segments
  const regex = /(?:\+98|0098|98|0)?9\d{2}[\s\-._]{0,2}\d{3}[\s\-._]{0,2}\d{4}/g;
  let m;
  while ((m = regex.exec(ascii)) !== null) {
    const norm = config.normalizePhone(m[0].replace(/[._]/g, ''));
    if (config.isValidIranMobile(norm) && norm !== config.ADMIN_PHONE) {
      matches.add(norm);
    }
  }
  return Array.from(matches);
}

/**
 * Extracts Tehran landlines (021xxxxxxxx) from text.
 */
function extractTehranLandlines(rawText) {
  const ascii = toAsciiDigits(rawText || '');
  const matches = new Set();
  const regex = /(?:021[\s\-]?)[2-8]\d{7}/g;
  let m;
  while ((m = regex.exec(ascii)) !== null) {
    matches.add(m[0].replace(/\D/g, ''));
  }
  return Array.from(matches);
}

function stripHtmlToReadableText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|br|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Detects which northern Tehran district (1..8) a piece of text belongs to based on neighborhood names.
 */
function inferDistrictFromText(text, fallbackDistrict = 'منطقه 1') {
  const t = String(text || '');
  for (const [dKey, dObj] of Object.entries(NORTH_TEHRAN_DISTRICTS)) {
    for (const nb of dObj.neighborhoods) {
      if (t.includes(nb.name)) {
        return { district: dObj.label, neighborhood: nb.name };
      }
    }
  }
  const explicitMatch = toAsciiDigits(t).match(/منطقه\s*([1-8])\b/);
  if (explicitMatch) {
    return { district: `منطقه ${explicitMatch[1]}`, neighborhood: '' };
  }
  return { district: fallbackDistrict, neighborhood: '' };
}

/**
 * Parses unstructured text/HTML and extracts real estate agents & agencies around phone numbers or agent labels.
 */
function heuristicExtractLeadsFromText(rawText, { source = 'web', defaultDistrict = 'منطقه 1', defaultNeighborhood = '', sourceUrl = '' } = {}) {
  const cleanText = stripHtmlToReadableText(rawText);
  const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const mobiles = extractIranMobilesFromText(currentLine);

    if (mobiles.length > 0) {
      const nearContext = [lines[i - 1] || '', lines[i + 1] || ''].join(' | ');
      let agencyName = '';
      let fullName = '';

      const agencyRx = /(?:آژانس\s+املاک|مشاورین\s+املاک|دفتر\s+املاک|دپارتمان\s+املاک|مسکن\s+بزرگ|املاک\s+بزرگ|املاک|مسکن)\s+([\u0600-\u06FFa-zA-Z0-9\s]{2,26})/;
      const agencyMatch = currentLine.match(agencyRx) || nearContext.match(agencyRx);
      if (agencyMatch) {
        agencyName = `املاک ${agencyMatch[1].trim().split(/[|،,\-\n(]/)[0].trim()}`
          .replace(/^املاک\s+(املاک|مسکن)/, '$1')
          .slice(0, 40);
      }

      const agentRx = /(?:مشاور(?:\s+شما|\s+تخصصی|\s+ملکی)?|مهندس|کارشناس(?:\s+فروش)?|مدیریت)\s*[:\-]?\s*([\u0600-\u06FF\s]{3,28})/;
      const agentMatch = currentLine.match(agentRx) || nearContext.match(agentRx);
      if (agentMatch) {
        const cand = agentMatch[1].trim().split(/[|،,\-\n0-9۰-۹(]/)[0].trim();
        if (cand && !/املاک|مسکن|منطقه|تهران|فروش|آپارتمان/.test(cand)) {
          fullName = cand.slice(0, 35);
        }
      }

      const lineLoc = inferDistrictFromText(currentLine, '');
      const loc = lineLoc.neighborhood ? lineLoc : inferDistrictFromText(nearContext, defaultDistrict);
      const landlines = extractTehranLandlines(currentLine).length
        ? extractTehranLandlines(currentLine)
        : extractTehranLandlines(nearContext);

      for (const phone of mobiles) {
        results.push({
          source,
          phone,
          landline: landlines[0] || '',
          fullName,
          agencyName,
          district: loc.district || defaultDistrict,
          neighborhood: loc.neighborhood || defaultNeighborhood,
          listingTitle: currentLine.slice(0, 90),
          listingUrl: sourceUrl,
        });
      }
    }
  }

  return results;
}

/**
 * Optional Gemini AI structured extractor when GEMINI_API_KEY is available.
 * Enhances accuracy on messy web articles, Divar descriptions, or pasted directories.
 */
async function aiExtractLeadsIfConfigured(textChunk, defaultDistrict = 'منطقه 1') {
  const key = process.env.GEMINI_API_KEY || config.GEMINI_API_KEY;
  if (!key || !textChunk || textChunk.length < 30) return [];

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const prompt = `از متن فارسی زیر، تمام مشاورین املاک و دفاتر املاک تهران را استخراج کن و فقط یک آرایه JSON معتبر برگردان.
هر آیتم باید دقیقاً این کلیدها را داشته باشد:
[
  {
    "fullName": "نام و نام خانوادگی مشاور (اگر مشخص نبود رشته خالی)",
    "agencyName": "نام دفتر یا آژانس املاک",
    "phone": "شماره موبایل ۱۱ رقمی با شروع 09 یا رشته خالی",
    "landline": "شماره ثابت با 021 یا رشته خالی",
    "district": "منطقه 1 تا منطقه 8 بر اساس محله (پیش‌فرض: ${defaultDistrict})",
    "neighborhood": "نام محله"
  }
]
متن:
${textChunk.slice(0, 12000)}`;

    const response = await Promise.race([
      ai.models.generateContent({
        model: config.GEMINI_VISION_MODEL || 'gemini-2.5-flash',
        contents: prompt,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('ai_timeout')), 12000)),
    ]);

    const raw = String(response?.text || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];

    return arr.map((item) => ({
      source: 'ai_text',
      phone: config.isValidIranMobile(item.phone) ? config.normalizePhone(item.phone) : '',
      landline: String(item.landline || '').replace(/\D/g, ''),
      fullName: String(item.fullName || '').trim(),
      agencyName: String(item.agencyName || '').trim(),
      district: String(item.district || defaultDistrict).trim(),
      neighborhood: String(item.neighborhood || '').trim(),
      listingTitle: '',
      listingUrl: '',
    }));
  } catch {
    return [];
  }
}

async function fetchTextSafe(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      return { ok: false, status: res.status, text: '' };
    }
    const text = await res.text();
    return { ok: true, status: res.status, text };
  } catch (err) {
    return { ok: false, status: 0, text: '', error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

class LeadDiscoveryEngine {
  constructor() {
    this.activeJobId = null;
    this.stopRequested = false;
  }

  getDistrictCatalog() {
    return Object.entries(NORTH_TEHRAN_DISTRICTS).map(([id, d]) => ({
      id,
      label: d.label,
      title: d.title,
      neighborhoods: d.neighborhoods.map((n) => n.name),
    }));
  }

  /**
   * Saves or merges a discovered lead into SQLite `discovered_leads` without duplicates,
   * and optionally auto-queues mobile leads into `outreach_contacts`.
   */
  upsertDiscoveredLead(lead, { autoImportToOutreach = true } = {}) {
    const phone = config.isValidIranMobile(lead.phone) ? config.normalizePhone(lead.phone) : '';
    const fullName = String(lead.fullName || '').trim();
    const agencyName = String(lead.agencyName || '').trim();
    const district = String(lead.district || 'منطقه 1').trim();
    const neighborhood = String(lead.neighborhood || '').trim();
    const landline = String(lead.landline || '').trim();

    if (!phone && !fullName && !agencyName) {
      return { saved: false, phoneFound: false, imported: false };
    }

    const dedupKey = phone
      ? `phone:${phone}`
      : `agent:${(fullName || '-').toLowerCase()}|${(agencyName || '-').toLowerCase()}|${district}`;

    const existing = db.prepare('SELECT * FROM discovered_leads WHERE dedup_key = ?').get(dedupKey);
    let leadId;
    let isNew = false;

    if (!existing) {
      const info = db
        .prepare(`
          INSERT INTO discovered_leads (
            dedup_key, source, phone, landline, full_name, agency_name,
            district, neighborhood, listing_title, listing_url, active_ads_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `)
        .run(
          dedupKey,
          lead.source || 'web',
          phone,
          landline,
          fullName,
          agencyName,
          district,
          neighborhood,
          String(lead.listingTitle || '').slice(0, 120),
          String(lead.listingUrl || '').slice(0, 300)
        );
      leadId = info.lastInsertRowid;
      isNew = true;
    } else {
      leadId = existing.id;
      db.prepare(`
        UPDATE discovered_leads
        SET phone = CASE WHEN phone = '' AND ? != '' THEN ? ELSE phone END,
            landline = CASE WHEN landline = '' AND ? != '' THEN ? ELSE landline END,
            full_name = CASE WHEN full_name = '' AND ? != '' THEN ? ELSE full_name END,
            agency_name = CASE WHEN agency_name = '' AND ? != '' THEN ? ELSE agency_name END,
            active_ads_count = active_ads_count + 1,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(phone, phone, landline, landline, fullName, fullName, agencyName, agencyName, leadId);
    }

    let imported = false;
    if (autoImportToOutreach && phone && phone !== config.ADMIN_PHONE) {
      const contactExists = db.prepare('SELECT id FROM outreach_contacts WHERE phone = ?').get(phone);
      if (!contactExists) {
        db.prepare(`
          INSERT INTO outreach_contacts (phone, full_name, agency_name, district, notes)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          phone,
          fullName,
          agencyName,
          district,
          `استخراج خودکار (${lead.source === 'divar' ? 'دیوار' : 'وب'}) - ${neighborhood}`
        );
        imported = true;
      }
      db.prepare('UPDATE discovered_leads SET imported_to_outreach = 1 WHERE id = ?').run(leadId);
    }

    return { saved: isNew, phoneFound: Boolean(phone), imported };
  }

  /**
   * Engine 1: Collects unique active real-estate agents & agencies from public Divar listings
   * in Northern Tehran neighborhoods (without touching auth-gated contact endpoints or CAPTCHAs).
   */
  async crawlDivarNeighborhood(districtId, nb, jobState, autoImport) {
    const dObj = NORTH_TEHRAN_DISTRICTS[districtId];
    const districtLabel = dObj?.label || `منطقه ${districtId}`;

    // Fetch public neighborhood apartment-sell page on Divar
    const listUrl = `https://divar.ir/s/tehran/buy-apartment/${nb.divarSlug}`;
    const pageRes = await fetchTextSafe(listUrl, {}, 12000);
    jobState.pagesScanned++;

    if (!pageRes.ok || !pageRes.text) {
      this._appendJobLog(jobState, `⚠️ عدم پاسخ صفحه عمومی دیوار برای ${nb.name} (کد ${pageRes.status || 'شبکه'})`);
      return;
    }

    // Check if gated by anti-bot challenge -> respect immediately and skip
    if (/captcha|کپچا|ربات نیستم|cf-chl/i.test(pageRes.text)) {
      this._appendJobLog(jobState, `🛑 صفحه ${nb.name} در دیوار دارای بررسی امنیتی بود؛ طبق قوانین امنیتی رد شد.`);
      return;
    }

    // 1. Extract post tokens/links (/v/...) from the public listing HTML
    const postPaths = Array.from(
      new Set(
        (pageRes.text.match(/\/v\/[^"'\s<>]{4,120}/g) || []).map((p) => p.split('?')[0])
      )
    ).slice(0, 14);

    // Also parse any embedded JSON state (PRELOADED_STATE / NEXT_DATA) on the listing page
    const listingPhones = heuristicExtractLeadsFromText(pageRes.text, {
      source: 'divar',
      defaultDistrict: districtLabel,
      defaultNeighborhood: nb.name,
      sourceUrl: listUrl,
    });
    for (const l of listingPhones) {
      this._recordStats(jobState, this.upsertDiscoveredLead(l, { autoImportToOutreach: autoImport }));
    }

    // 2. Inspect up to 14 public post pages per neighborhood to extract unique Agent Name, Agency Name, and public description phones
    for (const relPath of postPaths) {
      if (this.stopRequested) break;
      const postUrl = `https://divar.ir${relPath}`;
      const postRes = await fetchTextSafe(postUrl, {}, 10000);
      jobState.pagesScanned++;

      if (!postRes.ok || !postRes.text) continue;
      if (/captcha|کپچا|ربات نیستم/i.test(postRes.text)) break;

      const parsedPost = this._parseDivarPublicPostHtml(postRes.text, {
        districtLabel,
        neighborhoodName: nb.name,
        postUrl,
      });

      if (parsedPost) {
        this._recordStats(
          jobState,
          this.upsertDiscoveredLead(parsedPost, { autoImportToOutreach: autoImport })
        );
      }

      // Polite human delay between public page reads (700ms)
      await new Promise((r) => setTimeout(r, 700));
    }
  }

  _parseDivarPublicPostHtml(html, { districtLabel, neighborhoodName, postUrl }) {
    const readable = stripHtmlToReadableText(html);

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\|.*$/, '').trim() : '';

    // Extract agency & agent from Divar public post metadata rows (e.g. "آژانس املاک ...", "مشاور ...")
    let agencyName = '';
    let fullName = '';

    const agencyPatterns = [
      /آژانس املاک\s*[:\n\t ]+([^\n|<>]{2,40})/,
      /(?:دپارتمان|مشاورین املاک|دفتر املاک|املاک|مسکن)\s+([\u0600-\u06FF0-9\s]{2,32})/,
    ];
    for (const rx of agencyPatterns) {
      const m = readable.match(rx);
      if (m && m[1]) {
        const val = m[1].trim().split(/\n|\||،/)[0].trim();
        if (val && val.length <= 36 && !/دیوار|تهران|آپارتمان|فروش/.test(val)) {
          agencyName = val.startsWith('املاک') || val.startsWith('مسکن') ? val : `املاک ${val}`;
          break;
        }
      }
    }

    const agentPatterns = [
      /مشاور(?:\s+املاک)?\s*[:\n\t ]+([\u0600-\u06FF\s]{3,30})/,
      /(?:کارشناس(?:\s+تخصصی|\s+فروش)?|مشاور\s+شما|مهندس)\s*[:\-]?\s*([\u0600-\u06FF\s]{3,28})/,
    ];
    for (const rx of agentPatterns) {
      const m = readable.match(rx);
      if (m && m[1]) {
        const val = m[1].trim().split(/\n|\||،|09|۰۹/)[0].trim();
        if (val && val.length >= 3 && val.length <= 32 && !/املاک|مسکن|دیوار|گزارش|آگهی|تومان/.test(val)) {
          fullName = val;
          break;
        }
      }
    }

    // Check if agent wrote their mobile phone inside the public post description
    const mobiles = extractIranMobilesFromText(readable);
    const landlines = extractTehranLandlines(readable);

    if (!fullName && !agencyName && mobiles.length === 0) {
      return null;
    }

    return {
      source: 'divar',
      phone: mobiles[0] || '',
      landline: landlines[0] || '',
      fullName,
      agencyName,
      district: districtLabel,
      neighborhood: neighborhoodName,
      listingTitle: title,
      listingUrl: postUrl,
    };
  }

  /**
   * Engine 2: Crawls open web search results & public Tehran real estate directories
   * for mobile numbers (09...), agent names, and agency names in Northern Tehran neighborhoods.
   */
  async crawlPublicWebNeighborhood(districtId, nb, jobState, autoImport) {
    const dObj = NORTH_TEHRAN_DISTRICTS[districtId];
    const districtLabel = dObj?.label || `منطقه ${districtId}`;

    const queries = [
      `مشاور املاک ${nb.name} تهران 0912`,
      `آژانس املاک ${nb.name} شماره تماس همراه 0912`,
      `کارشناس فروش ملک ${nb.name} 0912`,
    ];

    const discoveredUrls = new Set();

    // 1. Search DuckDuckGo HTML / Bing HTML (public, no CAPTCHA) for snippets + target directory URLs
    for (const q of queries) {
      if (this.stopRequested) break;

      const searchEndpoints = [
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
        `https://www.bing.com/search?q=${encodeURIComponent(q)}&count=20`,
      ];

      for (const sUrl of searchEndpoints) {
        const sRes = await fetchTextSafe(sUrl, {}, 10000);
        if (!sRes.ok || !sRes.text) continue;
        jobState.pagesScanned++;

        // Extract leads directly from search snippets!
        const snippetLeads = heuristicExtractLeadsFromText(sRes.text, {
          source: 'web',
          defaultDistrict: districtLabel,
          defaultNeighborhood: nb.name,
          sourceUrl: sUrl,
        });
        for (const lead of snippetLeads) {
          this._recordStats(
            jobState,
            this.upsertDiscoveredLead(lead, { autoImportToOutreach: autoImport })
          );
        }

        // Collect public real-estate directory/blog links from search results
        const hrefMatches = sRes.text.match(/https?:\/\/[^"'\s<>]+/g) || [];
        for (const rawHref of hrefMatches) {
          let cleanHref = rawHref;
          try {
            if (cleanHref.includes('uddg=')) {
              const u = new URL(cleanHref);
              cleanHref = decodeURIComponent(u.searchParams.get('uddg') || '');
            }
            const parsed = new URL(cleanHref);
            if (
              !/duckduckgo|bing\.com|microsoft|google|facebook|youtube|aparat|divar\.ir/i.test(parsed.hostname)
            ) {
              discoveredUrls.add(cleanHref);
            }
          } catch {}
        }

        if (snippetLeads.length > 0) break;
      }

      await new Promise((r) => setTimeout(r, 600));
    }

    // Also include direct public directory pages for this district/neighborhood
    discoveredUrls.add(`https://mrestate.ir/r/landing/district${districtId}`);
    discoveredUrls.add(
      `https://www.2nabsh.com/%D8%A7%D9%85%D9%84%D8%A7%DA%A9-%D8%AA%D9%87%D8%B1%D8%A7%D9%86/%D9%85%D8%B4%D8%A7%D9%88%D8%B1%DB%8C%D9%86-%D8%A7%D9%85%D9%84%D8%A7%DA%A9/${encodeURIComponent(nb.name)}`
    );

    // 2. Visit up to 8 discovered public directory pages and extract phones + names via Heuristic + AI
    const targetUrls = Array.from(discoveredUrls).slice(0, 8);
    for (const targetUrl of targetUrls) {
      if (this.stopRequested) break;
      const res = await fetchTextSafe(targetUrl, {}, 10000);
      if (!res.ok || !res.text) continue;
      jobState.pagesScanned++;

      const heurLeads = heuristicExtractLeadsFromText(res.text, {
        source: 'web',
        defaultDistrict: districtLabel,
        defaultNeighborhood: nb.name,
        sourceUrl: targetUrl,
      });

      for (const lead of heurLeads) {
        this._recordStats(
          jobState,
          this.upsertDiscoveredLead(lead, { autoImportToOutreach: autoImport })
        );
      }

      // If page contains Iranian mobiles and Gemini API key is configured, run AI structured extraction too
      if (heurLeads.length > 0 && (process.env.GEMINI_API_KEY || config.GEMINI_API_KEY)) {
        const aiLeads = await aiExtractLeadsIfConfigured(stripHtmlToReadableText(res.text), districtLabel);
        for (const aiLead of aiLeads) {
          aiLead.source = 'web';
          aiLead.listingUrl = targetUrl;
          if (!aiLead.neighborhood) aiLead.neighborhood = nb.name;
          this._recordStats(
            jobState,
            this.upsertDiscoveredLead(aiLead, { autoImportToOutreach: autoImport })
          );
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    }
  }

  _recordStats(jobState, upsertRes) {
    if (upsertRes.saved) jobState.leadsFound++;
    if (upsertRes.saved && upsertRes.phoneFound) jobState.phonesFound++;
    if (upsertRes.imported) jobState.importedCount++;
  }

  _appendJobLog(jobState, line) {
    const stamped = `${new Date().toISOString().slice(11, 19)} ${line}`;
    jobState.logs.push(stamped);
    if (jobState.logs.length > 40) jobState.logs.shift();
    this._persistJob(jobState);
  }

  _persistJob(jobState) {
    db.prepare(`
      UPDATE lead_discovery_jobs
      SET status = ?,
          progress_label = ?,
          pages_scanned = ?,
          leads_found = ?,
          phones_found = ?,
          imported_count = ?,
          log_json = ?,
          error_message = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      jobState.status,
      jobState.progressLabel,
      jobState.pagesScanned,
      jobState.leadsFound,
      jobState.phonesFound,
      jobState.importedCount,
      JSON.stringify(jobState.logs),
      jobState.errorMessage || '',
      jobState.id
    );
  }

  /**
   * Starts a background automated discovery job across selected Northern Tehran districts (1..8).
   */
  startDiscoveryJob({ mode = 'both', districts = ['1', '2', '3'], autoImportToOutreach = true } = {}) {
    if (this.activeJobId) {
      const running = db.prepare('SELECT * FROM lead_discovery_jobs WHERE id = ?').get(this.activeJobId);
      if (running && running.status === 'running') {
        throw new Error('یک عملیات استخراج خودکار هم‌اکنون در حال اجراست.');
      }
    }

    const validDistricts = (Array.isArray(districts) ? districts : ['1', '2', '3'])
      .map((d) => String(d).trim())
      .filter((d) => Boolean(NORTH_TEHRAN_DISTRICTS[d]));

    if (validDistricts.length === 0) {
      throw new Error('لطفاً حداقل یکی از مناطق شمال تهران (۱ تا ۸) را انتخاب کنید.');
    }

    const cleanMode = ['both', 'divar', 'web'].includes(mode) ? mode : 'both';

    const info = db
      .prepare(`
        INSERT INTO lead_discovery_jobs (mode, districts_json, status, progress_label)
        VALUES (?, ?, 'running', 'شروع عملیات استخراج خودکار...')
      `)
      .run(cleanMode, JSON.stringify(validDistricts));

    const jobState = {
      id: Number(info.lastInsertRowid),
      mode: cleanMode,
      districts: validDistricts,
      status: 'running',
      progressLabel: 'در حال آماده‌سازی لیست محله‌های بالای خیابان انقلاب...',
      pagesScanned: 0,
      leadsFound: 0,
      phonesFound: 0,
      importedCount: 0,
      logs: [],
      errorMessage: '',
    };

    this.activeJobId = jobState.id;
    this.stopRequested = false;

    this._runJobAsync(jobState, autoImportToOutreach).catch((err) => {
      jobState.status = 'failed';
      jobState.errorMessage = err.message || 'خطای غیرمنتظره در عملیات استخراج';
      this._appendJobLog(jobState, `❌ خطا: ${jobState.errorMessage}`);
      this.activeJobId = null;
    });

    return this.getJobSummary(jobState.id);
  }

  async _runJobAsync(jobState, autoImport) {
    this._appendJobLog(
      jobState,
      `🚀 شروع استخراج هوشمند برای مناطق: ${jobState.districts.join('، ')} (حالت: ${jobState.mode})`
    );

    for (const dId of jobState.districts) {
      if (this.stopRequested) break;
      const dObj = NORTH_TEHRAN_DISTRICTS[dId];
      if (!dObj) continue;

      for (const nb of dObj.neighborhoods) {
        if (this.stopRequested) break;

        if (jobState.mode === 'both' || jobState.mode === 'web') {
          jobState.progressLabel = `🌐 جستجوی شماره‌های عمومی وب: ${dObj.label} — ${nb.name}...`;
          this._persistJob(jobState);
          await this.crawlPublicWebNeighborhood(dId, nb, jobState, autoImport);
          this._appendJobLog(
            jobState,
            `✅ وب عمومی (${nb.name}): مجموع فعلی ${jobState.leadsFound} مشاور (${jobState.phonesFound} شماره‌دار)`
          );
        }

        if (this.stopRequested) break;

        if (jobState.mode === 'both' || jobState.mode === 'divar') {
          jobState.progressLabel = `🏠 پایش مشاورین یکتای دیوار: ${dObj.label} — ${nb.name}...`;
          this._persistJob(jobState);
          await this.crawlDivarNeighborhood(dId, nb, jobState, autoImport);
          this._appendJobLog(
            jobState,
            `✅ دیوار (${nb.name}): مجموع فعلی ${jobState.leadsFound} مشاور یکتا (${jobState.phonesFound} شماره‌دار)`
          );
        }
      }
    }

    if (this.stopRequested) {
      jobState.status = 'stopped';
      jobState.progressLabel = 'متوقف‌شده توسط مدیر';
      this._appendJobLog(jobState, '⏹ عملیات استخراج توسط مدیر متوقف شد.');
    } else {
      jobState.status = 'completed';
      jobState.progressLabel = `تکمیل شد — ${jobState.leadsFound} مشاور یکتا (${jobState.phonesFound} شماره همراه)`;
      this._appendJobLog(jobState, `🎉 استخراج تمام محله‌های انتخابی با موفقیت به پایان رسید.`);
    }

    this._persistJob(jobState);
    this.activeJobId = null;
  }

  stopActiveJob() {
    this.stopRequested = true;
    return { ok: true };
  }

  /**
   * Parses any raw pasted text/HTML (e.g. copied from websites, Telegram channels, or directories)
   * using Heuristic + Gemini AI and saves discovered agents.
   */
  async parseCustomTextWithAI(rawText, { defaultDistrict = 'منطقه 1', autoImportToOutreach = true } = {}) {
    const heurLeads = heuristicExtractLeadsFromText(rawText, {
      source: 'ai_text',
      defaultDistrict,
    });

    const aiLeads = await aiExtractLeadsIfConfigured(rawText, defaultDistrict);
    const combined = [...aiLeads, ...heurLeads];

    let saved = 0;
    let phones = 0;
    let imported = 0;

    for (const item of combined) {
      const r = this.upsertDiscoveredLead(item, { autoImportToOutreach });
      if (r.saved) saved++;
      if (r.saved && r.phoneFound) phones++;
      if (r.imported) imported++;
    }

    return {
      ok: true,
      saved,
      phones,
      imported,
      totalCandidates: combined.length,
    };
  }

  getJobSummary(jobId) {
    const row = jobId
      ? db.prepare('SELECT * FROM lead_discovery_jobs WHERE id = ?').get(jobId)
      : db.prepare('SELECT * FROM lead_discovery_jobs ORDER BY id DESC LIMIT 1').get();
    if (!row) return null;
    let logs = [];
    let districts = [];
    try {
      logs = JSON.parse(row.log_json || '[]');
    } catch {}
    try {
      districts = JSON.parse(row.districts_json || '[]');
    } catch {}
    return {
      ...row,
      districts,
      logs,
    };
  }

  getDiscoveryOverview({ filter = 'all', district = '', search = '', limit = 150 } = {}) {
    const conditions = [];
    const params = [];

    if (filter === 'with_phone') {
      conditions.push("phone != ''");
    } else if (filter === 'divar_unique') {
      conditions.push("source = 'divar'");
    } else if (filter === 'web_phones') {
      conditions.push("source = 'web' AND phone != ''");
    } else if (filter === 'without_phone') {
      conditions.push("phone = ''");
    }

    if (district) {
      conditions.push('district = ?');
      params.push(district);
    }

    if (search) {
      const q = `%${search}%`;
      conditions.push('(phone LIKE ? OR full_name LIKE ? OR agency_name LIKE ? OR neighborhood LIKE ?)');
      params.push(q, q, q, q);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const leads = db
      .prepare(`
        SELECT * FROM discovered_leads
        ${where}
        ORDER BY (CASE WHEN phone != '' THEN 0 ELSE 1 END), active_ads_count DESC, id DESC
        LIMIT ?
      `)
      .all(...params, Math.min(300, Math.max(20, Number(limit) || 150)));

    const stats = db
      .prepare(`
        SELECT
          COUNT(*) AS total_leads,
          SUM(CASE WHEN phone != '' THEN 1 ELSE 0 END) AS with_mobile,
          SUM(CASE WHEN source = 'divar' THEN 1 ELSE 0 END) AS divar_agents,
          SUM(CASE WHEN source = 'web' THEN 1 ELSE 0 END) AS web_leads,
          SUM(CASE WHEN imported_to_outreach = 1 THEN 1 ELSE 0 END) AS imported_count
        FROM discovered_leads
      `)
      .get();

    return {
      ok: true,
      districtsCatalog: this.getDistrictCatalog(),
      latestJob: this.getJobSummary(this.activeJobId),
      stats: {
        totalLeads: Number(stats?.total_leads || 0),
        withMobile: Number(stats?.with_mobile || 0),
        divarAgents: Number(stats?.divar_agents || 0),
        webLeads: Number(stats?.web_leads || 0),
        importedCount: Number(stats?.imported_count || 0),
      },
      leads,
    };
  }

  importAllMobileLeadsToOutreach() {
    const rows = db
      .prepare("SELECT * FROM discovered_leads WHERE phone != '' AND imported_to_outreach = 0")
      .all();

    let imported = 0;
    for (const r of rows) {
      const exists = db.prepare('SELECT id FROM outreach_contacts WHERE phone = ?').get(r.phone);
      if (!exists && r.phone !== config.ADMIN_PHONE) {
        db.prepare(`
          INSERT INTO outreach_contacts (phone, full_name, agency_name, district, notes)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          r.phone,
          r.full_name || '',
          r.agency_name || '',
          r.district || 'منطقه 1',
          `استخراج خودکار (${r.source === 'divar' ? 'دیوار' : 'وب'}) - ${r.neighborhood || ''}`
        );
        imported++;
      }
      db.prepare('UPDATE discovered_leads SET imported_to_outreach = 1 WHERE id = ?').run(r.id);
    }
    return { ok: true, imported };
  }
}

const leadDiscoveryEngine = new LeadDiscoveryEngine();

module.exports = {
  leadDiscoveryEngine,
  NORTH_TEHRAN_DISTRICTS,
  extractIranMobilesFromText,
  heuristicExtractLeadsFromText,
};
