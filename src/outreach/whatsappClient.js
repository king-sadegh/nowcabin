const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const QRCode = require('qrcode');
const pino = require('pino');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('../config');
const { getSetting } = require('../db');
const { vlessTunnel } = require('./vlessTunnel');

const AUTH_DIR = path.join(config.DATA_DIR, 'wa_auth');

function iranPhoneToWaJid(phone) {
  const norm = config.normalizePhone(phone);
  if (!/^09\d{9}$/.test(norm)) return null;
  return `98${norm.slice(1)}@s.whatsapp.net`;
}

function waJidToIranPhone(jid) {
  if (!jid || typeof jid !== 'string') return '';
  const bare = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (bare.startsWith('989') && bare.length === 12) {
    return '0' + bare.slice(2);
  }
  return config.normalizePhone(bare);
}

function buildProxyAgent(proxyUrl) {
  const url = String(proxyUrl || '').trim();
  if (!url) return undefined;
  try {
    if (url.startsWith('socks')) {
      return new SocksProxyAgent(url);
    }
    return new HttpsProxyAgent(url);
  } catch (err) {
    console.error('[WhatsApp] Invalid proxy URL:', err.message);
    return undefined;
  }
}

class WhatsAppClient extends EventEmitter {
  constructor() {
    super();
    this.sock = null;
    this.status = 'disconnected'; // disconnected | connecting | qr_ready | connected | error
    this.qrText = '';
    this.qrDataUrl = '';
    this.connectedPhone = '';
    this.connectedName = '';
    this.lastError = '';
    this.sentIds = new Set();
    this.reconnectTimer = null;
    this.manualStop = false;
  }

  getState() {
    const hasSavedSession = fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
    return {
      status: this.status,
      qrDataUrl: this.qrDataUrl,
      connectedPhone: this.connectedPhone,
      connectedName: this.connectedName,
      lastError: this.lastError,
      hasSavedSession,
      proxyUrl: getSetting('outreach_wa_proxy_url', ''),
      vlessTunnel: vlessTunnel.getState(),
    };
  }

  async start({ forceNewQr = false } = {}) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.manualStop = false;

    if (forceNewQr) {
      await this.logout();
    }

    if (this.sock && (this.status === 'connected' || this.status === 'connecting' || this.status === 'qr_ready')) {
      return this.getState();
    }

    try {
      this.status = 'connecting';
      this.lastError = '';
      fs.mkdirSync(AUTH_DIR, { recursive: true });

      const baileys = await import('@whiskeysockets/baileys');
      const makeWASocket = baileys.makeWASocket || baileys.default;
      const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = baileys;

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

      let version = [2, 3000, 1019707846];
      const rawProxyUrl = getSetting('outreach_wa_proxy_url', '');
      const resolvedProxyUrl = await vlessTunnel.resolveProxyUrl(rawProxyUrl);
      const agent = buildProxyAgent(resolvedProxyUrl);

      try {
        const latest = await fetchLatestBaileysVersion(agent ? { agent } : undefined);
        if (latest?.version) version = latest.version;
      } catch {
        // Fallback to built-in version if offline or blocked
      }

      const logger = pino({ level: 'silent' });
      const sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: Browsers ? Browsers.ubuntu('Chrome') : ['NoKabin CRM', 'Chrome', '122.0.0'],
        agent,
        fetchAgent: agent,
        connectTimeoutMs: 30000,
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 25000,
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });

      this.sock = sock;
      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrText = qr;
          this.status = 'qr_ready';
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 1 });
          } catch (qrErr) {
            this.lastError = qrErr.message;
          }
        }

        if (connection === 'open') {
          this.status = 'connected';
          this.qrText = '';
          this.qrDataUrl = '';
          this.lastError = '';
          const meId = sock.user?.id || '';
          this.connectedPhone = waJidToIranPhone(meId) || meId;
          this.connectedName = sock.user?.name || 'خط واتس‌اپ نوکابین';
          console.log(`[WhatsApp] Connected as ${this.connectedPhone}`);
        }

        if (connection === 'close') {
          const statusCode =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.statusCode ||
            0;
          const errMessage = lastDisconnect?.error?.message || 'ارتباط با واتس‌اپ قطع شد.';
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !this.manualStop;

          this.sock = null;
          this.qrDataUrl = '';

          if (statusCode === DisconnectReason.loggedOut) {
            this.status = 'disconnected';
            this.connectedPhone = '';
            this.connectedName = '';
            this.lastError = 'نشست واتس‌اپ از گوشی خارج شد (Logged Out). لطفاً مجدداً QR را اسکن کنید.';
            try {
              fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            } catch {}
          } else if (shouldReconnect) {
            this.status = 'connecting';
            this.lastError = `در حال اتصال مجدد (${errMessage})...`;
            this.reconnectTimer = setTimeout(() => {
              this.start().catch(() => {});
            }, 8000);
          } else {
            this.status = 'disconnected';
            if (errMessage) this.lastError = errMessage;
          }
        }
      });

      sock.ev.on('messages.upsert', async (event) => {
        if (!event || !Array.isArray(event.messages)) return;
        for (const msg of event.messages) {
          try {
            if (!msg.message) continue;
            const remoteJid = msg.key?.remoteJid || '';
            if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') {
              continue;
            }

            // Try phone from remoteJid or remoteJidAlt / participant
            let rawJid = remoteJid;
            if (remoteJid.endsWith('@lid') && msg.key?.remoteJidAlt) {
              rawJid = msg.key.remoteJidAlt;
            }
            const phone = waJidToIranPhone(rawJid);
            if (!config.isValidIranMobile(phone)) continue;

            const text =
              msg.message.conversation ||
              msg.message.extendedTextMessage?.text ||
              msg.message.imageMessage?.caption ||
              msg.message.videoMessage?.caption ||
              '';
            const cleanText = String(text || '').trim();
            if (!cleanText) continue;

            const msgId = msg.key?.id || '';

            if (msg.key?.fromMe) {
              // If this message was NOT sent by our bot/admin API, it means the admin typed directly from their phone!
              if (msgId && this.sentIds.has(msgId)) {
                continue;
              }
              this.emit('human_outbound', {
                channel: 'whatsapp',
                phone,
                text: cleanText,
                externalId: msgId,
              });
              continue;
            }

            if (event.type === 'notify' || event.type === 'append') {
              this.emit('inbound_message', {
                channel: 'whatsapp',
                phone,
                text: cleanText,
                pushName: msg.pushName || '',
                externalId: msgId,
              });
            }
          } catch (err) {
            console.error('[WhatsApp] Error handling inbound message:', err.message);
          }
        }
      });
    } catch (err) {
      this.status = 'error';
      this.lastError = err.message || 'خطا در راه‌اندازی واتس‌اپ';
      console.error('[WhatsApp] Start error:', err);
    }

    return this.getState();
  }

  async stop() {
    this.manualStop = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sock) {
      try {
        this.sock.end(new Error('Manual stop by admin'));
      } catch {}
      this.sock = null;
    }
    this.status = 'disconnected';
    this.qrDataUrl = '';
    return this.getState();
  }

  async logout() {
    await this.stop();
    try {
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
    } catch {}
    this.connectedPhone = '';
    this.connectedName = '';
    this.lastError = '';
    return this.getState();
  }

  async sendMessage(phone, text) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('واتس‌اپ متصل نیست. لطفاً ابتدا از بخش اتصالات، QR Code را اسکن کنید.');
    }
    const jid = iranPhoneToWaJid(phone);
    if (!jid) {
      throw new Error(`شماره موبایل نامعتبر برای واتس‌اپ: ${phone}`);
    }

    // Verify if number is registered on WhatsApp
    try {
      const results = await this.sock.onWhatsApp(jid);
      if (Array.isArray(results) && results.length > 0 && results[0].exists === false) {
        const notFoundErr = new Error('این شماره در واتس‌اپ حساب فعالی ندارد.');
        notFoundErr.code = 'NOT_ON_WHATSAPP';
        throw notFoundErr;
      }
    } catch (checkErr) {
      if (checkErr.code === 'NOT_ON_WHATSAPP') throw checkErr;
      // If onWhatsApp query times out, proceed with sendMessage attempt
    }

    // Simulate brief typing presence for natural anti-ban behavior
    try {
      await this.sock.presenceSubscribe(jid);
      await this.sock.sendPresenceUpdate('composing', jid);
      await new Promise((r) => setTimeout(r, 1200 + Math.floor(Math.random() * 1200)));
      await this.sock.sendPresenceUpdate('paused', jid);
    } catch {}

    const sent = await this.sock.sendMessage(jid, { text: String(text) });
    const msgId = sent?.key?.id || '';
    if (msgId) {
      this.sentIds.add(msgId);
      if (this.sentIds.size > 2000) {
        const first = this.sentIds.values().next().value;
        this.sentIds.delete(first);
      }
    }
    return { ok: true, externalId: msgId };
  }
}

module.exports = {
  WhatsAppClient,
  iranPhoneToWaJid,
  waJidToIranPhone,
};
