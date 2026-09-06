#!/usr/bin/env bash
set -euo pipefail

# Run from Linux, WSL, Git Bash, MSYS2, or Cygwin. The checkout is the Pi config.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_AGENT_DIR="$HOME/.pi/agent"
MERGE_DEFAULT=0

case "${1:-}" in
  "") ;;
  --merge-default) MERGE_DEFAULT=1 ;;
  *)
    echo "Usage: $0 [--merge-default]" >&2
    exit 2
    ;;
esac

export PI_CODING_AGENT_DIR="${PI_CODING_AGENT_DIR:-$SCRIPT_DIR}"

case "$(uname -s)" in
  Linux*|MINGW*|MSYS*|CYGWIN*) ;;
  *)
    echo "Unsupported platform: $(uname -s)" >&2
    echo "Run setup.sh on Linux or Windows through Git Bash, MSYS2, or Cygwin." >&2
    exit 1
    ;;
esac

if ! command -v pi >/dev/null 2>&1; then
  echo "Pi CLI not found. Install Pi first, then run setup.sh again." >&2
  exit 1
fi

cd "$PI_CODING_AGENT_DIR"
echo "Setting up Pi config at $PI_CODING_AGENT_DIR"

# Create only missing configuration files. Existing models and credentials are never touched.
if [ ! -f settings.json ]; then
  cat > settings.json <<'EOF'
{
  "lastChangelogVersion": "0.83.0",
  "defaultProvider": "openrouter",
  "defaultModel": "openai/gpt-5.6-sol",
  "defaultThinkingLevel": "high",
  "packages": [
    "git:github.com/pasky/chrome-cdp-skill",
    "git:github.com/nicobailon/visual-explainer"
  ],
  "hideThinkingBlock": true,
  "enabledModels": [
    "openrouter/openai/gpt-5.6-terra",
    "openrouter/openai/gpt-5.6-sol"
  ],
  "theme": "dark"
}
EOF
  echo "Created settings.json"
else
  echo "Keeping existing settings.json"
fi

# Keep this list explicit and portable. macOS Harness is intentionally excluded.
PACKAGES=(
  "git:github.com/pasky/chrome-cdp-skill"
  "git:github.com/nicobailon/visual-explainer"
)

export CI="${CI:-1}"
for package in "${PACKAGES[@]}"; do
  echo "Installing $package"
  pi install "$package"
done

if [ "$MERGE_DEFAULT" -eq 1 ]; then
  if [ "$PI_CODING_AGENT_DIR" = "$DEFAULT_AGENT_DIR" ]; then
    echo "Default Pi config is already this checkout; merge skipped."
  else
    echo "Merging resources into $DEFAULT_AGENT_DIR (existing files are kept)"
    mkdir -p "$DEFAULT_AGENT_DIR"
    for resource in skills prompts extensions; do
      if [ -d "$PI_CODING_AGENT_DIR/$resource" ]; then
        mkdir -p "$DEFAULT_AGENT_DIR/$resource"
        cp -rn "$PI_CODING_AGENT_DIR/$resource/." "$DEFAULT_AGENT_DIR/$resource/"
      fi
    done

    for package in "${PACKAGES[@]}"; do
      echo "Installing $package into the default Pi config"
      PI_CODING_AGENT_DIR="$DEFAULT_AGENT_DIR" pi install "$package"
    done
  fi
fi

echo
echo "Setup complete. Existing models.json and provider credentials were preserved."
echo "This script cannot persist environment variables in the calling shell."
if [ "$MERGE_DEFAULT" -eq 1 ]; then
  echo "Start Pi with: pi"
else
  echo "Start Pi with: PI_CODING_AGENT_DIR=\"$PI_CODING_AGENT_DIR\" pi"
  echo "To merge this checkout into the default config: $0 --merge-default"
fi
