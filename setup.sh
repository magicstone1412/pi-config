#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXPECTED_DIR="$HOME/.pi/agent"

if [ "$SCRIPT_DIR" != "$EXPECTED_DIR" ]; then
  echo "⚠️  This repo should be cloned to ~/.pi/agent/"
  echo "   Current location: $SCRIPT_DIR"
  echo "   Expected: $EXPECTED_DIR"
  echo ""
  echo "   Run: git clone git@github.com:HazAT/pi-config $EXPECTED_DIR"
  exit 1
fi

echo "Setting up pi-config at $EXPECTED_DIR"
echo ""

if [ ! -f "$EXPECTED_DIR/settings.json" ]; then
  echo "Creating settings.json..."
  cat > "$EXPECTED_DIR/settings.json" << 'EOF'
{
  "lastChangelogVersion": "0.83.0",
  "defaultProvider": "openrouter",
  "defaultModel": "openai/gpt-5.6-sol",
  "defaultThinkingLevel": "high",
  "packages": [
    "git:github.com/pasky/chrome-cdp-skill",
    "git:github.com/HazAT/pi-parallel",
    "git:github.com/HazAT/pi-macos-harness"
  ],
  "hideThinkingBlock": true,
  "enabledModels": [
    "openrouter/openai/gpt-5.6-terra",
    "openrouter/openai/gpt-5.6-sol"
  ],
  "theme": "dark"
}
EOF
else
  echo "settings.json already exists — skipping creation"
fi

echo ""

if ! command -v pi >/dev/null 2>&1; then
  echo "pi CLI not found. Install pi, then run ./setup.sh again to install packages."
  exit 1
fi

echo "Installing configured packages..."
pi install git:github.com/pasky/chrome-cdp-skill 2>/dev/null || echo "  chrome-cdp-skill already installed"
pi install git:github.com/HazAT/pi-parallel 2>/dev/null || echo "  pi-parallel already installed"
pi install git:github.com/HazAT/pi-macos-harness 2>/dev/null || echo "  pi-macos-harness already installed"
echo ""

if [ "$(uname -s)" = "Darwin" ]; then
  if ! command -v uv >/dev/null 2>&1; then
    echo "uv is required to install macOS Harness. Install uv, then run ./setup.sh again."
    exit 1
  fi
  echo "Installing macOS Harness..."
  uv tool install --python 3.12 --upgrade macos-harness
  echo ""
fi

echo "Linking skills/prompts into Claude Code..."
"$EXPECTED_DIR/link-claude.sh"
echo ""

echo "✅ Setup complete!"
echo ""
echo "Restart pi to pick up all changes."
