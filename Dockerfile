FROM node:24-slim

WORKDIR /app

# Layer 1: Lightweight Python CV dependencies (cached separately)
RUN set -e; \
    APT_OPTS="-o Acquire::ForceIPv4=true -o Acquire::http::Timeout=20 -o Acquire::Retries=3"; \
    apt-get $APT_OPTS update && \
    apt-get $APT_OPTS install -y --no-install-recommends python3 python3-numpy python3-pil && \
    rm -rf /var/lib/apt/lists/*

# Layer 2: Chromium headless WebGL runtime (cached separately so code pushes stay <20s)
RUN set -e; \
    APT_OPTS="-o Acquire::ForceIPv4=true -o Acquire::http::Timeout=30 -o Acquire::Retries=5"; \
    apt-get $APT_OPTS update && \
    apt-get $APT_OPTS install -y --no-install-recommends chromium && \
    rm -rf /var/lib/apt/lists/*

# Layer 3: Xray-core for direct vless:// WhatsApp proxy support
RUN set -e; \
    APT_OPTS="-o Acquire::ForceIPv4=true -o Acquire::http::Timeout=30 -o Acquire::Retries=5"; \
    apt-get $APT_OPTS update && \
    apt-get $APT_OPTS install -y --no-install-recommends curl unzip ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    ARCH=$(uname -m); \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then XRAY_FILE="Xray-linux-arm64-v8a.zip"; else XRAY_FILE="Xray-linux-64.zip"; fi; \
    curl -fL --retry 3 --connect-timeout 20 -o /tmp/xray.zip "https://github.com/XTLS/Xray-core/releases/latest/download/${XRAY_FILE}" && \
    unzip -o /tmp/xray.zip xray -d /usr/local/bin && \
    chmod +x /usr/local/bin/xray && \
    rm -f /tmp/xray.zip && \
    xray version

ENV CHROME_PATH=/usr/bin/chromium

# Create persistent directories
RUN mkdir -p /app/data /app/uploads /app/uploads/renders /app/uploads/glb

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
