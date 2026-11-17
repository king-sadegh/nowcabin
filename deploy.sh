#!/usr/bin/env bash
set -euo pipefail

echo "=== NoKabin VPS Setup & Deploy Script ==="

# 1. Install git/curl only if missing
if ! command -v curl >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y && apt-get install -y curl git ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y curl git ca-certificates
  elif command -v yum >/dev/null 2>&1; then
    yum install -y curl git ca-certificates
  fi
fi

# 2. Install Docker if not present
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

# 2.5. Configure Iranian Docker Hub mirrors if not already configured (prevents 403 Forbidden on Iran VPS)
if [ ! -f /etc/docker/daemon.json ] || ! grep -q "registry-mirrors" /etc/docker/daemon.json 2>/dev/null; then
  echo "Configuring Docker Hub mirror (ArvanCloud / Iran)..."
  mkdir -p /etc/docker
  cat <<'EOF' > /etc/docker/daemon.json
{
  "registry-mirrors": [
    "https://docker.arvancloud.ir",
    "https://docker.haiocloud.com"
  ]
}
EOF
  systemctl restart docker
fi

# Pre-pull base image via daemon mirror so docker build won't hit registry-1.docker.io 403
if ! docker image inspect node:24-slim >/dev/null 2>&1; then
  echo "Pulling node:24-slim via mirror..."
  if ! docker pull node:24-slim; then
    docker pull docker.arvancloud.ir/library/node:24-slim
    docker tag docker.arvancloud.ir/library/node:24-slim node:24-slim
  fi
fi

# 3. Prepare .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  RAND_SECRET=$(openssl rand -hex 32 2>/dev/null || date +%s%N | sha256sum | cut -c1-64)
  sed -i "s|change-this-to-a-long-random-secret-key-in-production|$RAND_SECRET|g" .env
  echo ".env created with a fresh random APP_SECRET."
fi

mkdir -p data uploads

# 4. Build and launch Docker container using cached base image
export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0

if docker compose version >/dev/null 2>&1; then
  docker compose up -d --build
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose up -d --build
else
  echo "ERROR: Neither 'docker compose' nor 'docker-compose' was found."
  exit 1
fi

echo ""
echo "=== NoKabin is running on http://$(hostname -I | awk '{print $1}'):3000 ==="
echo "Check status: docker compose ps"
echo "View logs:    docker compose logs -f"
