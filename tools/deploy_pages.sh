#!/usr/bin/env bash
# Baut die App für GitHub Pages und veröffentlicht dist/ auf dem Branch gh-pages
# (Pages-Quelle: Branch gh-pages, Pfad / – klassisches Branch-Deployment wie bei den anderen Spielen).
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
NAME=$(git config user.name); MAIL=$(git config user.email)
npm run build:pages
touch dist/.nojekyll
TMP=$(mktemp -d)
cp -r dist/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git -c user.name="$NAME" -c user.email="$MAIL" add -A
git -c user.name="$NAME" -c user.email="$MAIL" commit -qm "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -f "$REMOTE" gh-pages
rm -rf "$TMP"
