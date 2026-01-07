#!/bin/bash
# Script to create a fresh Git repository without history
# This removes all Git history, including any sensitive data

set -e

echo "⚠️  WARNING: This will create a NEW Git repository without history!"
echo "⚠️  All previous commits, branches, and tags will be lost!"
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

# Backup current remote URL
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")

# Remove old Git history
echo "Removing old Git history..."
rm -rf .git

# Initialize new repository
echo "Initializing new Git repository..."
git init

# Add all files
echo "Adding all files..."
git add .

# Create initial commit
echo "Creating initial commit..."
git commit -m "Initial commit - fresh repository without history"

# Add remote if it existed
if [ -n "$REMOTE_URL" ]; then
    echo "Adding remote: $REMOTE_URL"
    git remote add origin "$REMOTE_URL"
    echo ""
    echo "⚠️  IMPORTANT: To push to remote, you'll need to:"
    echo "   1. Delete the old repository on GitHub (or create a new one)"
    echo "   2. Push with: git push -u origin main --force"
    echo ""
    echo "   OR create a new repository and update the remote:"
    echo "   git remote set-url origin <new-repo-url>"
    echo "   git push -u origin main"
else
    echo "No remote URL found. You can add one later with:"
    echo "   git remote add origin <your-repo-url>"
fi

echo ""
echo "✅ New Git repository created successfully!"
echo "✅ All history has been removed - keys are no longer in Git history!"

