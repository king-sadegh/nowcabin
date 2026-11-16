#!/usr/bin/env bash
set -euo pipefail

echo "=== NoKabin VPS Setup & Deploy Script ==="

# 1. Update packages & install git/curl if needed
apt-get update -y
apt-get install -y curl git ca-certificates

# 2. Install Docker & Docker Compose plugin if not present
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

# 3. Prepare .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  RAND_SECRET=$(openssl rand -hex 32 2>/dev/null || date +%s%N | sha256sum | cut -c1-64)
  sed -i "s|change-this-to-a-long-random-secret-key-in-production|$RAND_SECRET|g" .env
  echo ".env created with a fresh random APP_SECRET."
fi

mkdir -p data uploads

# 4. Build and launch Docker container
docker compose up -d --build

echo ""
echo "=== NoKabin is running on http://$(hostname -I | awk '{print $1}'):3000 ==="
echo "Check status: docker compose ps"
echo "View logs:    docker compose logs -f"
