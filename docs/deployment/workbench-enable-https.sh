#!/usr/bin/env bash
set -euo pipefail

# Run after DNS for all domains points to the ECS public IP:
#   chanceping.com
#   www.chanceping.com
#   aievents.chanceping.com
#   fuli.chanceping.com

EMAIL="${1:-sunny251610056@gmail.com}"

if [[ "$(id -u)" != "0" ]]; then
  echo "[chanceping] Please run as root."
  exit 1
fi

apt-get update
apt-get install -y certbot python3-certbot-nginx

certbot --nginx \
  --expand \
  -d chanceping.com \
  -d www.chanceping.com \
  -d aievents.chanceping.com \
  -d fuli.chanceping.com \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive \
  --redirect

certbot renew --dry-run
systemctl reload nginx

echo "[chanceping] HTTPS enabled for chanceping.com, www.chanceping.com, aievents.chanceping.com, fuli.chanceping.com"
