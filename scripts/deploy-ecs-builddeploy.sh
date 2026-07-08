#!/usr/bin/env bash
set -euo pipefail

# ChancePing Aliyun ECS BuildDeploy script
#
# Intended usage in Aliyun ECS "构建部署":
#   bash scripts/deploy-ecs-builddeploy.sh
#
# Run from the repository root after Aliyun pulls the Git source. This script
# intentionally does not read api.env and never writes API keys into the repo.

SOURCE_DIR="${CHANCEPING_SOURCE_DIR:-$(pwd)}"
APP_ROOT="${CHANCEPING_APP_ROOT:-/opt/chanceping}"
RELEASES_DIR="$APP_ROOT/releases"
SHARED_DIR="$APP_ROOT/shared"
CURRENT_LINK="$APP_ROOT/current"
ENV_DIR="/etc/chanceping"
ENV_FILE="$ENV_DIR/chanceping.env"
SERVICE_FILE="/etc/systemd/system/chanceping.service"
NGINX_SITE="/etc/nginx/sites-available/chanceping.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/chanceping.conf"

if [[ "$(id -u)" != "0" ]]; then
  echo "[chanceping] Please run as root. Aliyun ECS BuildDeploy should execute this script as root."
  exit 1
fi

if [[ ! -f "$SOURCE_DIR/package.json" || ! -d "$SOURCE_DIR/src" ]]; then
  echo "[chanceping] SOURCE_DIR does not look like the ChancePing repository root: $SOURCE_DIR"
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
release_dir="$RELEASES_DIR/$timestamp"

echo "[chanceping] source: $SOURCE_DIR"
echo "[chanceping] release: $release_dir"

apt-get update
apt-get install -y ca-certificates curl nginx rsync

node_major="0"
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
fi

if [[ "$node_major" -lt 20 ]]; then
  echo "[chanceping] installing Node.js 22 from NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "[chanceping] node: $(node -v)"
echo "[chanceping] npm: $(npm -v)"
npm config set registry "${CHANCEPING_NPM_REGISTRY:-https://registry.npmmirror.com}"
echo "[chanceping] npm registry: $(npm config get registry)"

mkdir -p "$RELEASES_DIR" "$SHARED_DIR/data" "$SHARED_DIR/reports" "$SHARED_DIR/exports" "$ENV_DIR"
mkdir -p "$release_dir"

rsync -a --delete \
  --exclude ".git/" \
  --exclude "node_modules/" \
  --exclude "api.env" \
  --exclude ".env" \
  --exclude ".env.local" \
  --exclude ".env.*.local" \
  --exclude "artifacts/" \
  --exclude ".superpowers/" \
  --exclude "ui-audit-*/" \
  --exclude "meili-data/" \
  --exclude ".DS_Store" \
  --exclude "*.log" \
  --exclude "e2e-real-search-log*.txt" \
  "$SOURCE_DIR/" "$release_dir/"

if [[ -d "$release_dir/data" ]]; then
  rsync -a --ignore-existing "$release_dir/data/" "$SHARED_DIR/data/"
fi
if [[ -d "$release_dir/reports" ]]; then
  rsync -a --ignore-existing "$release_dir/reports/" "$SHARED_DIR/reports/"
fi
if [[ -d "$release_dir/exports" ]]; then
  rsync -a --ignore-existing "$release_dir/exports/" "$SHARED_DIR/exports/"
fi

rm -rf "$release_dir/data" "$release_dir/reports" "$release_dir/exports"
ln -s "$SHARED_DIR/data" "$release_dir/data"
ln -s "$SHARED_DIR/reports" "$release_dir/reports"
ln -s "$SHARED_DIR/exports" "$release_dir/exports"

if [[ ! -f "$ENV_FILE" ]]; then
  cat >"$ENV_FILE" <<'EOF'
NODE_ENV=production
PORT=3000
DATA_MODE=mock
LLM_MODE=mock
STORE_TYPE=local

CHANCEPING_LLM_PROFILE=contest
CONTEST_LLM_PROVIDER=qwen
CONTEST_LLM_MODEL=
CONTEST_LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
CONTEST_LLM_API_KEY=
SERPER_API_KEY=

CHANCEPING_LOAD_API_ENV=false
CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=false
CHANCEPING_ENABLE_LOCAL_LIVE_LLM=false
SCHEDULER_ENABLED=false
NOTIFY_MOCK_MODE=true
PDF_EXPORT_ENABLED=false
CHANCEPING_RADAR_CHAT_STORE_PATH=data/radar-chat-windows.json
EOF
  chmod 600 "$ENV_FILE"
  echo "[chanceping] created safe env template: $ENV_FILE"
else
  echo "[chanceping] keeping existing env file: $ENV_FILE"
fi

cd "$release_dir"
npm ci --include=dev

if [[ "${CHANCEPING_SKIP_REMOTE_TYPECHECK:-false}" != "true" ]]; then
  npm run typecheck
fi

ln -sfn "$release_dir" "$CURRENT_LINK"

cat >"$SERVICE_FILE" <<'EOF'
[Unit]
Description=ChancePing MVP
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/chanceping/current
EnvironmentFile=/etc/chanceping/chanceping.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
User=root
Group=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable chanceping
systemctl restart chanceping

cat >"$NGINX_SITE" <<'EOF'
server {
    listen 80;
    server_name chanceping.com www.chanceping.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name aievents.chanceping.com;

    client_max_body_size 20m;

    location = / {
        proxy_pass http://127.0.0.1:3000/aievents;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sfn "$NGINX_SITE" "$NGINX_ENABLED"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "[chanceping] waiting for app health..."
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/health >/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS http://127.0.0.1:3000/health
echo
curl -fsSI http://127.0.0.1:3000/aievents | head -n 1

echo "[chanceping] ECS BuildDeploy completed."
echo "[chanceping] current release: $release_dir"
echo "[chanceping] service logs: journalctl -u chanceping -n 120 --no-pager"
echo "[chanceping] env file: $ENV_FILE"
