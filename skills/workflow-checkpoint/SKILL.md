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
