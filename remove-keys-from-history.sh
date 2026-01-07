#!/bin/bash
# Script to remove Firebase keys from Git history
# WARNING: This rewrites Git history and requires force-push

set -e

echo "⚠️  WARNING: This will rewrite Git history!"
echo "⚠️  Make sure you have a backup and all collaborators are informed!"
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

# Remove keys from DATENSCHUTZ.html history
echo "Removing keys from DATENSCHUTZ.html..."
git filter-branch --force --index-filter \
  'git checkout -- DATENSCHUTZ.html && \
   sed -i.bak "s/apiKey: \"AIzaSy[^\"]*\"/apiKey: \"REDACTED\"/g" DATENSCHUTZ.html && \
   rm -f DATENSCHUTZ.html.bak && \
   git add DATENSCHUTZ.html' \
  --prune-empty --tag-name-filter cat -- --all

# Remove google-services.json from history
echo "Removing google-services.json from history..."
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch android/app/google-services.json' \
  --prune-empty --tag-name-filter cat -- --all

# Remove GoogleService-Info.plist from history
echo "Removing GoogleService-Info.plist from history..."
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch ios/spixparkplatz/GoogleService-Info.plist' \
  --prune-empty --tag-name-filter cat -- --all

echo ""
echo "✅ History rewritten. Keys have been removed."
echo ""
echo "⚠️  IMPORTANT NEXT STEPS:"
echo "1. Review the changes: git log --all"
echo "2. Force push to remote: git push origin --force --all"
echo "3. Force push tags: git push origin --force --tags"
echo "4. Inform all collaborators to re-clone the repository"
echo ""
echo "⚠️  Note: The keys are still in the remote repository until you force-push!"

