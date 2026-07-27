#!/usr/bin/env bash
set -euo pipefail

# ChancePing Workbench installer
#
# Usage on Aliyun Workbench:
#   bash /tmp/chanceping-workbench-install.sh /tmp/chanceping-workbench-YYYYMMDD-HHMMSS.tar.gz
#
# This script intentionally does not contain API keys. It creates
# /etc/chanceping/chanceping.env with safe defaults if the file does not exist.

PACKAGE_PATH="${1:-}"
APP_ROOT="${CHANCEPING_APP_ROOT:-/opt/chanceping}"
RELEASES_DIR="$APP_ROOT/releases"
SHARED_DIR="$APP_ROOT/shared"
CURRENT_LINK="$APP_ROOT/current"
ENV_DIR="/etc/chanceping"
ENV_FILE="$ENV_DIR/chanceping.env"
WELFARE_DIR="/var/lib/chanceping/welfare"
SERVICE_FILE="/etc/systemd/system/chanceping.service"
WELFARE_SERVICE_FILE="/etc/systemd/system/chanceping-welfare-update.service"
WELFARE_TIMER_FILE="/etc/systemd/system/chanceping-welfare-update.timer"
NGINX_SITE="/etc/nginx/sites-available/chanceping.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/chanceping.conf"

if [[ "$(id -u)" != "0" ]]; then
  echo "[chanceping] Please run as root."
  exit 1
fi

if [[ -z "$PACKAGE_PATH" || ! -f "$PACKAGE_PATH" ]]; then
  echo "[chanceping] Usage: bash $0 /path/to/chanceping-workbench-*.tar.gz"
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
release_dir="$RELEASES_DIR/$timestamp"

echo "[chanceping] package: $PACKAGE_PATH"
echo "[chanceping] release: $release_dir"

apt-get update
apt-get install -y ca-certificates curl gnutls-bin nginx rsync

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
tar -xzf "$PACKAGE_PATH" -C "$RELEASES_DIR"

extracted_dir="$(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -name 'chanceping-workbench-*' | sort | tail -n 1)"
if [[ -z "$extracted_dir" || ! -d "$extracted_dir" ]]; then
  echo "[chanceping] Could not find extracted chanceping-workbench-* directory."
  exit 1
fi

mv "$extracted_dir" "$release_dir"

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

ensure_env_setting() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" "$ENV_FILE"; then
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}
ensure_env_setting CHANCEPING_WELFARE_STORE_PATH "$WELFARE_DIR/opportunities.json"
ensure_env_setting CHANCEPING_WELFARE_CANDIDATE_PATH "$WELFARE_DIR/candidates.json"
ensure_env_setting CHANCEPING_WELFARE_RUN_SUMMARY_PATH "$WELFARE_DIR/run-summary.json"
ensure_env_setting CHANCEPING_WELFARE_EVIDENCE_DIR "$WELFARE_DIR/evidence"

cd "$release_dir"
npm ci --include=dev

if [[ "${CHANCEPING_SKIP_REMOTE_TYPECHECK:-false}" != "true" ]]; then
  npm run typecheck
fi

ln -sfn "$release_dir" "$CURRENT_LINK"
install -d -m 0755 -o root -g root "$WELFARE_DIR"
CHANCEPING_WELFARE_RUNTIME_DIR="$WELFARE_DIR" npm run welfare:migrate-storage
install -m 0644 "$release_dir/docs/deployment/chanceping-welfare-update.service" "$WELFARE_SERVICE_FILE"
install -m 0644 "$release_dir/docs/deployment/chanceping-welfare-update.timer" "$WELFARE_TIMER_FILE"

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
systemctl enable --now chanceping-welfare-update.timer
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

server {
    listen 80;
    server_name fuli.chanceping.com;

    client_max_body_size 20m;

    location = / {
        proxy_pass http://127.0.0.1:3000/fuli;
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
curl -fsSI http://127.0.0.1:3000/fuli | head -n 1

echo "[chanceping] deployed."
echo "[chanceping] service logs: journalctl -u chanceping -n 120 --no-pager"
echo "[chanceping] env file: $ENV_FILE"
echo "[chanceping] nginx site: $NGINX_SITE"
