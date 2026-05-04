---
name: finishing-a-development-branch
description: Use when implementation is complete and all tests pass - pushes branch and creates PR against base branch automatically
---

# Finishing a Development Branch

## Overview

Guide completion of development work by automatically pushing the branch and creating a pull request.

**Core principle:** Verify tests → Detect environment → Rebase → Push → Create PR → Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

**Fork policy:** Auto-finish — no menu. Push and create PR automatically. Only test failure gates the action. WIP pushes allowed when explicitly requested.

## The Process

### Step 1: Verify Tests

**Before proceeding, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Stop. Don't proceed to Step 2.

**If tests pass:** Continue to Step 2.

### Step 2: Detect Environment

**Determine workspace state before proceeding:**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
```

This determines how cleanup works:

| State | Cleanup |
|-------|---------|
| `GIT_DIR == GIT_COMMON` (normal repo) | No worktree to clean up |
| `GIT_DIR != GIT_COMMON`, named branch | Provenance-based (see Step 5) |
| `GIT_DIR != GIT_COMMON`, detached HEAD | No cleanup (externally managed). Push as new branch. |

### Step 3: Determine Base Branch

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main - is that correct?"

### Step 3.5: Rebase Check

Before creating the PR, ensure the branch is current with the base.

```bash
# Fetch latest
git fetch origin <base-branch>

# Check if behind
git merge-base --is-ancestor origin/<base-branch> HEAD
```

**If up-to-date:** Proceed to Step 4.

**If behind:**

1. Check if branch has been pushed:
   ```bash
   git log --oneline origin/<feature-branch> 2>/dev/null
   ```
2. **If pushed (shared history):** Warn: "This branch has been pushed to origin. Rebasing will rewrite shared history. Proceed?" Only rebase with explicit user confirmation.
3. **If local-only:** Auto-rebase without prompting.
4. Rebase: `git rebase origin/<base-branch>`
5. **If rebase succeeds:** Re-run the full test suite on the rebased result. If tests fail, STOP and report.
6. **If rebase has conflicts:** STOP. Present the conflicts to the user. Do not auto-resolve merge conflicts.

Only proceed to Step 4 after rebase + tests pass (or branch was already up-to-date).

### Step 4: Push and Create PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

Report the PR URL to the user.

**Do NOT clean up worktree** — user needs it alive to iterate on PR feedback.

### Step 5: Cleanup Workspace

**Delete checkpoint state (if exists):**
```bash
rm -f .claude-workflow-state.json
```

**Provenance-based worktree cleanup:**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

**If `GIT_DIR == GIT_COMMON`:** Normal repo, no worktree to clean up. Done.

**If worktree path is under `.worktrees/`, `worktrees/`, or `~/.config/superpowers/worktrees/`:** Superpowers created this worktree — we own cleanup.

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
git worktree remove "$WORKTREE_PATH"
git worktree prune  # Self-healing: clean up any stale registrations
```

**Otherwise:** The host environment (harness) owns this workspace. Do NOT remove it. If your platform provides a workspace-exit tool, use it. Otherwise, leave the workspace in place.

## Quick Reference

| Step | Action |
|------|--------|
| 1. Verify tests | Run test suite, stop if failing |
| 2. Detect environment | Check GIT_DIR vs GIT_COMMON, identify detached HEAD |
| 3. Determine base | Find merge-base with main/master |
| 3.5. Rebase check | Fetch origin, rebase if behind, re-run tests |
| 4. Push + PR | Push branch, create PR, report URL |
| 5. Cleanup | Remove checkpoint, provenance-based worktree cleanup |

## Common Mistakes

**Skipping test verification**
- **Problem:** Push broken code, create failing PR
- **Fix:** Always verify tests before pushing

**Force-pushing without request**
- **Problem:** Rewrite shared history
- **Fix:** Only force-push when user explicitly asks

**Skipping environment detection**
- **Problem:** Try to clean up a harness-owned workspace, or attempt cleanup on detached HEAD
- **Fix:** Run Step 2 detection first

**Cleaning up worktree before PR iteration**
- **Problem:** Remove worktree user needs for PR feedback
- **Fix:** Worktree stays after auto-PR. Cleanup only on explicit request.

**Cleaning up harness-owned worktrees**
- **Problem:** Removing a worktree the harness created causes phantom state
- **Fix:** Only clean up worktrees under `.worktrees/`, `worktrees/`, or `~/.config/superpowers/worktrees/`

**Running git worktree remove from inside the worktree**
- **Problem:** Command fails silently when CWD is inside the worktree being removed
- **Fix:** Always `cd` to main repo root before `git worktree remove`

## Red Flags

**Never:**
- Push with failing tests
- Force-push without explicit request
- Skip rebase check
- Clean up worktrees you didn't create (provenance check)
- Run `git worktree remove` from inside the worktree

**Always:**
- Verify tests before pushing
- Detect environment before cleanup
- Rebase onto latest base branch
- Create PR with descriptive title and summary
- `cd` to main repo root before worktree removal
- Run `git worktree prune` after removal
