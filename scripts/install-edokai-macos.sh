#!/usr/bin/env bash
set -euo pipefail

REPO="junaidahmed361/edokai"
TAG="${EDOKAI_TAG:-v3.0.0-rc.3}"
ASSET="Edokai-3.0.0-arm64.dmg"
APP_NAME="Edokai.app"
INSTALL_DIR="/Applications"
APP_PATH="$INSTALL_DIR/$APP_NAME"
URL="https://github.com/$REPO/releases/download/$TAG/$ASSET"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is for macOS only." >&2
  exit 1
fi

ARCH="$(uname -m)"
if [[ "$ARCH" != "arm64" ]]; then
  echo "Warning: this release asset is macOS arm64. Your machine reports: $ARCH" >&2
fi

TMPDIR="$(mktemp -d /tmp/edokai-install.XXXXXX)"
DMG="$TMPDIR/$ASSET"
MOUNT_DIR="$TMPDIR/mount"
mkdir -p "$MOUNT_DIR"

cleanup() {
  if mount | grep -q " on $MOUNT_DIR "; then
    hdiutil detach "$MOUNT_DIR" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

echo "Downloading $URL"
curl -L --fail --progress-bar "$URL" -o "$DMG"

echo "Verifying DMG checksum..."
EXPECTED="5afc7dd801edc6302b0b4c061f21124afb7a4c017f846b5af1ef97d4544a9fdc"
ACTUAL="$(shasum -a 256 "$DMG" | awk '{print $1}')"
if [[ "$ACTUAL" != "$EXPECTED" ]]; then
  echo "Checksum mismatch!" >&2
  echo "Expected: $EXPECTED" >&2
  echo "Actual:   $ACTUAL" >&2
  exit 1
fi

echo "Mounting DMG..."
hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MOUNT_DIR" >/dev/null

if [[ ! -d "$MOUNT_DIR/$APP_NAME" ]]; then
  echo "Could not find $APP_NAME inside the DMG." >&2
  exit 1
fi

if [[ -d "$APP_PATH" ]]; then
  echo "Removing existing $APP_PATH"
  rm -rf "$APP_PATH" 2>/dev/null || sudo rm -rf "$APP_PATH"
fi

echo "Installing to $APP_PATH"
ditto "$MOUNT_DIR/$APP_NAME" "$APP_PATH" 2>/dev/null || sudo ditto "$MOUNT_DIR/$APP_NAME" "$APP_PATH"

echo "Removing Gatekeeper quarantine attribute from installed app..."
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || sudo xattr -dr com.apple.quarantine "$APP_PATH"

echo "Verifying local code signature..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

echo "Done. Opening Edokai..."
open "$APP_PATH"

echo "If macOS still blocks launch, run:"
echo "  xattr -dr com.apple.quarantine '$APP_PATH' && open '$APP_PATH'"
