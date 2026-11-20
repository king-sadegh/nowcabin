FROM node:24-slim

WORKDIR /app

# Install Python CV deps (numpy, pillow) + Chromium headless WebGL runtime
# Force IPv4 + 15s socket timeout + automatic fallback to Iranian mirror if deb.debian.org stalls
RUN set -e; \
    APT_OPTS="-o Acquire::ForceIPv4=true -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15 -o Acquire::Retries=2"; \
    install_deps() { \
      apt-get $APT_OPTS update && \
      apt-get $APT_OPTS install -y --no-install-recommends python3 python3-numpy python3-pil chromium; \
    }; \
    if ! install_deps; then \
      echo "Default Debian repo stalled/failed, switching to Iranian mirror (mirror.arvancloud.ir)..."; \
      find /etc/apt -type f \( -name '*.list' -o -name '*.sources' \) -exec sed -i 's|deb.debian.org|mirror.arvancloud.ir|g; s|security.debian.org|mirror.arvancloud.ir|g' {} +; \
      apt-get $APT_OPTS update && \
      apt-get $APT_OPTS install -y --no-install-recommends python3 python3-numpy python3-pil chromium; \
    fi; \
    rm -rf /var/lib/apt/lists/*

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
