const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { chromium } = require('playwright-core');
const config = require('../config');
const { getSetting } = require('../db');

const BALE_PROFILE_DIR = path.join(config.DATA_DIR, 'bale_profile');
const BALE_URL = 'https://web.bale.ai';

function detectChromiumExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

class BaleWebClient extends EventEmitter {
  constructor() {
    super();
    this.context = null;
    this.page = null;
    this.status = 'disconnected'; // disconnected | launching | login_required | otp_required | connected | error
    this.lastScreenshotDataUrl = '';
    this.lastError = '';
    this.currentUrl = '';
    this.pollTimer = null;
    this.busy = false;
    this.lastObservedTexts = new Map(); // phone -> last seen inbound text
  }

  getState() {
    return {
      status: this.status,
      lastScreenshotDataUrl: this.lastScreenshotDataUrl,
      lastError: this.lastError,
      currentUrl: this.currentUrl,
      proxyUrl: getSetting('outreach_bale_proxy_url', ''),
    };
  }

  async start() {
    if (this.context && this.page && !this.page.isClosed()) {
      await this.refreshStatusAndScreenshot();
      return this.getState();
    }

    try {
      this.status = 'launching';
      this.lastError = '';
      fs.mkdirSync(BALE_PROFILE_DIR, { recursive: true });

      // Remove stale SingletonLock if container restarted uncleanly
      for (const lockName of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
        const lockPath = path.join(BALE_PROFILE_DIR, lockName);
        try {
          if (fs.existsSync(lockPath)) fs.rmSync(lockPath, { force: true });
        } catch {}
      }

      const executablePath = detectChromiumExecutable();
      const proxyUrl = String(getSetting('outreach_bale_proxy_url', '') || '').trim();

      const launchOpts = {
        headless: true,
        executablePath,
        viewport: { width: 1280, height: 820 },
        locale: 'fa-IR',
        timezoneId: 'Asia/Tehran',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--font-render-hinting=none',
        ],
      };

      if (proxyUrl) {
        launchOpts.proxy = { server: proxyUrl };
      }

      this.context = await chromium.launchPersistentContext(BALE_PROFILE_DIR, launchOpts);
      const pages = this.context.pages();
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

      await this.page.goto(BALE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.page.waitForTimeout(3500);
      await this.refreshStatusAndScreenshot();

      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => {
        this.pollActiveCycle().catch(() => {});
      }, 15000);
    } catch (err) {
      this.status = 'error';
      this.lastError = err.message || 'خطا در اجرای مرورگر بله وب';
      console.error('[BaleWeb] Start error:', err);
    }

    return this.getState();
  }

  async stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.context) {
      try {
        await this.context.close();
      } catch {}
      this.context = null;
      this.page = null;
    }
    this.status = 'disconnected';
    return this.getState();
  }

  async logout() {
    await this.stop();
    try {
      if (fs.existsSync(BALE_PROFILE_DIR)) {
        fs.rmSync(BALE_PROFILE_DIR, { recursive: true, force: true });
      }
    } catch {}
    this.lastScreenshotDataUrl = '';
    this.lastError = '';
    return this.getState();
  }

  async refreshStatusAndScreenshot() {
    if (!this.page || this.page.isClosed()) {
      this.status = 'disconnected';
      return this.getState();
    }

    try {
      this.currentUrl = this.page.url();

      const domState = await this.page.evaluate(() => {
        const bodyText = (document.body?.innerText || '').slice(0, 3000);
        const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'));
        const hasEditableComposer = inputs.some(
          (el) =>
            el.getAttribute('contenteditable') === 'true' ||
            (el.tagName === 'TEXTAREA' && !el.disabled)
        );
        const hasSearchOrChatList =
          Boolean(document.querySelector('[role="listitem"], [class*="chat"], [class*="Chat"], [class*="dialog"], [class*="contact"]')) ||
          bodyText.includes('پیام‌های ذخیره') ||
          bodyText.includes('مخاطبین') ||
          bodyText.includes('جستجو');

        const hasPhoneInput = inputs.some((el) => {
          const ph = (el.getAttribute('placeholder') || '') + ' ' + (el.getAttribute('type') || '') + ' ' + (el.getAttribute('name') || '');
          return /tel|phone|شماره|موبایل|98/i.test(ph);
        }) || /شماره تلفن|شماره همراه|ورود به بله|کد کشور/i.test(bodyText);

        const hasOtpInput =
          /کد تایید|کد تأیید|کد ارسال|کد ۵ رقمی|کد 5 رقمی|کد ۶ رقمی|کد ورود/i.test(bodyText) &&
          inputs.length > 0;

        return {
          hasEditableComposer,
          hasSearchOrChatList,
          hasPhoneInput,
          hasOtpInput,
        };
      });

      if (domState.hasOtpInput) {
        this.status = 'otp_required';
      } else if (domState.hasPhoneInput && !domState.hasSearchOrChatList) {
        this.status = 'login_required';
      } else if (domState.hasSearchOrChatList || domState.hasEditableComposer) {
        this.status = 'connected';
      } else {
        this.status = 'login_required';
      }

      const buf = await this.page.screenshot({ type: 'jpeg', quality: 68 });
      this.lastScreenshotDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch (err) {
      this.lastError = err.message;
    }

    return this.getState();
  }

  /**
   * Attempts to select Iran (+98) if Bale Web is showing a country selector or country list modal.
   */
  async selectIranCountry() {
    if (!this.page || this.page.isClosed()) {
      await this.start();
    }
    this.busy = true;
    try {
      await this._ensureIranSelectedInDom();
      await this.page.waitForTimeout(1000);
      await this.refreshStatusAndScreenshot();
      return this.getState();
    } finally {
      this.busy = false;
    }
  }

  async _ensureIranSelectedInDom() {
    // 1. Check if a country list/dropdown is currently open (visible list of countries)
    const clickedOpenOption = await this._clickIranOptionIfVisible();
    if (clickedOpenOption) return true;

    // 2. Check if Iran (+98) is already selected on the page
    const pageInfo = await this.page.evaluate(() => {
      const bodyText = document.body?.innerText || '';
      const hasIranText = /ایران|Iran/i.test(bodyText);
      const has98 = /\+98/.test(bodyText);
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
      const countryInputIdx = inputs.findIndex((el) => {
        const meta = `${el.placeholder || ''} ${el.getAttribute('aria-label') || ''} ${el.name || ''} ${el.value || ''}`;
        return /کشور|country/i.test(meta);
      });
      return { hasIranText, has98, countryInputIdx };
    });

    if (pageInfo.hasIranText && pageInfo.has98) {
      return true;
    }

    // 3. If there is a country selector input/button, click it and pick Iran
    if (pageInfo.countryInputIdx >= 0) {
      const countryInput = this.page.locator('input:not([type="hidden"])').nth(pageInfo.countryInputIdx);
      await countryInput.click().catch(() => {});
      await this.page.waitForTimeout(600);
      if (await this._clickIranOptionIfVisible()) return true;

      // Try typing "ایران" into country search/input
      await countryInput.fill('ایران').catch(() => {});
      await this.page.waitForTimeout(700);
      if (await this._clickIranOptionIfVisible()) return true;

      await countryInput.fill('Iran').catch(() => {});
      await this.page.waitForTimeout(700);
      if (await this._clickIranOptionIfVisible()) return true;
    } else {
      // Try clicking any dropdown/button mentioning کشور / Country / انتخاب کشور
      const openedDropdown = await this.page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('button, [role="button"], [role="combobox"], div, span'));
        const target = els.find((el) => {
          const t = (el.innerText || '').trim();
          return t.length > 0 && t.length < 40 && /^(کشور|انتخاب کشور|Country|Select country|\+\d{1,3})$/i.test(t);
        });
        if (target) {
          target.click();
          return true;
        }
        return false;
      });
      if (openedDropdown) {
        await this.page.waitForTimeout(700);
        if (await this._clickIranOptionIfVisible()) return true;
      }
    }

    return false;
  }

  async _clickIranOptionIfVisible() {
    // First, if there is a search input inside a country picker, type "ایران"
    await this.page.evaluate(() => {
      const searchInputs = Array.from(document.querySelectorAll('input[type="search"], input[placeholder*="جستجو"], input[placeholder*="کشور"], input[placeholder*="Search" i], input[placeholder*="Country" i]'));
      for (const inp of searchInputs) {
        const rect = inp.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          inp.focus();
          break;
        }
      }
    });

    const clicked = await this.page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('li, [role="option"], [role="listitem"], [role="menuitem"], button, div, span')
      );
      // Prefer elements that contain ایران or Iran or +98 and are reasonably compact (an option row, not the whole page)
      const matches = candidates.filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || rect.height > 120) return false;
        const txt = (el.innerText || '').trim();
        if (!txt || txt.length > 60) return false;
        return /(?:^|\s)(ایران|Iran)(?:\s|$|\(|（|\+98)/i.test(txt) || /\+98/.test(txt);
      });
      // Pick the most specific (smallest text / deepest) match
      if (matches.length > 0) {
        matches.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
        matches[0].scrollIntoView({ block: 'center' });
        matches[0].click();
        return true;
      }
      return false;
    });

    if (clicked) {
      await this.page.waitForTimeout(600);
      return true;
    }

    // If not visible in current scroll, try typing "ایران" into active search box and clicking again
    const hasSearch = await this.page.evaluate(() => {
      const el = document.querySelector('input[type="search"], input[placeholder*="جستجو"], input[placeholder*="Search" i]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

    if (hasSearch) {
      await this.page.keyboard.press('Control+A').catch(() => {});
      await this.page.keyboard.type('ایران', { delay: 40 });
      await this.page.waitForTimeout(700);
      const clickedAfterSearch = await this.page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('li, [role="option"], [role="listitem"], button, div, span'));
        const match = candidates.find((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0 || rect.height > 120) return false;
          const txt = (el.innerText || '').trim();
          return txt.length > 0 && txt.length <= 60 && (/ایران/i.test(txt) || /\+98/.test(txt));
        });
        if (match) {
          match.click();
          return true;
        }
        return false;
      });
      if (clickedAfterSearch) {
        await this.page.waitForTimeout(600);
        return true;
      }
    }

    return false;
  }

  /**
   * Submits phone number on Bale Web login screen.
   */
  async submitPhoneNumber(phone) {
    if (!this.page || this.page.isClosed()) {
      await this.start();
    }
    const norm = config.normalizePhone(phone);
    if (!config.isValidIranMobile(norm)) {
      throw new Error('شماره موبایل معتبر وارد کنید (مثال: 09123456789).');
    }
    // National format without leading 0 (e.g., 9365603574)
    const nationalNoZero = norm.slice(1);

    this.busy = true;
    try {
      await this.page.waitForTimeout(800);

      // Step 1: Ensure Iran (+98) is selected if country picker/dropdown is present
      await this._ensureIranSelectedInDom();
      await this.page.waitForTimeout(500);

      // Step 2: Locate the actual phone input (explicitly excluding country/search inputs)
      const targetIndex = await this.page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
        const visible = inputs
          .map((el, idx) => ({ el, idx, rect: el.getBoundingClientRect() }))
          .filter((item) => item.rect.width > 0 && item.rect.height > 0);

        const isCountryOrSearch = (el) => {
          const meta = `${el.placeholder || ''} ${el.getAttribute('aria-label') || ''} ${el.name || ''} ${el.id || ''} ${el.value || ''}`;
          return /کشور|country|جستجو|search|ایران|iran/i.test(meta);
        };

        const nonCountry = visible.filter((item) => !isCountryOrSearch(item.el));
        if (nonCountry.length === 0) return visible.length > 0 ? visible[visible.length - 1].idx : -1;

        const telMatch = nonCountry.find((item) => {
          const el = item.el;
          const meta = `${el.type || ''} ${el.inputMode || ''} ${el.placeholder || ''} ${el.name || ''} ${el.getAttribute('aria-label') || ''}`;
          return /tel|numeric|phone|mobile|شماره|موبایل|تلفن|9/i.test(meta);
        });
        return telMatch ? telMatch.idx : nonCountry[nonCountry.length - 1].idx;
      });

      if (targetIndex < 0) {
        throw new Error('فیلد شماره موبایل در صفحه بله وب یافت نشد. لطفاً وضعیت صفحه را بررسی کنید.');
      }

      const inputLocator = this.page.locator('input:not([type="hidden"])').nth(targetIndex);
      await inputLocator.click();
      await this.page.waitForTimeout(200);

      const pageHas98Prefix = await this.page.evaluate(() => /\+98|98/.test(document.body?.innerText || ''));
      const currentVal = await inputLocator.inputValue().catch(() => '');

      await this.page.keyboard.press('Control+A').catch(() => {});
      await this.page.keyboard.press('Backspace').catch(() => {});

      if (currentVal.includes('98')) {
        await inputLocator.type(`+98${nationalNoZero}`, { delay: 50 });
      } else if (pageHas98Prefix) {
        await inputLocator.type(nationalNoZero, { delay: 50 });
      } else {
        await inputLocator.type(norm, { delay: 50 });
      }

      await this.page.waitForTimeout(500);

      // Step 3: Click next/submit button or press Enter
      const clicked = await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
        const target = btns.find((b) => /ادامه|بعدی|ورود|ارسال|تایید|تأیید|next|submit|login/i.test(b.innerText || ''));
        if (target) {
          target.click();
          return true;
        }
        return false;
      });
      if (!clicked) {
        await this.page.keyboard.press('Enter');
      }

      await this.page.waitForTimeout(3000);

      // Step 4: If Bale still popped up a country list after submit, auto-select Iran once more
      await this._clickIranOptionIfVisible();

      await this.refreshStatusAndScreenshot();
      return this.getState();
    } finally {
      this.busy = false;
    }
  }

  /**
   * Submits the OTP code on Bale Web login screen.
   */
  async submitOtpCode(code) {
    if (!this.page || this.page.isClosed()) {
      throw new Error('مرورگر بله وب فعال نیست.');
    }
    const cleanCode = String(code || '').replace(/\D/g, '').trim();
    if (!cleanCode) {
      throw new Error('کد تایید معتبر وارد کنید.');
    }

    this.busy = true;
    try {
      // Handle either a single input or multi-box OTP inputs
      const inputs = await this.page.locator('input:not([type="hidden"])').all();
      if (inputs.length >= cleanCode.length && cleanCode.length >= 4) {
        for (let i = 0; i < cleanCode.length; i++) {
          await inputs[i].click();
          await inputs[i].fill(cleanCode[i]);
        }
      } else if (inputs.length > 0) {
        const first = inputs[0];
        await first.click();
        await first.fill('');
        await first.type(cleanCode, { delay: 75 });
      } else {
        await this.page.keyboard.type(cleanCode, { delay: 80 });
      }

      await this.page.waitForTimeout(600);
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(4000);
      await this.refreshStatusAndScreenshot();
      return this.getState();
    } finally {
      this.busy = false;
    }
  }

  /**
   * Allows the admin to click at (x, y) or type text into the remote Bale browser directly from the panel if needed.
   */
  async remoteInteract({ action, x, y, text, key }) {
    if (!this.page || this.page.isClosed()) {
      await this.start();
    }
    this.busy = true;
    try {
      if (action === 'click' && typeof x === 'number' && typeof y === 'number') {
        await this.page.mouse.click(x, y);
      } else if (action === 'type' && text) {
        await this.page.keyboard.type(String(text), { delay: 50 });
      } else if (action === 'key' && key) {
        await this.page.keyboard.press(String(key));
      } else if (action === 'reload') {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
      }
      await this.page.waitForTimeout(1500);
      await this.refreshStatusAndScreenshot();
      return this.getState();
    } finally {
      this.busy = false;
    }
  }

  /**
   * Opens or creates a contact chat by phone number in Bale Web and sends a message.
   */
  async sendMessage(phone, text, { contactName = '' } = {}) {
    if (!this.page || this.page.isClosed()) {
      throw new Error('مرورگر بله وب باز نیست. لطفاً ابتدا از بخش اتصالات بله را راه‌اندازی کنید.');
    }
    if (this.status !== 'connected') {
      await this.refreshStatusAndScreenshot();
      if (this.status !== 'connected') {
        throw new Error('حساب بله وب هنوز وارد نشده است. لطفاً ابتدا در پنل مدیریت وارد حساب بله شوید.');
      }
    }

    const norm = config.normalizePhone(phone);
    if (!config.isValidIranMobile(norm)) {
      throw new Error(`شماره موبایل نامعتبر برای بله: ${phone}`);
    }

    while (this.busy) {
      await new Promise((r) => setTimeout(r, 500));
    }

    this.busy = true;
    try {
      const opened = await this._openChatByPhone(norm, contactName);
      if (!opened) {
        await this.refreshStatusAndScreenshot();
        throw new Error(`امکان باز کردن گفتگو برای شماره ${norm} در بله وب فراهم نشد (تصویر لحظه‌ای صفحه بله در پنل بروزرسانی شد).`);
      }

      await this._typeAndSendInOpenChat(text);
      await this.page.waitForTimeout(1000);
      await this.refreshStatusAndScreenshot();
      return { ok: true, externalId: `bale_${Date.now()}` };
    } finally {
      this.busy = false;
    }
  }

  async _openChatByPhone(normPhone, contactName = '') {
    const plusPhone = `+98${normPhone.slice(1)}`;
    const noZeroPhone = normPhone.slice(1);
    const displayName = contactName || `مشاور ${normPhone}`;

    // Step 0: Close any stray modal (e.g. "خدمات بازو") before navigating
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.evaluate(() => {
      const closeBtns = Array.from(document.querySelectorAll('button, [role="button"]')).filter((b) => {
        const rect = b.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const txt = (b.innerText || '').trim();
        const aria = b.getAttribute('aria-label') || '';
        return txt === '×' || txt === '✕' || /close|بستن/i.test(aria);
      });
      if (closeBtns.length > 0) closeBtns[0].click();
    });
    await this.page.waitForTimeout(350);

    // Step 1: Click exact "مخاطبین" navigation item on the right rail
    const contactsNav = this.page.getByText('مخاطبین', { exact: true }).first();
    if ((await contactsNav.count()) > 0 && (await contactsNav.isVisible().catch(() => false))) {
      await contactsNav.click().catch(() => {});
      await this.page.waitForTimeout(1000);
    }

    // Step 2: Inside Contacts (or main view), search for the phone number in any visible search input
    const searchLoc = this.page
      .locator('input[type="search"], input[placeholder*="جستجو"], input[aria-label*="جستجو"], input[placeholder*="Search" i]')
      .last();

    if ((await searchLoc.count()) > 0 && (await searchLoc.isVisible().catch(() => false))) {
      for (const q of [normPhone, plusPhone, noZeroPhone]) {
        await searchLoc.click().catch(() => {});
        await this.page.keyboard.press('Control+A').catch(() => {});
        await this.page.keyboard.press('Backspace').catch(() => {});
        await searchLoc.type(q, { delay: 35 }).catch(() => {});
        await this.page.waitForTimeout(1200);

        const clickedContact = await this.page.evaluate((qList) => {
          const items = Array.from(
            document.querySelectorAll('[role="listitem"], [class*="contact"], [class*="Contact"], [class*="chat-item"], [class*="ChatItem"], li')
          );
          const match = items.find((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0 || rect.height > 120) return false;
            const t = (el.innerText || '').trim();
            if (!t || /نتیجه‌ای یافت نشد|یافت نشد|مخاطبی یافت نشد/i.test(t)) return false;
            return qList.some((x) => t.includes(x));
          });
          if (match) {
            match.click();
            return true;
          }
          return false;
        }, [normPhone, plusPhone, noZeroPhone]);

        if (clickedContact) {
          await this.page.waitForTimeout(1200);
          if (await this._hasMessageComposer()) return true;
        }
      }

      // Clear search box before trying Add Contact
      await searchLoc.click().catch(() => {});
      await this.page.keyboard.press('Control+A').catch(() => {});
      await this.page.keyboard.press('Backspace').catch(() => {});
      await this.page.waitForTimeout(400);
    }

    // Step 3: Click explicit "افزودن مخاطب" / "مخاطب جدید" / "+" button inside Contacts (never click Services/Bazoo)
    await this.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"], a'));
      const addBtn = btns.find((b) => {
        const rect = b.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const txt = (b.innerText || '').trim();
        const aria = b.getAttribute('aria-label') || '';
        const title = b.getAttribute('title') || '';
        const meta = `${txt} ${aria} ${title}`;
        if (/خدمات|بازو|هوش مصنوعی|مجله|ربات|فروشگاه/i.test(meta)) return false;
        return /افزودن مخاطب|مخاطب جدید|ایجاد مخاطب|add contact/i.test(meta) || txt === '+';
      });
      if (addBtn) {
        addBtn.click();
      }
    });

    await this.page.waitForTimeout(900);

    // Step 4: Fill Add Contact form (Name + Phone) using real Playwright typing
    const modalInputs = await this.page
      .locator('input:not([type="hidden"]):not([type="search"])')
      .all();

    const visibleInputs = [];
    for (const inp of modalInputs) {
      if (await inp.isVisible().catch(() => false)) {
        visibleInputs.push(inp);
      }
    }

    if (visibleInputs.length >= 2) {
      await visibleInputs[0].click();
      await this.page.keyboard.press('Control+A').catch(() => {});
      await visibleInputs[0].fill(displayName);

      const phoneInp = visibleInputs[visibleInputs.length - 1];
      await phoneInp.click();
      await this.page.keyboard.press('Control+A').catch(() => {});
      await this.page.keyboard.press('Backspace').catch(() => {});

      const has98 = await this.page.evaluate(() => /\+98/.test(document.body?.innerText || ''));
      await phoneInp.type(has98 ? noZeroPhone : normPhone, { delay: 40 });
      await this.page.waitForTimeout(500);

      const submitted = await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
        const submit = btns.find((b) =>
          /^(افزودن|ذخیره|تایید|تأیید|ایجاد|ثبت|ادامه|Save|Add|Create)$/i.test((b.innerText || '').trim())
        );
        if (submit) {
          submit.click();
          return true;
        }
        return false;
      });

      if (!submitted) {
        await this.page.keyboard.press('Enter').catch(() => {});
      }
      await this.page.waitForTimeout(2000);
      if (await this._hasMessageComposer()) return true;

      // If contact was added and now appears in Contacts list, click it
      const clickedNewContact = await this.page.evaluate((nameStr) => {
        const items = Array.from(document.querySelectorAll('[role="listitem"], [class*="contact"], [class*="Contact"], li'));
        const match = items.find((el) => (el.innerText || '').includes(nameStr));
        if (match) {
          match.click();
          return true;
        }
        return false;
      }, displayName);

      if (clickedNewContact) {
        await this.page.waitForTimeout(1200);
      }
    }

    return await this._hasMessageComposer();
  }

  async _hasMessageComposer() {
    return await this.page.evaluate(() => {
      const composer = document.querySelector(
        '[contenteditable="true"], textarea, input[placeholder*="پیام"], [aria-label*="پیام"]'
      );
      return Boolean(composer);
    });
  }

  async _typeAndSendInOpenChat(text) {
    const composerLocator = this.page
      .locator('[contenteditable="true"], textarea, input[placeholder*="پیام"]')
      .last();

    await composerLocator.waitFor({ state: 'visible', timeout: 8000 });
    await composerLocator.click();

    // Split multiline text using Shift+Enter so Enter only submits at the very end
    const lines = String(text || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) {
        await this.page.keyboard.insertText(lines[i]);
      }
      if (i < lines.length - 1) {
        await this.page.keyboard.press('Shift+Enter');
      }
    }

    await this.page.waitForTimeout(400);

    // Click send button if visible, otherwise press Enter
    const clickedSend = await this.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      const sendBtn = btns.find((b) =>
        /ارسال|send/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.className || ''))
      );
      if (sendBtn) {
        sendBtn.click();
        return true;
      }
      return false;
    });

    if (!clickedSend) {
      await this.page.keyboard.press('Enter');
    }
  }

  /**
   * Periodically inspects Bale Web for unread conversations and extracts the latest inbound message.
   */
  async pollActiveCycle() {
    if (this.busy || !this.page || this.page.isClosed()) return;
    if (this.status !== 'connected') {
      await this.refreshStatusAndScreenshot();
      return;
    }

    this.busy = true;
    try {
      // Check if there is an unread badge in chat list and click it
      const unreadClicked = await this.page.evaluate(() => {
        const items = Array.from(
          document.querySelectorAll('[role="listitem"], [class*="chat-item"], [class*="ChatItem"], [class*="dialog"]')
        );
        for (const item of items) {
          const badge = item.querySelector('[class*="badge"], [class*="unread"], [class*="Badge"], [class*="Unread"]');
          if (badge && /^\d+$/.test((badge.innerText || '').trim())) {
            item.click();
            return true;
          }
        }
        return false;
      });

      if (unreadClicked) {
        await this.page.waitForTimeout(1200);
      }

      // Extract open chat header phone/title and last inbound message bubble
      const activeChatInfo = await this.page.evaluate(() => {
        const headerText = (
          document.querySelector('header, [class*="header"], [class*="ChatHeader"]')?.innerText || ''
        ).trim();
        const msgEls = Array.from(
          document.querySelectorAll('[class*="message"], [class*="Message"], [data-message-id]')
        );
        if (msgEls.length === 0) return null;
        const lastEl = msgEls[msgEls.length - 1];
        const cls = (lastEl.className || '').toLowerCase();
        const isOutgoing = cls.includes('out') || cls.includes('own') || cls.includes('right') || cls.includes('sent');
        const text = (lastEl.innerText || '').trim();
        return {
          headerText,
          isOutgoing,
          text,
        };
      });

      if (activeChatInfo && !activeChatInfo.isOutgoing && activeChatInfo.text) {
        const headerPhoneMatch = activeChatInfo.headerText.match(/(?:\+98|09)[0-9۰-۹]{9,10}/);
        if (headerPhoneMatch) {
          const phone = config.normalizePhone(headerPhoneMatch[0]);
          if (config.isValidIranMobile(phone)) {
            const cleanMsg = activeChatInfo.text.split('\n')[0].trim();
            const prev = this.lastObservedTexts.get(phone);
            if (cleanMsg && cleanMsg !== prev) {
              this.lastObservedTexts.set(phone, cleanMsg);
              this.emit('inbound_message', {
                channel: 'bale',
                phone,
                text: cleanMsg,
                pushName: activeChatInfo.headerText.split('\n')[0] || '',
                externalId: `bale_in_${Date.now()}`,
              });
            }
          }
        }
      }
    } catch {
      // Ignore transient DOM polling errors
    } finally {
      this.busy = false;
    }
  }
}

module.exports = {
  BaleWebClient,
};
