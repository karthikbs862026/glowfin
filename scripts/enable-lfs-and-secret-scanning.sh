#!/usr/bin/env bash
# One-time repo settings that aren't branch-protection rules but are still
# Phase 0 requirements (Part 5.2): secret scanning + push protection, and a
# reminder to install Git LFS locally before the first binary asset commit.

set -euo pipefail

REPO="${1:-karthikbs862026/glowfin}"

echo "Enabling secret scanning + push protection on ${REPO} ..."
gh api \
  --method PATCH \
  -H "Accept: application/vnd.github+json" \
  "repos/${REPO}" \
  -f "security_and_analysis[secret_scanning][status]=enabled" \
  -f "security_and_analysis[secret_scanning_push_protection][status]=enabled"

echo ""
echo "Also confirm locally (once, on your dev machine, before any binary asset commit):"
echo "  git lfs install"
echo "  git lfs track   # should list the patterns from .gitattributes"
