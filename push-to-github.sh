#!/bin/bash
# ─── Hub43 — one-shot GitHub push ───────────────────────────────────────────
# Run this from inside the hub43-deploy folder after unzipping.
# Usage:  bash push-to-github.sh https://github.com/YOUR_USERNAME/YOUR_REPO.git

set -e

REMOTE_URL="$1"

if [ -z "$REMOTE_URL" ]; then
  echo ""
  echo "Usage: bash push-to-github.sh https://github.com/YOUR_USERNAME/YOUR_REPO.git"
  echo ""
  echo "Steps to get the URL:"
  echo "  1. Go to github.com → New repository"
  echo "  2. Name it e.g. hub43-workspace"
  echo "  3. Leave it EMPTY (no README, no .gitignore)"
  echo "  4. Copy the HTTPS URL shown and paste it after this script name"
  exit 1
fi

echo "→ Initializing git..."
git init

echo "→ Setting branch to main..."
git checkout -b main 2>/dev/null || git checkout main

echo "→ Staging all files..."
git add .

echo "→ Committing..."
git commit -m "Hub43 Workspace v19 — initial deploy"

echo "→ Adding remote origin..."
git remote add origin "$REMOTE_URL"

echo "→ Pushing to GitHub..."
git push -u origin main

echo ""
echo "✅ Done! Your repo is live at: $REMOTE_URL"
echo ""
echo "Next step: Go to vercel.com/new → Import that repo → add env vars → Deploy"
