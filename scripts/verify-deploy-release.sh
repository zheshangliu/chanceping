#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/chanceping-release-test.XXXXXX")"
trap 'rm -rf -- "$TEST_ROOT"' EXIT

REPO_DIR="$TEST_ROOT/repo"
APP_ROOT="$TEST_ROOT/app"
BIN_DIR="$TEST_ROOT/bin"
mkdir -p "$REPO_DIR/scripts" "$REPO_DIR/data" "$REPO_DIR/reports" "$REPO_DIR/exports" "$BIN_DIR"

cp "$ROOT_DIR/scripts/deploy-release.sh" "$REPO_DIR/scripts/deploy-release.sh"
printf '{"name":"release-fixture","version":"1.0.0","scripts":{"typecheck":"true"}}\n' >"$REPO_DIR/package.json"
printf '{"name":"release-fixture","version":"1.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"release-fixture","version":"1.0.0"}}}\n' >"$REPO_DIR/package-lock.json"
printf 'seed-v1\n' >"$REPO_DIR/data/seed.txt"

git -C "$REPO_DIR" init -q
git -C "$REPO_DIR" config user.name "ChancePing Release Test"
git -C "$REPO_DIR" config user.email "release-test@chanceping.invalid"
git -C "$REPO_DIR" add package.json package-lock.json scripts/deploy-release.sh data/seed.txt
git -C "$REPO_DIR" commit -qm "release one"
first_commit="$(git -C "$REPO_DIR" rev-parse HEAD)"

cat >"$BIN_DIR/npm" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"$BIN_DIR/systemctl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$CHANCEPING_TEST_SYSTEMCTL_LOG"
exit 0
EOF
cat >"$BIN_DIR/curl" <<'EOF'
#!/usr/bin/env bash
if [[ "${CHANCEPING_TEST_HEALTH:-pass}" == "pass" ]]; then exit 0; fi
exit 22
EOF
chmod +x "$BIN_DIR/npm" "$BIN_DIR/systemctl" "$BIN_DIR/curl"
export CHANCEPING_TEST_SYSTEMCTL_LOG="$TEST_ROOT/systemctl.log"

run_deploy() {
  CHANCEPING_ALLOW_NON_ROOT_FOR_TESTS=true \
  CHANCEPING_APP_ROOT="$APP_ROOT" \
  CHANCEPING_SERVER_REPO_DIR="$REPO_DIR" \
  CHANCEPING_NPM_BIN="$BIN_DIR/npm" \
  CHANCEPING_SYSTEMCTL_BIN="$BIN_DIR/systemctl" \
  CHANCEPING_CURL_BIN="$BIN_DIR/curl" \
  CHANCEPING_HEALTH_ATTEMPTS=1 \
  CHANCEPING_HEALTH_INTERVAL_SECONDS=0 \
  bash "$ROOT_DIR/scripts/deploy-release.sh" "$1"
}

CHANCEPING_TEST_HEALTH=pass run_deploy "$first_commit"
first_release="$(readlink "$APP_ROOT/current")"
test -d "$first_release"
test -L "$first_release/data"
test "$(cat "$APP_ROOT/shared/data/seed.txt")" = "seed-v1"
grep -q "\"commit\": \"$first_commit\"" "$APP_ROOT/release-manifest.json"
grep -q '"status": "healthy"' "$APP_ROOT/release-manifest.json"

printf 'seed-v2\n' >"$REPO_DIR/data/seed.txt"
git -C "$REPO_DIR" add data/seed.txt
git -C "$REPO_DIR" commit -qm "release two"
second_commit="$(git -C "$REPO_DIR" rev-parse HEAD)"

set +e
CHANCEPING_TEST_HEALTH=fail run_deploy "$second_commit"
failure_code=$?
set -e
test "$failure_code" -ne 0
test "$(realpath "$APP_ROOT/current")" = "$(realpath "$first_release")"
test "$(cat "$APP_ROOT/shared/data/seed.txt")" = "seed-v1"
test "$(grep -c '^restart chanceping$' "$CHANCEPING_TEST_SYSTEMCTL_LOG")" -ge 3

echo "ChancePing atomic release verification passed."
