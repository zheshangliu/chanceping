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

