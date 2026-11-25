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
    // National format without leading 0 (e.g., 9123456789) and full format
    const nationalNoZero = norm.slice(1);

    this.busy = true;
    try {
      await this.page.waitForTimeout(800);
      const inputLocator = this.page.locator('input[type="tel"], input[type="text"], input[type="number"], input:not([type="hidden"])').first();
      await inputLocator.waitFor({ state: 'visible', timeout: 10000 });
      await inputLocator.click();
      await inputLocator.fill('');

      // Check if input already prefixes +98
      const currentVal = await inputLocator.inputValue().catch(() => '');
      if (currentVal.includes('98')) {
        await inputLocator.type(nationalNoZero, { delay: 60 });
      } else {
        await inputLocator.fill(nationalNoZero);
      }

      await this.page.waitForTimeout(500);

      // Click next/submit button or press Enter
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
        throw new Error(`امکان باز کردن گفتگو برای شماره ${norm} در بله وب فراهم نشد (ممکن است شماره در بله عضو نباشد).`);
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
    const displayName = contactName || `مشاور ${normPhone}`;

    // Strategy 1: Search in Bale search bar for the phone number
    const searchOpened = await this.page.evaluate((queries) => {
      const inputs = Array.from(document.querySelectorAll('input[type="search"], input[type="text"], input'));
      const searchInput = inputs.find((el) => /جستجو|search/i.test((el.placeholder || '') + ' ' + (el.getAttribute('aria-label') || '')));
      if (searchInput) {
        searchInput.focus();
        searchInput.click();
        return true;
      }
      return false;
    }, [normPhone, plusPhone]);

    if (searchOpened) {
      await this.page.keyboard.press('Control+A').catch(() => {});
      await this.page.keyboard.press('Backspace').catch(() => {});
      await this.page.keyboard.type(normPhone, { delay: 45 });
      await this.page.waitForTimeout(1800);

      const clickedSearchResult = await this.page.evaluate(() => {
        const items = Array.from(
          document.querySelectorAll('[role="listitem"], [class*="chat-item"], [class*="ChatItem"], [class*="contact"], [class*="result"]')
        );
        const valid = items.find((el) => {
          const t = (el.innerText || '').trim();
          return t.length > 0 && !/نتیجه‌ای یافت نشد|یافت نشد/i.test(t);
        });
        if (valid) {
          valid.click();
          return true;
        }
        return false;
      });

      if (clickedSearchResult) {
        await this.page.waitForTimeout(1200);
        if (await this._hasMessageComposer()) return true;
      }
    }

    // Strategy 2: Open Contacts / Add Contact modal in Bale Web
    const clickedContactsMenu = await this.page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, a, div[role="button"], span'));
      const contactBtn = els.find((el) => /^(مخاطبین|مخاطب جدید|افزودن مخاطب|Contacts)$/i.test((el.innerText || '').trim()) || /مخاطب/i.test(el.getAttribute('aria-label') || '') || /contact/i.test(el.getAttribute('title') || ''));
      if (contactBtn) {
        contactBtn.click();
        return true;
      }
      return false;
    });

    if (clickedContactsMenu) {
      await this.page.waitForTimeout(1000);
      // Try clicking "Add Contact" / "+" button inside contacts drawer/modal
      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
        const addBtn = btns.find((b) => /افزودن|مخاطب جدید|جدید|\+/i.test((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')));
        if (addBtn) addBtn.click();
      });
      await this.page.waitForTimeout(900);

      const filledAddModal = await this.page.evaluate(
        ({ name, phone }) => {
          const modalInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="search"])'));
          if (modalInputs.length < 2) return false;
          const setNativeValue = (el, val) => {
            el.focus();
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          };
          setNativeValue(modalInputs[0], name);
          const phoneInput = modalInputs.find((el) => /tel|phone|شماره|موبایل/i.test((el.placeholder || '') + ' ' + (el.type || ''))) || modalInputs[modalInputs.length - 1];
          setNativeValue(phoneInput, phone);

          const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
          const submit = btns.find((b) => /افزودن|ذخیره|تایید|تأیید|ایجاد|ثبت/i.test((b.innerText || '').trim()));
          if (submit) {
            submit.click();
            return true;
          }
          return false;
        },
        { name: displayName, phone: normPhone }
      );

      if (filledAddModal) {
        await this.page.waitForTimeout(1800);
        if (await this._hasMessageComposer()) return true;
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
