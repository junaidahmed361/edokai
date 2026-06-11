#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SRC="$SCRIPT_DIR/Edokai.app"
APP_DEST="/Applications/Edokai.app"

if [[ ! -d "$APP_SRC" ]]; then
  osascript -e 'display dialog "Edokai.app was not found next to this installer. Please run this command from the Edokai DMG." buttons {"OK"} default button "OK" with icon stop' >/dev/null 2>&1 || true
  echo "Edokai.app was not found next to this installer." >&2
  exit 1
fi

osascript -e 'display dialog "This installer will copy Edokai to /Applications, remove the macOS quarantine flag, verify the local app signature, and open Edokai.\n\nEdokai is ad-hoc signed but not Apple-notarized, because this project does not use a paid Apple Developer account." buttons {"Cancel", "Install"} default button "Install" cancel button "Cancel" with icon note' >/dev/null

echo "Installing Edokai to /Applications..."
if [[ -d "$APP_DEST" ]]; then
  rm -rf "$APP_DEST" 2>/dev/null || sudo rm -rf "$APP_DEST"
fi

ditto "$APP_SRC" "$APP_DEST" 2>/dev/null || sudo ditto "$APP_SRC" "$APP_DEST"

echo "Removing Gatekeeper quarantine from the installed app..."
xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null || sudo xattr -dr com.apple.quarantine "$APP_DEST"

echo "Verifying local app signature..."
codesign --verify --deep --strict --verbose=2 "$APP_DEST"

echo "Opening Edokai..."
open "$APP_DEST"

osascript -e 'display dialog "Edokai has been installed and opened. If the window did not appear, open /Applications/Edokai.app manually." buttons {"OK"} default button "OK" with icon note' >/dev/null 2>&1 || true
