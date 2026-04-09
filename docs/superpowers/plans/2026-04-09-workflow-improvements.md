# Workflow Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add worktree-based multi-instance isolation, automatic rebase-before-finish, plan drift detection, and workflow checkpoint/resume to the superpowers fork.

**Architecture:** In-place modifications to existing skill files plus one new skill (workflow-checkpoint). All changes are markdown. No application code.

**Tech Stack:** Markdown (skill files), Git, JSON (state files)

**Note:** All tasks are skill file edits (markdown). TDD is not applicable per the spec's scoping to code-producing tasks only.

---

### Task 1: Add .gitignore entries

**Goal:** Add lockfile and checkpoint state file patterns to .gitignore.

**Files:**
- Modify: `.gitignore`

**Acceptance Criteria:**
- [ ] `.claude-instance-lock` pattern in .gitignore
- [ ] `.claude-workflow-state.json` pattern in .gitignore

**Verify:** `grep -c "claude-instance-lock" .gitignore` -> "1" AND `grep -c "claude-workflow-state" .gitignore` -> "1"

**Steps:**

- [ ] **Step 1: Add patterns to .gitignore**

Append these lines to the end of `.gitignore`:

```
.claude-instance-lock
.claude-workflow-state.json
```

- [ ] **Step 2: Verify**

Run: `grep "claude-instance-lock\|claude-workflow-state" .gitignore`
Expected: Both patterns listed

---

### Task 2: Add multi-instance isolation to using-git-worktrees

**Goal:** Modify `skills/using-git-worktrees/SKILL.md` to add lockfile creation, multi-instance detection, and stale lock cleanup.

**Files:**
- Modify: `skills/using-git-worktrees/SKILL.md`

**Acceptance Criteria:**
- [ ] New "Multi-Instance Isolation" section exists
- [ ] Lockfile format documented with JSON example
- [ ] Enforcement rules: scan for existing locks, block direct main work, stale cleanup
- [ ] Lockfile creation added to worktree creation steps
- [ ] Scope note: local-machine only

**Verify:** `grep -c "Multi-Instance Isolation" skills/using-git-worktrees/SKILL.md` -> "1"

**Steps:**

- [ ] **Step 1: Add Multi-Instance Isolation section**

Insert the following new section AFTER the "## Overview" section (after line 14) and BEFORE the "## Directory Selection Process" section:

```markdown
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
```

- [ ] **Step 2: Add lockfile to Quick Reference table**

Add this row to the existing Quick Reference table:

```markdown
| Another instance active | Report it, create separate worktree |
| Stale lockfile found | Auto-delete, log cleanup |
```

- [ ] **Step 3: Add to Red Flags**

Add to the "Never:" list:

```markdown
- Share a worktree with another Claude instance
- Work in main checkout when another instance has an active lock
```

Add to the "Always:" list:

```markdown
- Scan for existing lockfiles before creating a worktree
- Write lockfile after creating a worktree
- Clean up lockfile when finishing
```

---

### Task 3: Add rebase-before-finish gate to finishing-a-development-branch

**Goal:** Modify `skills/finishing-a-development-branch/SKILL.md` to add automatic rebase check and lockfile cleanup.

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md`

**Acceptance Criteria:**
- [ ] New "Step 2.5: Rebase Check" section between test verification and present options
- [ ] Auto-rebase for local-only branches
- [ ] Pushed-branch safety check with user confirmation
- [ ] Re-run tests after successful rebase
- [ ] Stop on conflicts or test failures
- [ ] Lockfile deletion added to Step 5 (cleanup)

**Verify:** `grep -c "Rebase Check" skills/finishing-a-development-branch/SKILL.md` -> "1"

**Steps:**

- [ ] **Step 1: Add Step 2.5 Rebase Check**

Insert the following section AFTER "### Step 2: Determine Base Branch" and BEFORE "### Step 3: Present Options":

```markdown
### Step 2.5: Rebase Check

Before presenting options, ensure the branch is current with the base.

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
```

- [ ] **Step 2: Add lockfile cleanup to Step 5**

In the existing "### Step 5: Cleanup Worktree" section, add the following BEFORE the "Check if in worktree:" line:

```markdown
**Delete lockfile (if exists):**
```bash
rm -f "$worktree_path/.claude-instance-lock"
```

**Delete checkpoint state (if exists):**
```bash
rm -f .claude-workflow-state.json
```
```

- [ ] **Step 3: Update Quick Reference table**

The existing table does not need structural changes, but add a note below it:

```markdown
**Pre-step for all options:** Rebase check runs before presenting options. Lockfile and checkpoint cleanup runs during Step 5.
```

---

### Task 4: Add drift detection to subagent-driven-development

**Goal:** Modify `skills/subagent-driven-development/SKILL.md` to add plan drift detection as a pre-review gate before spec compliance review.

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md`

**Acceptance Criteria:**
- [ ] New "Plan Drift Detection" section exists
- [ ] Pre-task SHA capture documented
- [ ] Drift allowlist with extensibility via CLAUDE.md
- [ ] Three-stage review pipeline documented (drift -> spec -> quality)
- [ ] Rollback to PRE_TASK_SHA on repeated drift failure
- [ ] Process flow diagram updated with drift detection node

**Verify:** `grep -c "Plan Drift Detection" skills/subagent-driven-development/SKILL.md` -> "1"

**Steps:**

- [ ] **Step 1: Add Plan Drift Detection section**

Insert the following new section AFTER the "## Model Policy" section and BEFORE the "## Handling Implementer Status" section:

```markdown
## Plan Drift Detection

After each implementer subagent completes (reports DONE) and BEFORE dispatching the spec reviewer, check if the subagent stayed within the plan's declared file scope.

### Pre-Task SHA Capture

Before dispatching each implementer subagent, capture the current HEAD:

```bash
PRE_TASK_SHA=$(git rev-parse HEAD)
```

### After Implementer Returns

1. Get actual files changed: `git diff --name-only $PRE_TASK_SHA`
2. Extract the task's declared "Files" section from the plan (Create/Modify/Test paths)
3. Filter against the drift allowlist (see below)
4. Compare:
   - **Undeclared files touched:** Files in the diff (added, modified, or deleted) not in the plan's Files section
   - **Declared files untouched:** Files in the plan that were not in the diff (warning only)

### Drift Allowlist

These file patterns are excluded from drift comparison (common transitive side effects):
- `__init__.py` files (Python import updates)
- Lock files (`*.lock`, `package-lock.json`, `poetry.lock`)
- Generated files matching `.gitignore` patterns

**Extensibility:** Projects can extend the allowlist via CLAUDE.md by adding a `driftAllowlist` section listing additional file patterns (e.g., `go.sum`, `Cargo.lock`). The orchestrator reads CLAUDE.md at the start of subagent-driven-development and merges project-specific patterns with the default allowlist.

### Handling Drift

**If undeclared files were touched (after allowlist filtering):**
- Task fails drift check. Do not proceed to spec review.
- Report: "Implementer modified files not in the plan: [list]. Expected only: [plan files]."
- Re-dispatch the implementer: "You touched files outside your task scope. Revert changes to [undeclared files] and only modify [declared files]."
- If re-dispatch fails again (second drift violation on same files): hard reset to PRE_TASK_SHA (`git reset --hard $PRE_TASK_SHA`) and escalate to the user.
- If drift appears genuinely necessary: ask the user for confirmation before adding the file to the plan. Do not autonomously update plan scope.

**If declared files were untouched:**
- Flag as warning (not a block). The spec reviewer will catch missing functionality.

### Review Pipeline

The review pipeline is now a three-stage gate:
1. **Drift detection** (new) - did the subagent stay within scope?
2. **Spec compliance** (existing) - does the code match the spec?
3. **Code quality** (existing) - is the code well-written?
```

- [ ] **Step 2: Update the process flow diagram**

In the existing process flow diagram (the ```dot block), add the drift detection node. Insert between "Implementer subagent implements, tests, commits, self-reviews" and "Dispatch spec reviewer subagent":

Add these nodes and edges:

```
"Drift detection: files match plan?" [shape=diamond];
"Re-dispatch implementer (scope violation)" [shape=box];

"Implementer subagent implements, tests, commits, self-reviews" -> "Drift detection: files match plan?";
"Drift detection: files match plan?" -> "Dispatch spec reviewer subagent (...)" [label="yes"];
"Drift detection: files match plan?" -> "Re-dispatch implementer (scope violation)" [label="no"];
"Re-dispatch implementer (scope violation)" -> "Drift detection: files match plan?" [label="re-check"];
```

Remove the direct edge from implementer to spec reviewer.

---

### Task 5: Create workflow-checkpoint skill

**Goal:** Create new `skills/workflow-checkpoint/SKILL.md` providing the checkpoint write/read/cleanup interface.

**Files:**
- Create: `skills/workflow-checkpoint/SKILL.md`

**Acceptance Criteria:**
- [ ] Skill file exists with proper frontmatter
- [ ] Write checkpoint interface documented
- [ ] Read checkpoint interface documented
- [ ] Cleanup interface documented
- [ ] State file JSON schema documented
- [ ] Phase names for each skill listed

**Verify:** `test -f skills/workflow-checkpoint/SKILL.md && echo "exists"` -> "exists"

**Steps:**

- [ ] **Step 1: Create the skill file**

Create `skills/workflow-checkpoint/SKILL.md` with this content:

```markdown
---
name: workflow-checkpoint
description: Write, read, and clean up workflow state checkpoints for cross-session resume. Called by other skills at key moments.
---

# Workflow Checkpoint

Captures workflow state at key moments so a new session can resume from the last checkpoint instead of starting over.

**This skill is called BY other skills. It is not invoked directly by the user.**

## State File

Location: `.claude-workflow-state.json` in the current git working directory root (the worktree root if in a worktree, otherwise the repo root).

### Schema

```json
{
  "activeSkill": "brainstorming | writing-plans | subagent-driven-development",
  "phase": "<phase-name>",
  "stepIndex": 3,
  "artifacts": {
    "specPath": "docs/superpowers/specs/YYYY-MM-DD-topic-design.md",
    "planPath": "docs/superpowers/plans/YYYY-MM-DD-topic.md",
    "branch": "feat/my-feature",
    "worktreePath": "/absolute/path/to/worktree",
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
  "checkpointStalenessHours": 48,
  "lastUpdated": "2026-04-09T15:00:00Z"
}
```

## Write Checkpoint

Called by skills at trigger points. Merge new state into existing state:
- Update `activeSkill`, `phase`, `stepIndex`, `lastUpdated`
- Append to `decisions` array (do not overwrite)
- Append to `completedPhases` array
- Update `artifacts` fields as they become available
- Set `lastUpdated` to current ISO timestamp

**Implementation:** Read existing `.claude-workflow-state.json` (or start fresh), merge fields, write back.

## Read Checkpoint

Called by resume detection in `using-superpowers`. Returns parsed state after validation:
1. Read `.claude-workflow-state.json`
2. Validate referenced files exist (`specPath`, `planPath`)
3. Validate branch exists: `git branch --list <branch>`
4. Check for in-progress rebase: `git status` showing "rebase in progress"
5. Return parsed state or report validation failures

## Cleanup

Called by `finishing-a-development-branch` on completion, or when user declines resume:
- Delete `.claude-workflow-state.json`
- No confirmation needed (caller handles confirmation)

## Phase Names by Skill

### brainstorming
- `explore-context`
- `offer-visual-companion`
- `ask-clarifying-questions`
- `propose-approaches`
- `present-design`
- `write-design-doc`
- `spec-self-review`
- `adversarial-spec-review`
- `user-reviews-spec`
- `transition-to-implementation`

### writing-plans
- `plan-written`
- `adversarial-plan-review`
- `execution-handoff`

### subagent-driven-development
- `task-N-in-progress` (where N is the task number)
- `task-N-drift-check`
- `task-N-spec-review`
- `task-N-quality-review`
- `task-N-completed`
- `final-code-review`
- `finishing-branch`
```

---

### Task 6: Add resume detection to using-superpowers

**Goal:** Modify `skills/using-superpowers/SKILL.md` to detect incomplete workflow state at session start and prompt for resume.

**Files:**
- Modify: `skills/using-superpowers/SKILL.md`

**Acceptance Criteria:**
- [ ] New "Workflow Resume Detection" section exists
- [ ] Checks current directory AND all worktrees for checkpoint files
- [ ] Checks for in-progress rebase state
- [ ] Staleness window is 48 hours default, configurable
- [ ] Never silently discards without prompting
- [ ] Resume invokes the appropriate skill with context

**Verify:** `grep -c "Workflow Resume Detection" skills/using-superpowers/SKILL.md` -> "1"

**Steps:**

- [ ] **Step 1: Add Workflow Resume Detection section**

Insert the following section AFTER the `<EXTREMELY-IMPORTANT>` block (after the closing `</EXTREMELY-IMPORTANT>` tag) and BEFORE the "## Instruction Priority" section. This placement ensures the critical SUBAGENT-STOP and EXTREMELY-IMPORTANT blocks are read first, then resume detection runs before the normal skill flow:

```markdown
## Workflow Resume Detection

At session start, before any other skill logic, check for incomplete workflow state:

1. Check for `.claude-workflow-state.json` in the current working directory AND scan all worktrees (`git worktree list`) for checkpoint files. Also check for in-progress rebase state (`git status` showing "rebase in progress") and offer `git rebase --abort` if found.

2. If checkpoint found and `lastUpdated` within the staleness window (default 48 hours, configurable via `checkpointStalenessHours` in the state file):
   - Read and validate the state (see `workflow-checkpoint` skill for validation rules)
   - Present to user: "Detected incomplete workflow: [activeSkill] at phase [phase]. Branch: [branch]. Last checkpoint: [time ago]. Resume?"
   - If yes: invoke the appropriate skill with resume context:
     - **brainstorming:** Skip completed phases, provide decisions already made so it doesn't re-ask questions
     - **writing-plans:** If plan written but not reviewed, run adversarial review. If complete, invoke subagent-driven-development.
     - **subagent-driven-development:** Use `.tasks.json` as the single source of truth for task completion state, continue from next pending task
   - If no: delete the state file and proceed normally

3. If checkpoint found but older than staleness window: "Stale workflow state detected (X hours old). Clean up or resume?" Never silently discard without prompting.

4. If no checkpoint found: proceed normally with skill flow below.
```

---

### Task 7: Add checkpoint triggers to brainstorming

**Goal:** Modify `skills/brainstorming/SKILL.md` to write checkpoint state after each checklist step completes.

**Files:**
- Modify: `skills/brainstorming/SKILL.md`

**Acceptance Criteria:**
- [ ] Checkpoint trigger instruction added to the checklist section
- [ ] Decision capture specified for clarifying questions, approach selection, and design approval
- [ ] Phase names listed for each step

**Verify:** `grep -c "Write checkpoint" skills/brainstorming/SKILL.md` -> at least "1"

**Steps:**

- [ ] **Step 1: Add checkpoint trigger instruction**

After the checklist (after the "Do NOT create all 10 tasks at once" paragraph), add:

```markdown
### Checkpoint Triggers

After completing each checklist step (marking the task as completed), write a checkpoint to `.claude-workflow-state.json`:

- Set `activeSkill` to `"brainstorming"`
- Set `phase` to the current phase name (see workflow-checkpoint skill for phase names)
- Append the phase to `completedPhases`
- After clarifying questions: append each Q&A pair to `decisions` array
- After approach selection: append the chosen approach to `decisions`
- After each design section approval: append the section name and approval to `decisions`
- After writing spec: set `artifacts.specPath` to the spec file path

This enables cross-session resume. If the session crashes, a new session can skip completed phases and avoid re-asking questions the user already answered.
```

---

### Task 8: Add checkpoint triggers to writing-plans

**Goal:** Modify `skills/writing-plans/SKILL.md` to write checkpoint state at key moments.

**Files:**
- Modify: `skills/writing-plans/SKILL.md`

**Acceptance Criteria:**
- [ ] Checkpoint trigger instruction added after plan writing
- [ ] Captures plan path and task IDs

**Verify:** `grep -c "Write checkpoint" skills/writing-plans/SKILL.md` -> at least "1"

**Steps:**

- [ ] **Step 1: Add checkpoint trigger instruction**

Insert the following AFTER the "## Self-Review" section and BEFORE the "## Adversarial Plan Review" section:

```markdown
### Checkpoint Triggers

Write a checkpoint to `.claude-workflow-state.json` at these moments:

1. **After plan document is written:** Set `activeSkill` to `"writing-plans"`, `phase` to `"plan-written"`, `artifacts.planPath` to the plan file path, `artifacts.taskIds` to the created task IDs.

2. **After adversarial plan review completes:** Set `phase` to `"adversarial-plan-review"`.

3. **After execution handoff:** Set `phase` to `"execution-handoff"`, update `activeSkill` to `"subagent-driven-development"`.
```

---

### Task 9: Add checkpoint triggers to subagent-driven-development

**Goal:** Modify `skills/subagent-driven-development/SKILL.md` to write checkpoint state after each task completes.

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md`

**Acceptance Criteria:**
- [ ] Checkpoint trigger instruction added
- [ ] Phase updates per task lifecycle stage

**Verify:** `grep -c "Write checkpoint" skills/subagent-driven-development/SKILL.md` -> at least "1"

**Steps:**

- [ ] **Step 1: Add checkpoint trigger instruction**

Insert the following in the "## Task Persistence Sync" section, AFTER the existing sync instructions:

```markdown
### Workflow Checkpoint

In addition to `.tasks.json` sync, write a checkpoint to `.claude-workflow-state.json` after each task completes:

- Set `activeSkill` to `"subagent-driven-development"`
- Set `phase` to `"task-N-completed"` (where N is the task number)
- `.tasks.json` remains the single source of truth for task completion state. The checkpoint file only stores skill-level context (active skill, current phase, branch/worktree path).

Also checkpoint at these moments:
- Before drift detection: `"task-N-drift-check"`
- Before spec review: `"task-N-spec-review"`
- Before quality review: `"task-N-quality-review"`
- Before final code review: `"final-code-review"`
- Before finishing branch: `"finishing-branch"`
```
