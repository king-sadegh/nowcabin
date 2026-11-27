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
      this.context.on('close', () => {
        this.context = null;
        this.page = null;
        this.status = 'disconnected';
      });
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
    const displayName = (contactName || `مشاور ${normPhone}`).trim();
    const shortName = displayName.slice(0, 18).trim();

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

    // Helper: click a contact row strictly inside the right-side Contacts/Chat panel (not the far-right nav rail)
    const clickSidebarContactRow = async (needles) => {
      const coords = await this.page.evaluate((nList) => {
        const vw = window.innerWidth;
        const candidates = Array.from(
          document.querySelectorAll('[role="listitem"], [class*="contact"], [class*="Contact"], [class*="chat"], [class*="Chat"], li, div')
        );
        const matches = candidates.filter((el) => {
          const r = el.getBoundingClientRect();
          // Must be inside the sidebar list area (not the far-right 75px rail, not the top 90px header)
          if (r.width < 140 || r.height < 36 || r.height > 120) return false;
          if (r.left < vw - 460 || r.right > vw - 70 || r.top < 95) return false;
          const t = (el.innerText || '').trim();
          if (!t || /افزودن مخاطب|ساخت گروه|ساخت کانال|نتیجه‌ای یافت نشد/i.test(t)) return false;
          return nList.some((n) => n && t.includes(n));
        });
        if (matches.length === 0) return null;
        // Prefer the tightest matching row element
        matches.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height);
        const r = matches[0].getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      }, needles);

      if (coords) {
        await this.page.mouse.click(coords.x, coords.y);
        await this.page.waitForTimeout(1400);
        if (await this._hasMessageComposer()) return true;

        // If clicking opened a contact info card with "ارسال پیام" / "پیام" button, click it
        const clickedSendMsgBtn = await this.page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('button, [role="button"], a, div, span'));
          const btn = els.find((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0 || r.height > 70) return false;
            return /^(ارسال پیام|شروع گفتگو|پیام|Message|Send Message)$/i.test((el.innerText || '').trim());
          });
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        });
        if (clickedSendMsgBtn) {
          await this.page.waitForTimeout(1200);
          if (await this._hasMessageComposer()) return true;
        }
      }
      return false;
    };

    // Helper: open Contacts search bar (clicks 🔍 in Contacts header if input isn't visible yet)
    const searchInContacts = async (query) => {
      let searchLoc = this.page
        .locator('input[type="search"], input[placeholder*="جستجو"], input[aria-label*="جستجو"], input[placeholder*="Search" i]')
        .last();

      if ((await searchLoc.count()) === 0 || !(await searchLoc.isVisible().catch(() => false))) {
        // Click the 🔍 icon in the Contacts header (top-right area, y < 90, x between vw-450 and vw-75)
        const searchIconCoords = await this.page.evaluate(() => {
          const vw = window.innerWidth;
          const btns = Array.from(document.querySelectorAll('button, [role="button"], svg'));
          const icon = btns.find((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 12 && r.width < 60 && r.height > 12 && r.height < 60 && r.top < 90 && r.left > vw - 450 && r.left < vw - 75;
          });
          if (!icon) return null;
          const r = icon.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        });
        if (searchIconCoords) {
          await this.page.mouse.click(searchIconCoords.x, searchIconCoords.y);
          await this.page.waitForTimeout(600);
        }
        searchLoc = this.page
          .locator('input[type="search"], input[placeholder*="جستجو"], input[aria-label*="جستجو"], input[placeholder*="Search" i]')
          .last();
      }

      if ((await searchLoc.count()) > 0 && (await searchLoc.isVisible().catch(() => false))) {
        await searchLoc.click().catch(() => {});
        await this.page.keyboard.press('Control+A').catch(() => {});
        await this.page.keyboard.press('Backspace').catch(() => {});
        await searchLoc.type(query, { delay: 35 }).catch(() => {});
        await this.page.waitForTimeout(1200);
        return true;
      }
      return false;
    };

    // Rule Step 1: Open "مخاطبین" on the right rail and check if contact already exists
    const contactsNav = this.page.getByText('مخاطبین', { exact: true }).first();
    if ((await contactsNav.count()) > 0 && (await contactsNav.isVisible().catch(() => false))) {
      await contactsNav.click().catch(() => {});
      await this.page.waitForTimeout(1000);
    }

    if (await clickSidebarContactRow([normPhone, shortName])) return true;

    for (const q of [normPhone, shortName, noZeroPhone]) {
      if (!q || q.length < 3) continue;
      if (await searchInContacts(q)) {
        if (await clickSidebarContactRow([normPhone, shortName, q])) return true;
      }
    }

    // Clear search before adding new contact
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(400);

    // Re-ensure we're on Contacts tab
    if ((await contactsNav.count()) > 0 && (await contactsNav.isVisible().catch(() => false))) {
      await contactsNav.click().catch(() => {});
      await this.page.waitForTimeout(800);
    }

    // Rule Step 1b: Save new contact via "افزودن مخاطب"
    const addContactLoc = this.page.getByText('افزودن مخاطب', { exact: true }).first();
    if ((await addContactLoc.count()) > 0 && (await addContactLoc.isVisible().catch(() => false))) {
      await addContactLoc.click().catch(() => {});
      await this.page.waitForTimeout(900);

      const modalInputs = await this.page
        .locator('input:not([type="hidden"]):not([type="search"])')
        .all();

      const visibleInputs = [];
      for (const inp of modalInputs) {
        if (await inp.isVisible().catch(() => false)) {
          const meta = await inp
            .evaluate((el) => `${el.placeholder || ''} ${el.getAttribute('aria-label') || ''} ${el.name || ''} ${el.type || ''} ${el.value || ''}`)
            .catch(() => '');
          visibleInputs.push({ inp, meta });
        }
      }

      if (visibleInputs.length >= 2) {
        const nonCountry = visibleInputs.filter((x) => !/کشور|country|ایران|iran/i.test(x.meta));
        const list = nonCountry.length >= 2 ? nonCountry : visibleInputs;

        const nameItem =
          list.find((x) => /نام|name/i.test(x.meta) && !/خانوادگی|last/i.test(x.meta)) || list[0];
        const phoneItem =
          list.find((x) => /tel|phone|mobile|شماره|موبایل|تلفن/i.test(x.meta)) || list[list.length - 1];

        await nameItem.inp.click();
        await this.page.keyboard.press('Control+A').catch(() => {});
        await nameItem.inp.fill(displayName);

        await phoneItem.inp.click();
        await this.page.keyboard.press('Control+A').catch(() => {});
        await this.page.keyboard.press('Backspace').catch(() => {});

        const phoneVal = await phoneItem.inp.inputValue().catch(() => '');
        const has98 = phoneVal.includes('98') || (await this.page.evaluate(() => /\+98/.test(document.body?.innerText || '')));
        await phoneItem.inp.type(has98 ? noZeroPhone : normPhone, { delay: 40 });
        await this.page.waitForTimeout(500);

        const submitted = await this.page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button, [role="button"], div, span'));
          const submit = btns.find((b) => {
            const rect = b.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0 || rect.height > 70) return false;
            return /^(افزودن|ذخیره|تایید|تأیید|ایجاد|ثبت|ادامه|Save|Add|Create)$/i.test((b.innerText || '').trim());
          });
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
      }
    }

    // Rule Step 2: Search for the saved contact in Contacts list and click it
    if (await clickSidebarContactRow([normPhone, shortName])) return true;

    for (const q of [shortName, normPhone]) {
      if (!q || q.length < 3) continue;
      if (await searchInContacts(q)) {
        if (await clickSidebarContactRow([normPhone, shortName, q])) return true;
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
   * Periodically inspects Bale Web for unread replies from outreach contacts and emits inbound_message.
   */
  async pollActiveCycle() {
    if (this.busy || !this.page || this.page.isClosed()) return;
    if (this.status !== 'connected') {
      await this.refreshStatusAndScreenshot();
      return;
    }

    this.busy = true;
    try {
      // Load outreach contacts so we only click/process chats belonging to our real estate agents
      const knownContacts = db
        .prepare('SELECT id, phone, full_name FROM outreach_contacts ORDER BY updated_at DESC LIMIT 500')
        .all();

      const contactSignatures = knownContacts.map((c) => ({
        id: c.id,
        phone: c.phone,
        shortName: (c.full_name || '').trim().slice(0, 16),
      }));

      // Switch to "گفتگو" tab on the right rail if we're currently on "مخاطبین"
      const onContactsTab = await this.page.evaluate(() => {
        const headerTexts = Array.from(document.querySelectorAll('div, h1, h2, span'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.top < 80 && r.left > window.innerWidth - 460 && r.right < window.innerWidth - 70;
          })
          .map((el) => (el.innerText || '').trim());
        return headerTexts.some((t) => t === 'مخاطبین');
      });

      if (onContactsTab) {
        const chatsNav = this.page.getByText('گفتگو', { exact: true }).first();
        if ((await chatsNav.count()) > 0 && (await chatsNav.isVisible().catch(() => false))) {
          await chatsNav.click().catch(() => {});
          await this.page.waitForTimeout(900);
        }
      }

      // Click any sidebar chat item that has an unread badge (Persian OR ASCII digits) AND matches one of our contacts
      const unreadCoords = await this.page.evaluate((sigs) => {
        const vw = window.innerWidth;
        const rows = Array.from(
          document.querySelectorAll('[role="listitem"], [class*="chat"], [class*="Chat"], [class*="dialog"], li, div')
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width >= 160 && r.height >= 44 && r.height <= 110 && r.left >= vw - 460 && r.right <= vw - 70 && r.top >= 90;
        });

        for (const row of rows) {
          const txt = (row.innerText || '').trim();
          if (!txt) continue;
          // Check if row has an unread counter badge (supports both Persian ۰-۹ and ASCII 0-9)
          const badge = Array.from(row.querySelectorAll('span, div')).find((b) => {
            const bt = (b.innerText || '').trim();
            const br = b.getBoundingClientRect();
            return br.width > 12 && br.width < 46 && br.height > 12 && br.height < 36 && /^[0-9۰-۹]{1,3}$/.test(bt);
          });
          if (!badge) continue;

          const matched = sigs.find(
            (s) => (s.phone && txt.includes(s.phone)) || (s.shortName && s.shortName.length >= 3 && txt.includes(s.shortName))
          );
          if (matched) {
            const r = row.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
          }
        }
        return null;
      }, contactSignatures);

      if (unreadCoords) {
        await this.page.mouse.click(unreadCoords.x, unreadCoords.y);
        await this.page.waitForTimeout(1200);
      }

      // Now inspect the currently open chat in the LEFT pane (rect.left < vw - 460)
      const activeChatInfo = await this.page.evaluate(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const leftPaneMaxRight = vw - 420;

        // 1. Extract open chat header text from top of left pane
        const headerEls = Array.from(document.querySelectorAll('header, h1, h2, h3, div, span')).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 40 && r.height > 14 && r.height < 90 && r.top >= 0 && r.top < 85 && r.right <= leftPaneMaxRight;
        });
        const headerText = headerEls
          .map((el) => (el.innerText || '').trim())
          .filter(Boolean)
          .slice(0, 6)
          .join(' | ');

        // 2. Extract message bubbles in the left pane (between header and composer)
        const msgCandidates = Array.from(
          document.querySelectorAll('[data-message-id], [class*="message"], [class*="Message"], [class*="bubble"], [class*="Bubble"]')
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          const t = (el.innerText || '').trim();
          return (
            t.length > 0 &&
            r.width > 30 &&
            r.width < leftPaneMaxRight - 20 &&
            r.height >= 20 &&
            r.height < vh - 160 &&
            r.top >= 75 &&
            r.bottom <= vh - 65 &&
            r.right <= leftPaneMaxRight
          );
        });

        if (msgCandidates.length === 0) return null;

        // Sort by vertical bottom position to find the lowest (most recent) message bubble
        msgCandidates.sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          if (Math.abs(rb.bottom - ra.bottom) > 6) return rb.bottom - ra.bottom;
          return ra.height - rb.height;
        });

        const lastEl = msgCandidates[0];
        const cls = ((lastEl.className || '') + ' ' + (lastEl.parentElement?.className || '')).toLowerCase();
        const hasOutgoingTick = Boolean(
          lastEl.querySelector('[class*="tick"], [class*="check"], [class*="seen"], [class*="status"]')
        );
        const isOutgoing =
          hasOutgoingTick || cls.includes('out') || cls.includes('own') || cls.includes('sent') || cls.includes('self');

        // Clean timestamp line (e.g. "21:14" or "۲۱:۱۴") from the end of bubble text
        const rawLines = (lastEl.innerText || '')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !/^[0-9۰-۹]{1,2}:[0-9۰-۹]{2}$/.test(l));

        return {
          headerText,
          isOutgoing,
          text: rawLines.join('\n').trim(),
        };
      });

      if (!activeChatInfo || !activeChatInfo.text) return;

      // Resolve phone from header text OR by matching against known outreach_contacts
      let matchedContact = null;
      const headerPhoneMatch = activeChatInfo.headerText.match(/(?:\+98|09)[0-9۰-۹]{9,10}/);
      if (headerPhoneMatch) {
        const norm = config.normalizePhone(headerPhoneMatch[0]);
        if (config.isValidIranMobile(norm)) {
          matchedContact = knownContacts.find((c) => c.phone === norm) || { phone: norm, full_name: '' };
        }
      }
      if (!matchedContact) {
        matchedContact = knownContacts.find((c) => {
          const shortN = (c.full_name || '').trim().slice(0, 14);
          return (c.phone && activeChatInfo.headerText.includes(c.phone)) || (shortN.length >= 3 && activeChatInfo.headerText.includes(shortN));
        });
      }

      if (!matchedContact || !config.isValidIranMobile(matchedContact.phone)) return;

      // Double-check against our last outbound message in DB so we NEVER echo our own message
      if (matchedContact.id) {
        const lastOut = db
          .prepare("SELECT body FROM outreach_messages WHERE contact_id = ? AND channel = 'bale' AND direction = 'outbound' ORDER BY id DESC LIMIT 1")
          .get(matchedContact.id);
        if (lastOut && lastOut.body) {
          const outPrefix = lastOut.body.trim().slice(0, 28);
          if (activeChatInfo.text.includes(outPrefix) || lastOut.body.trim().includes(activeChatInfo.text.slice(0, 28))) {
            return;
          }
        }
      }

      if (activeChatInfo.isOutgoing) return;

      const phone = matchedContact.phone;
      const cleanMsg = activeChatInfo.text;
      const prev = this.lastObservedTexts.get(phone);
      if (cleanMsg && cleanMsg !== prev) {
        this.lastObservedTexts.set(phone, cleanMsg);
        this.emit('inbound_message', {
          channel: 'bale',
          phone,
          text: cleanMsg,
          pushName: matchedContact.full_name || activeChatInfo.headerText.split('|')[0].trim(),
          externalId: `bale_in_${phone}_${cleanMsg.slice(0, 24)}`,
        });
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
