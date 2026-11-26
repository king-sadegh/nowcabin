const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
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

/**
 * Parses a standard vless://URI into an Xray-core JSON configuration
 * exposing a local SOCKS5 proxy at 127.0.0.1:10808.
 */
function parseVlessUriToXrayConfig(vlessUri, localPort = LOCAL_SOCKS_PORT) {
  const raw = String(vlessUri || '').trim();
  if (!raw.toLowerCase().startsWith('vless://')) {
    throw new Error('لینک پروکسی باید با vless:// شروع شود.');
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('فرمت لینک VLESS معتبر نیست.');
  }

  const uuid = decodeURIComponent(parsed.username || '').trim();
  const address = parsed.hostname;
  const port = Number(parsed.port || 443);
  const params = parsed.searchParams;

  if (!uuid || !address || !port) {
    throw new Error('لینک VLESS ناقص است (UUID، آدرس سرور یا پورت یافت نشد).');
  }

  const network = (params.get('type') || 'tcp').toLowerCase();
  const security = (params.get('security') || 'none').toLowerCase();
  const encryption = params.get('encryption') || 'none';
  const flow = params.get('flow') || '';
  const hostHeader = params.get('host') || '';
  const sni = params.get('sni') || hostHeader || address;
  const fp = params.get('fp') || '';
  const alpnRaw = params.get('alpn') || '';
  const allowInsecure = params.get('allowInsecure') === '1' || params.get('insecure') === '1';

  const userObj = {
    id: uuid,
    encryption,
  };
  if (flow) {
    userObj.flow = flow;
  }

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
      throw new Error('لینک VLESS Reality فاقد پارامتر pbk (Public Key) است.');
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

  return {
    meta: {
      address,
      port,
      network,
      security,
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
        {
          tag: 'vless-out',
          protocol: 'vless',
          settings: {
            vnext: [
              {
                address,
                port,
                users: [userObj],
              },
            ],
          },
          streamSettings,
        },
        {
          tag: 'direct',
          protocol: 'freedom',
        },
      ],
    },
  };
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 4000) {
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

class VlessTunnelManager {
  constructor() {
    this.proc = null;
    this.activeUri = '';
    this.status = 'stopped'; // stopped | starting | running | error
    this.meta = null;
    this.lastError = '';
  }

  getState() {
    return {
      status: this.status,
      localProxyUrl: this.status === 'running' ? `socks5://127.0.0.1:${LOCAL_SOCKS_PORT}` : '',
      serverAddress: this.meta?.address || '',
      serverPort: this.meta?.port || null,
      security: this.meta?.security || '',
      network: this.meta?.network || '',
      lastError: this.lastError,
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
   * - vless:// -> starts local Xray SOCKS5 tunnel and returns socks5://127.0.0.1:10808
   */
  async resolveProxyUrl(rawProxy) {
    const val = String(rawProxy || '').trim();
    if (!val) {
      await this.stop();
      return '';
    }

    if (!val.toLowerCase().startsWith('vless://')) {
      await this.stop();
      return val;
    }

    if (this.proc && this.status === 'running' && this.activeUri === val) {
      return `socks5://127.0.0.1:${LOCAL_SOCKS_PORT}`;
    }

    await this.stop();
    this.status = 'starting';
    this.lastError = '';

    const { meta, xrayConfig } = parseVlessUriToXrayConfig(val, LOCAL_SOCKS_PORT);
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
      throw new Error(`خطا در راه‌اندازی تونل VLESS: ${this.lastError}`);
    }
  }
}

const vlessTunnel = new VlessTunnelManager();

module.exports = {
  vlessTunnel,
  parseVlessUriToXrayConfig,
};
