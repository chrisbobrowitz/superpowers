# Workflow Improvements Design Spec

**Date:** 2026-04-09
**Author:** Christopher Bobrowitz
**Status:** Draft

## Overview

Four improvements to the superpowers fork: worktree-based multi-instance isolation, automatic rebase-before-finish, plan drift detection, and workflow checkpoint/resume. All changes are in-place modifications to existing skill files plus one new skill.

## 1. Worktree-Based Multi-Instance Isolation

**File:** `skills/using-git-worktrees/SKILL.md`

**Goal:** Prevent two Claude Code instances from colliding when working in the same repo by enforcing worktree isolation with lockfiles.

### Lockfile Format

When a session creates a worktree, write `.claude-instance-lock` in the worktree root:

```json
{
  "instanceId": "<process-id>-<timestamp>",
  "branch": "feat/my-feature",
  "startedAt": "2026-04-09T14:30:00Z",
  "pid": 12345
}
```

### Enforcement

1. **Before creating a worktree:** Scan all existing worktrees (`git worktree list`) for `.claude-instance-lock` files. If any exist with a still-alive process (verify PID with `kill -0`), report: "Another Claude instance is working in worktree X on branch Y." Create a NEW worktree on a different branch. Do not share worktrees.

2. **Block direct main checkout work:** If another instance's lock exists anywhere in the repo's worktrees, refuse to work directly in the main checkout. Force worktree creation. This prevents two instances from editing the same files.

3. **Stale lock cleanup:** When scanning for locks, check if the PID is still running. If not, the lock is stale. Auto-delete it and log: "Cleaned up stale lock from instance X (process no longer running)."

### Cleanup on Completion

`finishing-a-development-branch` deletes the lockfile before cleaning up the worktree. This happens for all options (merge, PR, keep, discard).

### Lockfile Gitignore

Add `.claude-instance-lock` to `.gitignore` if not already present. Lockfiles are ephemeral and should never be committed.

### Scope

This isolation mechanism is designed for **local-machine** use (two terminals on the same computer). PID-based lock detection does not work across machines, containers, or SSH sessions. For cross-machine collaboration, use separate clones or coordinate via branch naming conventions.

## 2. Automatic Rebase-Before-Finish Gate

**File:** `skills/finishing-a-development-branch/SKILL.md`

**Goal:** Before presenting completion options, ensure the branch is up-to-date with the base branch. Auto-rebase and re-test. Stop only on conflicts or test failures.

### Process

Insert between Step 1 (verify tests) and Step 3 (present options):

**Step 2.5: Rebase Check**

1. Fetch the latest base branch: `git fetch origin <base-branch>`
2. Check if current branch is behind: `git merge-base --is-ancestor origin/<base-branch> HEAD`
3. If up-to-date: proceed to Step 3.
4. If behind:
   a. Report: "Branch is N commits behind origin/<base-branch>. Rebasing..."
   b. Run: `git rebase origin/<base-branch>`
   c. If rebase succeeds: re-run the full test suite on the rebased result
   d. If rebase has conflicts: STOP. Present the conflicts to the user. Do not auto-resolve merge conflicts.
   e. If tests fail after rebase: STOP. Report failures. Same as existing test failure behavior.
5. Only proceed to Step 3 (present options) after rebase + tests pass.

### Pushed Branch Safety

Before rebasing, check if the branch has been pushed to a remote:
```bash
git log --oneline origin/<branch> 2>/dev/null
```
If the branch has been pushed (shared history), warn the user: "This branch has been pushed to origin. Rebasing will rewrite shared history. Proceed?" Only rebase with explicit confirmation. If the branch is local-only, auto-rebase without prompting.

### Why Auto-Rebase

Tests passing on a stale branch give false confidence. If main has advanced, the merge could introduce conflicts or break functionality that wasn't tested. Auto-rebasing before presenting options ensures the branch is tested against the latest base.

## 3. Plan Drift Detection

**File:** `skills/subagent-driven-development/SKILL.md`

**Goal:** After each task's implementation, detect if the subagent modified files outside the plan's declared scope. Block on drift.

### Detection Process

After implementer subagent completes (reports DONE) and BEFORE dispatching the spec reviewer, the orchestrator:

1. Capture pre-task file state: before dispatching the implementer, record the current `git diff --name-only HEAD` (or note the HEAD SHA if working tree is clean).
2. After implementer returns: run `git diff --name-only <pre-task-sha>` to get actual files changed.
3. Extract the task's declared "Files" section from the plan (Create/Modify/Test paths).
4. Compare:
   - **Undeclared files touched:** Files in the diff (added, modified, or deleted) that are not in the plan's Files section for this task.
   - **Undeclared files deleted:** Deletions of files not in the plan are treated as drift. Deleting a file the plan did not mention is arguably more dangerous than modifying one.
   - **Declared files untouched:** Files listed in the plan that were not in the diff.

### Handling Drift

**Drift allowlist:** Some files are commonly touched as transitive side effects and should not trigger drift detection:
- `__init__.py` files (Python import updates)
- Lock files (`*.lock`, `package-lock.json`, `poetry.lock`)
- Generated files (`.gitignore` patterns for generated output)

Files matching the allowlist are excluded from drift comparison.

**Extensibility:** Projects can extend the allowlist via CLAUDE.md by adding a `driftAllowlist` section listing additional file patterns. Example: `go.sum`, `Cargo.lock`, `CMakeLists.txt`. The orchestrator reads CLAUDE.md at the start of subagent-driven-development and merges project-specific patterns with the default allowlist.

**If undeclared files were touched (after allowlist filtering):**
- Task fails the drift check. Do not proceed to spec review.
- Report the drift: "Implementer modified files not in the plan: [list]. Expected only: [plan files]."
- The rollback point is the PRE_TASK_SHA captured before the first dispatch (not the HEAD after the first dispatch). This ensures a clean rollback to the state before any work on this task began.
- Re-dispatch the implementer with explicit instructions: "You touched files outside your task scope. Revert changes to [undeclared files] and only modify [declared files]."
- If re-dispatch fails again (second drift violation on same files): hard reset to PRE_TASK_SHA (`git reset --hard $PRE_TASK_SHA`) and escalate to the user.
- If the drift appears genuinely necessary (the plan missed a dependency), the orchestrator asks the user for confirmation before adding the file to the plan. Do not autonomously update the plan scope. Once the user confirms, update the plan document in-place and re-run drift detection.

**If declared files were untouched:**
- Flag as a warning (not a block). The spec reviewer will catch missing functionality.

### Review Pipeline Update

The review pipeline becomes a three-stage gate:
1. **Drift detection** (new) - did the subagent stay within scope?
2. **Spec compliance** (existing) - does the code match the spec?
3. **Code quality** (existing) - is the code well-written?

### Pre-Task SHA Capture

Before dispatching each implementer subagent, the orchestrator must:
```bash
PRE_TASK_SHA=$(git rev-parse HEAD)
```

After the implementer returns:
```bash
git diff --name-only $PRE_TASK_SHA
```

This gives the exact set of files changed by this task.

## 4. Workflow Checkpoint and Resume

**New file:** `skills/workflow-checkpoint/SKILL.md`
**Modified:** `skills/using-superpowers/SKILL.md`, `skills/brainstorming/SKILL.md`, `skills/writing-plans/SKILL.md`, `skills/subagent-driven-development/SKILL.md`

**Goal:** Capture workflow state at key moments so a new session can resume from the last checkpoint instead of starting over. Auto-detect incomplete state and prompt for resume.

### State File

Location: `.claude-workflow-state.json` in the current git working directory root (per-worktree, not per-repo). Each worktree gets its own checkpoint file. Resume detection scans the current working directory AND all worktrees (`git worktree list`) for checkpoint files. Added to `.gitignore`.

```json
{
  "activeSkill": "brainstorming",
  "phase": "ask-clarifying-questions",
  "stepIndex": 3,
  "artifacts": {
    "specPath": "docs/superpowers/specs/2026-04-09-feature-design.md",
    "planPath": null,
    "branch": "feat/my-feature",
    "worktreePath": "/path/to/worktree",
    "taskIds": [1, 2, 3]
  },
  "decisions": [
    {
      "question": "What approach do you prefer?",
      "answer": "Approach 1 - in-place modification",
      "timestamp": "2026-04-09T14:30:00Z"
    }
  ],
  "completedPhases": ["explore-context", "offer-visual-companion"],
  "lastUpdated": "2026-04-09T15:00:00Z"
}
```

### Checkpoint Triggers

Each skill writes checkpoints at specific moments:

**brainstorming/SKILL.md:**
- After each checklist step completes (TaskUpdate -> completed)
- Captures: decisions made (approach chosen, design section approved, Q&A pairs from clarifying questions)
- Phase names: `explore-context`, `offer-visual-companion`, `ask-clarifying-questions`, `propose-approaches`, `present-design`, `write-design-doc`, `spec-self-review`, `adversarial-spec-review`, `user-reviews-spec`, `transition-to-implementation`

**writing-plans/SKILL.md:**
- After plan document is written
- After adversarial plan review completes
- After execution handoff
- Captures: plan path, task IDs created

**subagent-driven-development/SKILL.md:**
- After each task is marked completed
- Captures: which task IDs are done, which remain, current task in progress

### Checkpoint Skill

`skills/workflow-checkpoint/SKILL.md` provides the write/read/cleanup interface:

**Write checkpoint:** Called by other skills at trigger points.
```bash
# Write state to .claude-workflow-state.json
# Merge new state into existing state (don't overwrite decisions array, append to it)
```

**Read checkpoint:** Called by resume detection.
```bash
# Read .claude-workflow-state.json
# Validate state is coherent (referenced files exist, branch exists)
# Return parsed state
```

**Cleanup:** Called by finishing-a-development-branch or when user declines resume.
```bash
# Delete .claude-workflow-state.json
```

### Resume Detection

**File:** `skills/using-superpowers/SKILL.md`

At session start, before the normal skill flow:

1. Check for `.claude-workflow-state.json` in the current working directory AND scan all worktrees (`git worktree list`) for checkpoint files. Also check for in-progress rebase state (`git status` showing "rebase in progress") and offer `git rebase --abort` if found.
2. If found and `lastUpdated` within the staleness window (default 48 hours, configurable via `checkpointStalenessHours` in the state file):
   - Read and validate the state
   - Present to user: "Detected incomplete workflow: [activeSkill] at phase [phase]. Branch: [branch]. Last checkpoint: [time ago]. Resume?"
   - If yes: invoke the appropriate skill with resume context. For brainstorming, provide the decisions already made so it doesn't re-ask questions. For subagent-driven-development, point to the plan and indicate which tasks are already done.
   - If no: delete the state file and proceed normally
3. If found but older than the staleness window: "Stale workflow state detected (X hours old). Clean up or resume?" Never silently discard without prompting.
4. If not found: proceed normally

### Resume Behavior Per Skill

**Brainstorming resume:** Skip completed phases. For the current phase, provide context from decisions array. Example: if phase is `present-design` and 3 of 5 design sections were approved, start from section 4.

**Writing-plans resume:** If plan is written but adversarial review hasn't run, run it. If plan is complete but execution hasn't started, invoke subagent-driven-development.

**Subagent-driven-development resume:** Load the plan, use `.tasks.json` as the single source of truth for task completion state (not the checkpoint file). The checkpoint file only stores skill-level context: which review stage the current task was in, the active skill name, and the branch/worktree path. Task-level state (pending/completed/in_progress) lives exclusively in `.tasks.json` to avoid conflicting sources of truth.

## Files Modified Summary

| File | Change Type | Change |
|------|-------------|--------|
| `skills/using-git-worktrees/SKILL.md` | Modify | Lockfile creation, multi-instance detection, stale lock cleanup |
| `skills/finishing-a-development-branch/SKILL.md` | Modify | Rebase-before-finish gate, lockfile cleanup on completion |
| `skills/subagent-driven-development/SKILL.md` | Modify | Drift detection as pre-review gate, pre-task SHA capture, checkpoint triggers |
| `skills/using-superpowers/SKILL.md` | Modify | Resume detection at session start |
| `skills/brainstorming/SKILL.md` | Modify | Checkpoint triggers after each step |
| `skills/writing-plans/SKILL.md` | Modify | Checkpoint triggers after key phases |
| `skills/workflow-checkpoint/SKILL.md` | **New** | Checkpoint write/read/cleanup interface |
| `.gitignore` | Modify | Add `.claude-instance-lock` and `.claude-workflow-state.json` |
