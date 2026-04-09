---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - creates isolated git worktrees with smart directory selection and safety verification
---

# Using Git Worktrees

## Overview

Git worktrees create isolated workspaces sharing the same repository, allowing work on multiple branches simultaneously without switching.

**Core principle:** Systematic directory selection + safety verification = reliable isolation.

**Announce at start:** "I'm using the using-git-worktrees skill to set up an isolated workspace."

## Multi-Instance Isolation

Prevents two Claude Code instances from colliding when working in the same repo. Uses lockfiles in worktrees to detect and prevent conflicts.

**Scope:** This mechanism is designed for local-machine use (two terminals on the same computer). PID-based lock detection does not work across machines, containers, or SSH sessions.

### Lockfile Format

When creating a worktree, write `.claude-instance-lock` in the worktree root:

```json
{
  "instanceId": "<process-id>-<timestamp>",
  "branch": "feat/my-feature",
  "startedAt": "2026-04-09T14:30:00Z",
  "pid": 12345
}
```

The `instanceId` is generated from the shell's PID (`$$` or `$PPID`) and the current timestamp.

### Before Creating a Worktree

1. Scan all existing worktrees (`git worktree list`) for `.claude-instance-lock` files.
2. For each lock found, check if the PID is still running: `kill -0 <pid> 2>/dev/null`
3. If PID is alive: report "Another Claude instance is working in worktree X on branch Y." Create a NEW worktree on a different branch. Do not share worktrees.
4. If PID is dead: stale lock. Auto-delete it and log "Cleaned up stale lock from instance X (process no longer running)."

### Block Direct Main Checkout Work

If another instance's lock exists anywhere in the repo's worktrees (with alive PID), refuse to work directly in the main checkout. Force worktree creation. This prevents two instances from editing the same files.

### Lockfile Creation

After creating the worktree (Step 2 in Creation Steps), write the lockfile:

```bash
echo '{"instanceId": "'$$-$(date +%s)'", "branch": "'$BRANCH_NAME'", "startedAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'", "pid": '$$'}' > "$path/.claude-instance-lock"
```

### Lockfile Cleanup

The lockfile is deleted by `finishing-a-development-branch` before worktree cleanup. If a session crashes, the stale lock will be auto-cleaned on next detection scan.

### Lockfile Gitignore

Add `.claude-instance-lock` to `.gitignore` if not already present. Lockfiles are ephemeral and should never be committed.

```bash
grep -q "\.claude-instance-lock" .gitignore || echo ".claude-instance-lock" >> .gitignore
```

## Directory Selection Process

Follow this priority order:

### 1. Check Existing Directories

```bash
# Check in priority order
ls -d .worktrees 2>/dev/null     # Preferred (hidden)
ls -d worktrees 2>/dev/null      # Alternative
```

**If found:** Use that directory. If both exist, `.worktrees` wins.

### 2. Check CLAUDE.md

```bash
grep -i "worktree.*director" CLAUDE.md 2>/dev/null
```

**If preference specified:** Use it without asking.

### 3. Ask User

If no directory exists and no CLAUDE.md preference:

```
No worktree directory found. Where should I create worktrees?

1. .worktrees/ (project-local, hidden)
2. ~/.config/superpowers/worktrees/<project-name>/ (global location)

Which would you prefer?
```

## Safety Verification

### For Project-Local Directories (.worktrees or worktrees)

**MUST verify directory is ignored before creating worktree:**

```bash
# Check if directory is ignored (respects local, global, and system gitignore)
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

**If NOT ignored:**

Per Jesse's rule "Fix broken things immediately":
1. Add appropriate line to .gitignore
2. Commit the change
3. Proceed with worktree creation

**Why critical:** Prevents accidentally committing worktree contents to repository.

### For Global Directory (~/.config/superpowers/worktrees)

No .gitignore verification needed - outside project entirely.

## Creation Steps

### 1. Detect Project Name

```bash
project=$(basename "$(git rev-parse --show-toplevel)")
```

### 2. Create Worktree

```bash
# Determine full path
case $LOCATION in
  .worktrees|worktrees)
    path="$LOCATION/$BRANCH_NAME"
    ;;
  ~/.config/superpowers/worktrees/*)
    path="~/.config/superpowers/worktrees/$project/$BRANCH_NAME"
    ;;
esac

# Create worktree with new branch
git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

### 3. Run Project Setup

Auto-detect and run appropriate setup:

```bash
# Node.js
if [ -f package.json ]; then npm install; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi

# Go
if [ -f go.mod ]; then go mod download; fi
```

### 4. Verify Clean Baseline

Run tests to ensure worktree starts clean:

```bash
# Examples - use project-appropriate command
npm test
cargo test
pytest
go test ./...
```

**If tests fail:** Report failures, ask whether to proceed or investigate.

**If tests pass:** Report ready.

### 5. Report Location

```
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## Quick Reference

| Situation | Action |
|-----------|--------|
| `.worktrees/` exists | Use it (verify ignored) |
| `worktrees/` exists | Use it (verify ignored) |
| Both exist | Use `.worktrees/` |
| Neither exists | Check CLAUDE.md → Ask user |
| Directory not ignored | Add to .gitignore + commit |
| Tests fail during baseline | Report failures + ask |
| No package.json/Cargo.toml | Skip dependency install |
| Another instance active | Report it, create separate worktree |
| Stale lockfile found | Auto-delete, log cleanup |

## Common Mistakes

### Skipping ignore verification

- **Problem:** Worktree contents get tracked, pollute git status
- **Fix:** Always use `git check-ignore` before creating project-local worktree

### Assuming directory location

- **Problem:** Creates inconsistency, violates project conventions
- **Fix:** Follow priority: existing > CLAUDE.md > ask

### Proceeding with failing tests

- **Problem:** Can't distinguish new bugs from pre-existing issues
- **Fix:** Report failures, get explicit permission to proceed

### Hardcoding setup commands

- **Problem:** Breaks on projects using different tools
- **Fix:** Auto-detect from project files (package.json, etc.)

## Example Workflow

```
You: I'm using the using-git-worktrees skill to set up an isolated workspace.

[Check .worktrees/ - exists]
[Verify ignored - git check-ignore confirms .worktrees/ is ignored]
[Create worktree: git worktree add .worktrees/auth -b feature/auth]
[Run npm install]
[Run npm test - 47 passing]

Worktree ready at /Users/jesse/myproject/.worktrees/auth
Tests passing (47 tests, 0 failures)
Ready to implement auth feature
```

## Red Flags

**Never:**
- Create worktree without verifying it's ignored (project-local)
- Skip baseline test verification
- Proceed with failing tests without asking
- Assume directory location when ambiguous
- Skip CLAUDE.md check
- Share a worktree with another Claude instance
- Work in main checkout when another instance has an active lock

**Always:**
- Follow directory priority: existing > CLAUDE.md > ask
- Verify directory is ignored for project-local
- Auto-detect and run project setup
- Verify clean test baseline
- Scan for existing lockfiles before creating a worktree
- Write lockfile after creating a worktree
- Clean up lockfile when finishing

## Integration

**Called by:**
- **brainstorming** (Phase 4) - REQUIRED when design is approved and implementation follows
- **subagent-driven-development** - REQUIRED before executing any tasks
- **executing-plans** - REQUIRED before executing any tasks
- Any skill needing isolated workspace

**Pairs with:**
- **finishing-a-development-branch** - REQUIRED for cleanup after work complete
