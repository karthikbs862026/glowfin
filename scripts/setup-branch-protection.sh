#!/usr/bin/env bash
# Applies Part 5.2 branch protection to main via the GitHub CLI.
# Prerequisite: `gh auth login` with a token that has repo admin rights.
#
# Usage: ./scripts/setup-branch-protection.sh [owner/repo]
# Defaults to karthikbs862026/glowfin if no argument given.

set -euo pipefail

REPO="${1:-karthikbs862026/glowfin}"
BRANCH="main"

echo "Applying branch protection to ${REPO}:${BRANCH} ..."

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/${REPO}/branches/${BRANCH}/protection" \
  -f "required_status_checks[strict]=true" \
  -f "required_status_checks[contexts][]=Lint, typecheck, test, build" \
  -f "required_status_checks[contexts][]=Secret scan" \
  -f "enforce_admins=true" \
  -f "required_pull_request_reviews[required_approving_review_count]=1" \
  -f "required_pull_request_reviews[require_code_owner_reviews]=true" \
  -f "restrictions=null" \
  -f "required_linear_history=true" \
  -f "allow_force_pushes=false" \
  -f "allow_deletions=false"

echo "Done. Verify at: https://github.com/${REPO}/settings/branches"
echo ""
echo "Note: 'enforce_admins=true' means even the repo owner can't bypass this."
echo "If you're solo and need an emergency escape hatch, that's a deliberate"
echo "tradeoff per Part 5.2 — flag it if you want a different default."
