#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy one immutable Git commit into a versioned release directory, switch the
# current symlink atomically, and roll back automatically when health fails.

DEPLOY_REF="${1:-}"
APP_ROOT="${CHANCEPING_APP_ROOT:-/opt/chanceping}"
REPO_DIR="${CHANCEPING_SERVER_REPO_DIR:-$APP_ROOT}"
RELEASES_DIR="$APP_ROOT/releases"
SHARED_DIR="$APP_ROOT/shared"
CURRENT_LINK="$APP_ROOT/current"
SERVICE_NAME="${CHANCEPING_SERVICE_NAME:-chanceping}"
HEALTH_URL="${CHANCEPING_HEALTH_URL:-http://127.0.0.1:3000/health}"
HEALTH_ATTEMPTS="${CHANCEPING_HEALTH_ATTEMPTS:-30}"
HEALTH_INTERVAL_SECONDS="${CHANCEPING_HEALTH_INTERVAL_SECONDS:-1}"
NPM_REGISTRY="${CHANCEPING_NPM_REGISTRY:-https://registry.npmmirror.com}"
SYSTEMCTL_BIN="${CHANCEPING_SYSTEMCTL_BIN:-systemctl}"
CURL_BIN="${CHANCEPING_CURL_BIN:-curl}"
NPM_BIN="${CHANCEPING_NPM_BIN:-npm}"
GIT_BIN="${CHANCEPING_GIT_BIN:-git}"
NODE_BIN="${CHANCEPING_NODE_BIN:-node}"

if [[ -z "$DEPLOY_REF" ]]; then
  echo "Usage: $0 <git-commit-or-ref>" >&2
  exit 2
fi

if [[ "$(id -u)" != "0" && "${CHANCEPING_ALLOW_NON_ROOT_FOR_TESTS:-false}" != "true" ]]; then
  echo "[chanceping] release deployment must run as root" >&2
  exit 3
fi

if [[ ! "$HEALTH_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "[chanceping] CHANCEPING_HEALTH_ATTEMPTS must be a positive integer" >&2
  exit 4
fi

if [[ ! -d "$REPO_DIR/.git" && ! -f "$REPO_DIR/.git" ]]; then
  echo "[chanceping] server Git repository not found: $REPO_DIR" >&2
  exit 5
fi

commit="$($GIT_BIN -C "$REPO_DIR" rev-parse --verify "${DEPLOY_REF}^{commit}")"
short_commit="$($GIT_BIN -C "$REPO_DIR" rev-parse --short=12 "$commit")"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
release_id="${timestamp}-${short_commit}"
incoming_dir="$RELEASES_DIR/.incoming-${release_id}"
release_dir="$RELEASES_DIR/$release_id"
next_link="$APP_ROOT/.current-${release_id}"
manifest_path="$release_dir/release-manifest.json"
active_manifest="$APP_ROOT/release-manifest.json"
previous_release=""
switched=false

if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
  echo "[chanceping] refusing to replace non-symlink current path: $CURRENT_LINK" >&2
  exit 6
fi
if [[ -L "$CURRENT_LINK" ]]; then
  previous_release="$(readlink -f "$CURRENT_LINK" || true)"
fi

cleanup_incoming() {
  if [[ -d "$incoming_dir" ]]; then
    rm -rf -- "$incoming_dir"
  fi
  rm -f -- "$next_link"
}

replace_current_link() {
  local target="$1"
  LINK_TARGET="$target" LINK_PATH="$CURRENT_LINK" NEXT_LINK="$next_link" "$NODE_BIN" <<'NODE'
const fs = require("fs");
for (const path of [process.env.NEXT_LINK]) {
  try { fs.unlinkSync(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
fs.symlinkSync(process.env.LINK_TARGET, process.env.NEXT_LINK);
fs.renameSync(process.env.NEXT_LINK, process.env.LINK_PATH);
NODE
}

rollback_on_error() {
  local exit_code=$?
  trap - ERR
  if [[ "$switched" == "true" ]]; then
    echo "[chanceping] health check failed; rolling back to ${previous_release:-no previous release}" >&2
    if [[ -n "$previous_release" && -d "$previous_release" ]]; then
      replace_current_link "$previous_release"
      "$SYSTEMCTL_BIN" restart "$SERVICE_NAME" || true
    else
      rm -f -- "$CURRENT_LINK"
      "$SYSTEMCTL_BIN" stop "$SERVICE_NAME" || true
    fi
  fi
  cleanup_incoming
  exit "$exit_code"
}
trap rollback_on_error ERR
trap cleanup_incoming EXIT

echo "[chanceping] preparing release $release_id from $commit"
mkdir -p "$RELEASES_DIR" "$SHARED_DIR/data" "$SHARED_DIR/reports" "$SHARED_DIR/exports"
mkdir "$incoming_dir"
"$GIT_BIN" -C "$REPO_DIR" archive --format=tar "$commit" | tar -x -C "$incoming_dir"

for persistent_dir in data reports exports; do
  if [[ -d "$incoming_dir/$persistent_dir" ]]; then
    rsync -a --ignore-existing "$incoming_dir/$persistent_dir/" "$SHARED_DIR/$persistent_dir/"
  fi
  rm -rf -- "$incoming_dir/$persistent_dir"
  ln -s "$SHARED_DIR/$persistent_dir" "$incoming_dir/$persistent_dir"
done

cd "$incoming_dir"
"$NPM_BIN" config set registry "$NPM_REGISTRY"
"$NPM_BIN" ci --include=dev --no-audit --no-fund
if [[ "${CHANCEPING_SKIP_REMOTE_TYPECHECK:-false}" != "true" ]]; then
  "$NPM_BIN" run typecheck
fi

RELEASE_COMMIT="$commit" \
RELEASE_ID="$release_id" \
RELEASE_REF="$DEPLOY_REF" \
RELEASE_PREVIOUS="$previous_release" \
RELEASE_CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
"$NODE_BIN" <<'NODE'
const fs = require("fs");
const manifest = {
  schemaVersion: 1,
  releaseId: process.env.RELEASE_ID,
  commit: process.env.RELEASE_COMMIT,
  ref: process.env.RELEASE_REF,
  createdAt: process.env.RELEASE_CREATED_AT,
  previousRelease: process.env.RELEASE_PREVIOUS || null,
  status: "prepared",
};
fs.writeFileSync("release-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
NODE

mv "$incoming_dir" "$release_dir"
replace_current_link "$release_dir"
switched=true

"$SYSTEMCTL_BIN" restart "$SERVICE_NAME"
healthy=false
for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1)); do
  if "$CURL_BIN" -fsS --max-time 5 "$HEALTH_URL" >/dev/null; then
    healthy=true
    break
  fi
  sleep "$HEALTH_INTERVAL_SECONDS"
done
if [[ "$healthy" != "true" ]]; then
  echo "[chanceping] release $release_id did not become healthy" >&2
  false
fi

MANIFEST_PATH="$manifest_path" "$NODE_BIN" <<'NODE'
const fs = require("fs");
const file = process.env.MANIFEST_PATH;
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.status = "healthy";
manifest.verifiedAt = new Date().toISOString();
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
NODE
cp "$manifest_path" "$active_manifest.tmp"
mv -f "$active_manifest.tmp" "$active_manifest"

switched=false
trap - ERR
echo "[chanceping] deployed release $release_id"
echo "[chanceping] commit: $commit"
echo "[chanceping] previous: ${previous_release:-none}"
echo "[chanceping] manifest: $active_manifest"
