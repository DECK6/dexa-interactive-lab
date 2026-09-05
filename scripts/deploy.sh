#!/usr/bin/env bash
# Copy build output into the dexa.art repo (adxdeck).
# Stale files are moved to macOS Trash so deployment never performs an irreversible delete.
set -euo pipefail
cd "$(dirname "$0")/.."
# adxdeck main branch lives in the blog-main worktree since the 2026-08-16
# recovery consolidation (see adxdeck-worktrees/RECOVERY.md).
DEST="${1:-../adxdeck-blog-main/interactive}"
[ -d "$DEST/.." ] && git -C "$DEST/.." rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "deploy target $DEST is not inside a git worktree — refusing"; exit 1;
}
[ -d dist ] || { echo "dist/ not found — run 'bun run build' first"; exit 1; }
command -v trash >/dev/null || { echo "trash command not found — refusing to remove stale deploy assets"; exit 1; }
mkdir -p "$DEST"

stale_files=0
while IFS= read -r -d '' deployed_file; do
  relative_path="${deployed_file#"$DEST"/}"
  if [ ! -f "dist/$relative_path" ]; then
    trash "$deployed_file"
    stale_files=$((stale_files + 1))
  fi
done < <(find "$DEST" -type f -print0)

while IFS= read -r -d '' deployed_dir; do
  relative_path="${deployed_dir#"$DEST"/}"
  if [ ! -d "dist/$relative_path" ]; then
    trash "$deployed_dir"
  fi
done < <(find "$DEST" -depth -type d ! -path "$DEST" -print0)

rsync -a dist/ "$DEST/"
echo "deployed dist/ → $DEST ($stale_files stale files moved to Trash)"
