#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_SKILLS="$HOME/.claude/skills"
CLAUDE_COMMANDS="$HOME/.claude/commands"

mkdir -p "$CLAUDE_SKILLS" "$CLAUDE_COMMANDS"

link() {
  local target="$1" dest="$2"
  if [ -e "$dest" ] && [ ! -L "$dest" ]; then
    echo "  ⚠️  skipped $(basename "$dest") (exists and is not a symlink)"
    return
  fi
  ln -sfn "$target" "$dest"
  echo "  ✓ $(basename "$dest") → ${target#"$HOME"/}"
}

echo "Linking skills into $CLAUDE_SKILLS"
for dir in "$REPO_DIR"/skills/*/; do
  name="$(basename "$dir")"
  case "$name" in
    # frontmatter pins `name: review`, which would shadow Claude Code's built-in /review
    review) continue ;;
  esac
  link "${dir%/}" "$CLAUDE_SKILLS/$name"
done

echo ""
echo "Linking prompts into $CLAUDE_COMMANDS"
for file in "$REPO_DIR"/prompts/*.md; do
  name="$(basename "$file" .md)"
  case "$name" in
    # pi- prefix keeps Claude Code built-ins (/review, plan mode) reachable;
    # the same files serve Pi under their plain names
    plan | todos | execute | review) name="pi-$name" ;;
  esac
  link "$file" "$CLAUDE_COMMANDS/$name.md"
done

echo ""
echo "✅ Claude Code picks up this repo's skills/prompts. Re-run after adding new ones."
