const fs = require('fs');
const net = require('net');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('../config');

const LOCAL_SOCKS_PORT = 10808;
const XRAY_CONFIG_PATH = path.join(config.DATA_DIR, 'xray_vless.json');

function findXrayBinary() {
  const candidates = [
    process.env.XRAY_PATH,
    '/usr/local/bin/xray',
    '/usr/bin/xray',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'xray';
}

function buildStreamSettings(params, address, defaultSecurity = 'none') {
  const network = (params.get('type') || 'tcp').toLowerCase();
  const security = (params.get('security') || defaultSecurity).toLowerCase();
  const hostHeader = params.get('host') || '';
  const sni = params.get('sni') || hostHeader || address;
  const fp = params.get('fp') || '';
  const alpnRaw = params.get('alpn') || '';
  const allowInsecure = params.get('allowInsecure') === '1' || params.get('insecure') === '1';

  const streamSettings = {
    network,
    security,
  };

  if (security === 'tls') {
    const tlsSettings = {
      serverName: sni,
      allowInsecure,
    };
    if (fp) tlsSettings.fingerprint = fp;
    if (alpnRaw) {
      tlsSettings.alpn = alpnRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    streamSettings.tlsSettings = tlsSettings;
  } else if (security === 'reality') {
    const pbk = params.get('pbk') || '';
    const sid = params.get('sid') || '';
    const spx = params.get('spx') || '/';
    if (!pbk) {
      throw new Error('لینک Reality فاقد پارامتر pbk (Public Key) است.');
    }
    streamSettings.realitySettings = {
      serverName: sni,
      fingerprint: fp || 'chrome',
      publicKey: pbk,
      shortId: sid,
      spiderX: spx,
    };
  }

  if (network === 'ws') {
    const wsPath = params.get('path') || '/';
    streamSettings.wsSettings = {
      path: wsPath,
      ...(hostHeader ? { headers: { Host: hostHeader } } : {}),
    };
  } else if (network === 'grpc') {
    const serviceName = params.get('serviceName') || '';
    const mode = params.get('mode') || 'gun';
    streamSettings.grpcSettings = {
      serviceName,
      multiMode: mode === 'multi',
    };
  } else if (network === 'httpupgrade') {
    streamSettings.httpupgradeSettings = {
      path: params.get('path') || '/',
      ...(hostHeader ? { host: hostHeader } : {}),
    };
  } else if (network === 'xhttp' || network === 'splithttp') {
    streamSettings.network = 'xhttp';
    streamSettings.xhttpSettings = {
      path: params.get('path') || '/',
      ...(hostHeader ? { host: hostHeader } : {}),
    };
  } else if (network === 'tcp' && params.get('headerType') === 'http') {
    streamSettings.tcpSettings = {
      header: {
        type: 'http',
        request: {
          version: '1.1',
          method: 'GET',
          path: [params.get('path') || '/'],
          headers: hostHeader ? { Host: [hostHeader] } : {},
        },
      },
    };
  }

  return streamSettings;
}

/**
 * Parses a standard vless:// or trojan:// URI into an Xray-core JSON configuration
 * exposing a local SOCKS5 proxy at 127.0.0.1:10808.
 */
function parseProxyUriToXrayConfig(uri, localPort = LOCAL_SOCKS_PORT) {
  const raw = String(uri || '').trim();
  const lower = raw.toLowerCase();
  const isVless = lower.startsWith('vless://');
  const isTrojan = lower.startsWith('trojan://');

  if (!isVless && !isTrojan) {
    throw new Error('لینک پروکسی باید با vless:// یا trojan:// شروع شود.');
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('فرمت لینک پروکسی معتبر نیست.');
  }

  const secret = decodeURIComponent(parsed.username || '').trim();
  const address = parsed.hostname;
  const port = Number(parsed.port || 443);
  const params = parsed.searchParams;

  if (!secret || !address || !port) {
    throw new Error('لینک پروکسی ناقص است (شناسه/رمز، آدرس سرور یا پورت یافت نشد).');
  }

  const streamSettings = buildStreamSettings(params, address, isTrojan ? 'tls' : 'none');

  let outbound;
  if (isVless) {
    const encryption = params.get('encryption') || 'none';
    const flow = params.get('flow') || '';
    const userObj = { id: secret, encryption };
    if (flow) userObj.flow = flow;

    outbound = {
      tag: 'proxy-out',
      protocol: 'vless',
      settings: {
        vnext: [{ address, port, users: [userObj] }],
      },
      streamSettings,
    };
  } else {
    outbound = {
      tag: 'proxy-out',
      protocol: 'trojan',
      settings: {
        servers: [{ address, port, password: secret }],
      },
      streamSettings,
    };
  }

  return {
    meta: {
      protocol: isVless ? 'vless' : 'trojan',
      address,
      port,
      network: streamSettings.network,
      security: streamSettings.security,
      remark: decodeURIComponent((parsed.hash || '').replace(/^#/, '')),
    },
    xrayConfig: {
      log: { loglevel: 'warning' },
      inbounds: [
        {
          tag: 'socks-in',
          listen: '127.0.0.1',
          port: localPort,
          protocol: 'socks',
          settings: {
            auth: 'noauth',
            udp: true,
          },
        },
      ],
      outbounds: [
        outbound,
        {
          tag: 'direct',
          protocol: 'freedom',
        },
      ],
    },
  };
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 4500) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ port, host });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started >= timeoutMs) {
          reject(new Error(`پورت محلی Xray (${port}) باز نشد.`));
        } else {
          setTimeout(tryConnect, 150);
        }
      });
    };
    tryConnect();
  });
}

function requestWithAgent(targetUrl, agent, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      targetUrl,
      {
        method: 'GET',
        agent,
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json, text/html, */*',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          if (body.length < 16384) body += chunk.toString('utf8');
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode || 0, body });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}

class VlessTunnelManager {
  constructor() {
    this.proc = null;
    this.activeUri = '';
    this.status = 'stopped'; // stopped | starting | running | error
    this.meta = null;
    this.lastError = '';
    this.lastTestResult = null;
  }

  getState() {
    return {
      status: this.status,
      localProxyUrl: this.status === 'running' ? `socks5://127.0.0.1:${LOCAL_SOCKS_PORT}` : '',
      protocol: this.meta?.protocol || '',
      serverAddress: this.meta?.address || '',
      serverPort: this.meta?.port || null,
      security: this.meta?.security || '',
      network: this.meta?.network || '',
      lastError: this.lastError,
      lastTestResult: this.lastTestResult,
    };
  }

  async stop() {
    if (this.proc) {
      try {
        this.proc.kill('SIGTERM');
      } catch {}
      this.proc = null;
    }
    this.activeUri = '';
    this.status = 'stopped';
    this.meta = null;
  }

  /**
   * Resolves any user-provided proxy string:
   * - empty -> stops tunnel and returns ''
   * - socks5:// or http:// or https:// -> stops tunnel and returns as-is
   * - vless:// or trojan:// -> starts local Xray SOCKS5 tunnel and returns socks5://127.0.0.1:10808
   */
  async resolveProxyUrl(rawProxy) {
    const val = String(rawProxy || '').trim();
    if (!val) {
      await this.stop();
      return '';
    }

    const lower = val.toLowerCase();
    if (!lower.startsWith('vless://') && !lower.startsWith('trojan://')) {
      await this.stop();
      return val;
    }

    if (this.proc && this.status === 'running' && this.activeUri === val) {
      return `socks5://127.0.0.1:${LOCAL_SOCKS_PORT}`;
    }

    await this.stop();
    this.status = 'starting';
    this.lastError = '';

    const { meta, xrayConfig } = parseProxyUriToXrayConfig(val, LOCAL_SOCKS_PORT);
    this.meta = meta;

    fs.mkdirSync(config.DATA_DIR, { recursive: true });
    fs.writeFileSync(XRAY_CONFIG_PATH, JSON.stringify(xrayConfig, null, 2), 'utf8');

    const xrayBin = findXrayBinary();
    const proc = spawn(xrayBin, ['run', '-c', XRAY_CONFIG_PATH], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.proc = proc;
    this.activeUri = val;

    let stderrBuf = '';
    proc.stderr.on('data', (chunk) => {
      stderrBuf = (stderrBuf + chunk.toString('utf8')).slice(-1000);
    });

    proc.on('exit', (code) => {
      if (this.proc === proc) {
        this.proc = null;
        if (this.status !== 'stopped') {
          this.status = 'error';
          this.lastError = stderrBuf.trim() || `هسته Xray با کد ${code} متوقف شد.`;
        }
      }
    });

    proc.on('error', (err) => {
      if (this.proc === proc) {
        this.proc = null;
        this.status = 'error';
        this.lastError =
          err.code === 'ENOENT'
            ? 'فایل اجرایی xray روی سرور یافت نشد. لطفاً صبر کنید تا بیلد داکر تکمیل شود.'
            : err.message;
      }
    });

    try {
      await waitForPort(LOCAL_SOCKS_PORT, '127.0.0.1', 4500);
      this.status = 'running';
      return `socks5://127.0.0.1:${LOCAL_SOCKS_PORT}`;
    } catch (err) {
      this.status = 'error';
      this.lastError = stderrBuf.trim() || err.message;
      throw new Error(`خطا در راه‌اندازی تونل پروکسی: ${this.lastError}`);
    }
  }

  /**
   * Tests the active/provided proxy by checking:
   * 1. Exit IP, Country, City, ISP
   * 2. Reachability & latency to web.whatsapp.com
   */
  async testProxy(rawProxy) {
    const resolved = await this.resolveProxyUrl(rawProxy);
    const agent = resolved
      ? resolved.startsWith('socks')
        ? new SocksProxyAgent(resolved)
        : new HttpsProxyAgent(resolved)
      : undefined;

    const result = {
      ok: false,
      testedAt: new Date().toISOString(),
      hasProxy: Boolean(resolved),
      exitIp: '',
      country: '',
      countryCode: '',
      city: '',
      isp: '',
      whatsappReachable: false,
      whatsappStatus: 0,
      latencyMs: null,
      error: '',
    };

    try {
      const t0 = Date.now();
      // Check exit IP & country via ip-api.com (fast JSON) with fallback to ipapi.co
      try {
        const ipRes = await requestWithAgent(
          'http://ip-api.com/json/?fields=status,country,countryCode,city,isp,query',
          agent,
          8000
        );
        const parsed = JSON.parse(ipRes.body || '{}');
        if (parsed.status === 'success') {
          result.exitIp = parsed.query || '';
          result.country = parsed.country || '';
          result.countryCode = parsed.countryCode || '';
          result.city = parsed.city || '';
          result.isp = parsed.isp || '';
        }
      } catch {
        try {
          const ipRes2 = await requestWithAgent('https://ipapi.co/json/', agent, 8000);
          const parsed2 = JSON.parse(ipRes2.body || '{}');
          result.exitIp = parsed2.ip || '';
          result.country = parsed2.country_name || '';
          result.countryCode = parsed2.country_code || '';
          result.city = parsed2.city || '';
          result.isp = parsed2.org || '';
        } catch {}
      }

      // Check web.whatsapp.com reachability through the proxy
      const waRes = await requestWithAgent('https://web.whatsapp.com/', agent, 9000);
      result.latencyMs = Date.now() - t0;
      result.whatsappStatus = waRes.statusCode;
      result.whatsappReachable = waRes.statusCode >= 200 && waRes.statusCode < 500;
      result.ok = result.whatsappReachable;
    } catch (err) {
      result.error = err.message || 'خطا در تست اتصال پروکسی';
    }

    this.lastTestResult = result;
    return result;
  }
}

const vlessTunnel = new VlessTunnelManager();

module.exports = {
  vlessTunnel,
  parseProxyUriToXrayConfig,
  parseVlessUriToXrayConfig: parseProxyUriToXrayConfig,
};
