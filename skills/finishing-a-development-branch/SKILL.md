---
name: finishing-a-development-branch
description: Use when implementation is complete and all tests pass - pushes branch and creates PR against base branch automatically
---

# Finishing a Development Branch

## Overview

Guide completion of development work by automatically pushing the branch and creating a pull request.

**Core principle:** Verify tests → Rebase → Push → Create PR → Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

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

### Step 2: Determine Base Branch

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main - is that correct?"

### Step 2.5: Rebase Check

Before creating the PR, ensure the branch is current with the base.

```bash
# Fetch latest
git fetch origin <base-branch>

# Check if behind
git merge-base --is-ancestor origin/<base-branch> HEAD
```

**If up-to-date:** Proceed to Step 3.

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

Only proceed to Step 3 after rebase + tests pass (or branch was already up-to-date).

### Step 3: Push and Create PR

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

### Step 4: Cleanup Worktree

**Delete lockfile (if exists):**
```bash
rm -f "$worktree_path/.claude-instance-lock"
```

**Delete checkpoint state (if exists):**
```bash
rm -f .claude-workflow-state.json
```

Check if in worktree:
```bash
git worktree list | grep $(git branch --show-current)
```

If yes:
```bash
git worktree remove <worktree-path>
```

## Quick Reference

| Step | Action |
|------|--------|
| 1. Verify tests | Run test suite, stop if failing |
| 2. Rebase check | Fetch origin, rebase if behind, re-run tests |
| 3. Push + PR | Push branch, create PR, report URL |
| 4. Cleanup | Remove lockfile, checkpoint, worktree |

## Common Mistakes

**Skipping test verification**
- **Problem:** Push broken code, create failing PR
- **Fix:** Always verify tests before pushing

**Force-pushing without request**
- **Problem:** Rewrite shared history
- **Fix:** Only force-push when user explicitly asks

## Red Flags

**Never:**
- Push with failing tests
- Force-push without explicit request
- Delete work without confirmation
- Skip rebase check

**Always:**
- Verify tests before pushing
- Rebase onto latest base branch
- Create PR with descriptive title and summary
- Clean up worktree after PR creation

## Integration

**Called by:**
- **subagent-driven-development** (Step 7) - After all tasks complete
- **executing-plans** (Step 5) - After all batches complete

**Pairs with:**
- **using-git-worktrees** - Cleans up worktree created by that skill
