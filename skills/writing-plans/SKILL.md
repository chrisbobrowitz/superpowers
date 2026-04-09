---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## CRITICAL CONSTRAINTS — Read Before Anything Else

**You MUST NOT call `EnterPlanMode` or `ExitPlanMode` at any point during this skill.** This skill operates in normal mode and hands off to subagent-driven-development at the end. Calling `EnterPlanMode` traps the session in plan mode where Write/Edit are restricted. Calling `ExitPlanMode` breaks the workflow and skips execution. If you feel the urge to call either, STOP — follow this skill's instructions instead.

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** This should be run in a dedicated worktree (created by brainstorming skill).

**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## REQUIRED FIRST STEP: Initialize Task Tracking

**BEFORE exploring code or writing the plan, you MUST:**

1. Call `TaskList` to check for existing tasks from brainstorming
2. If tasks exist: you will enhance them with implementation details as you write the plan
3. If no tasks: you will create them with `TaskCreate` as you write each plan task

**Do not proceed to exploration until TaskList has been called.**

```
TaskList
```

## Task Granularity

**Each task is a coherent unit of work that produces a testable, committable outcome.**

See `skills/shared/task-format-reference.md` for the full granularity guide.

Key principle: TDD cycles happen WITHIN tasks, not as separate tasks. A task is "Implement X with tests" — the red-green-refactor steps are execution detail inside the task, not task boundaries.

**TDD mandate:** All tasks that produce application or production code MUST specify tests-first ordering. The "Steps" section of every code-producing task begins with "Write the failing test" before any implementation. Skill file edits, configuration changes, and documentation are excluded from this requirement.

**Scope test:**
1. Can it be verified independently? (if no → too small)
2. Does it touch more than one concern? (if yes → too big)
3. Would it get its own commit? (if no → merge with adjacent task)

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Goal:** [One sentence — what this task produces]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Acceptance Criteria:**
- [ ] [Concrete, testable criterion]
- [ ] [Another criterion]

**Verify:** `exact test command` → expected output

**Steps:**

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Remember
- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

**4. TDD ordering:** Does every task that produces code have tests written before implementation in its Steps section? If any task has implementation before tests, reorder the steps.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

### Checkpoint Triggers

Write a checkpoint to `.claude-workflow-state.json` at these moments:

1. **After plan document is written:** Set `activeSkill` to `"writing-plans"`, `phase` to `"plan-written"`, `artifacts.planPath` to the plan file path, `artifacts.taskIds` to the created task IDs.

2. **After adversarial plan review completes:** Set `phase` to `"adversarial-plan-review"`.

3. **After execution handoff:** Set `phase` to `"execution-handoff"`, update `activeSkill` to `"subagent-driven-development"`.

## Adversarial Plan Review

After self-review, dispatch two opus subagents in parallel to adversarially review the plan. Same pattern as the brainstorming spec review.

**Dispatch two opus subagents in parallel:**

1. **Advocate subagent:** Argues the plan is ready to execute. Validates task ordering, granularity, completeness against the spec, TDD structure, and that each task is independently verifiable. Prompt must include:
   - The full plan document content
   - The spec document path (so advocate can reference it)
   - "You are the ADVOCATE. A CHALLENGER is reviewing this same plan."
   - "Keep under 500 words."

2. **Challenger subagent:** Argues the plan has problems. Looks for missing steps, incorrect ordering, tasks too large or too small, implicit dependencies not captured, gaps in test coverage strategy, assumptions about the codebase that haven't been verified. Prompt must include:
   - The full plan document content
   - The spec document path
   - "You are the CHALLENGER. An ADVOCATE is reviewing this same plan."
   - "Keep under 500 words. Focus on top 5-7 most impactful issues."

**Both subagents MUST use model: opus.**

**Reconciliation:** Same rules as the brainstorming adversarial spec review:

| Situation | Action |
|-----------|--------|
| Challenger raises point advocate also flagged as risk | High-confidence issue. Fix it. |
| Challenger raises point advocate explicitly defended | Evaluate both arguments. Pick the stronger one. |
| Both agree on a point | No action needed. |
| Neither can resolve, depends on user intent/domain knowledge | Surface to user. |

After reconciliation, update the plan document in-place with fixes. Then proceed to execution.

## Execution Handoff

<HARD-GATE>
STOP. You are about to complete the plan. DO NOT call EnterPlanMode or ExitPlanMode. Both are FORBIDDEN.

You MUST invoke `superpowers-extended-cc:subagent-driven-development` directly. No user choice. No interactive prompt. Subagent-driven development is always the execution method.
</HARD-GATE>

**Announce:** "Plan complete and saved to `docs/superpowers/plans/<filename>.md`. Proceeding with subagent-driven development."

Invoke the Skill tool: `superpowers-extended-cc:subagent-driven-development`
- The skill handles everything: subagent dispatch, review, task tracking
- You stay in this session as the coordinator
- Do NOT start working on tasks directly

---

## Native Task Integration Reference

Use Claude Code's native task tools (v2.1.16+) to create structured tasks alongside the plan document.

### Creating Native Tasks

For each task in the plan, create a corresponding native task. Embed metadata as a `json:metadata` code fence at the end of the description — this is the only way to ensure metadata survives TaskGet (the `metadata` parameter on TaskCreate is accepted but not returned by TaskGet).

```yaml
TaskCreate:
  subject: "Task N: [Component Name]"
  description: |
    **Goal:** [From task's Goal line]

    **Files:**
    [From task's Files section]

    **Acceptance Criteria:**
    [From task's Acceptance Criteria]

    **Verify:** [From task's Verify line]

    **Steps:**
    [Key actions from task's Steps — abbreviated]

    ```json:metadata
    {"files": ["path/to/file1.py"], "verifyCommand": "pytest tests/path/ -v", "acceptanceCriteria": ["criterion 1", "criterion 2"]}
    ```
  activeForm: "Implementing [Component Name]"
```

### Why Embedded Metadata

The `metadata` parameter on TaskCreate is accepted but **not returned by TaskGet**. Embedding it as a `json:metadata` code fence in the description ensures:
- TaskGet returns the full metadata (it's part of the description)
- Cross-session resume can parse it from .tasks.json
- Subagent dispatch can extract it for implementer prompts

See `skills/shared/task-format-reference.md` for the full metadata schema.

### Setting Dependencies

After all tasks created, set blockedBy relationships:

```
TaskUpdate:
  taskId: [task-id]
  addBlockedBy: [prerequisite-task-ids]
```

### During Execution

Update task status as work progresses:

```
TaskUpdate:
  taskId: [task-id]
  status: in_progress  # when starting

TaskUpdate:
  taskId: [task-id]
  status: completed    # when done
```

---

## Task Persistence

At plan completion, write the task persistence file **in the same directory as the plan document**.

If the plan is saved to `docs/superpowers/plans/2026-01-15-feature.md`, the tasks file MUST be saved to `docs/superpowers/plans/2026-01-15-feature.md.tasks.json`.

```json
{
  "planPath": "docs/superpowers/plans/2026-01-15-feature.md",
  "tasks": [
    {
      "id": 0,
      "subject": "Task 0: ...",
      "status": "pending",
      "description": "**Goal:** ...\n\n**Files:**\n...\n\n```json:metadata\n{\"files\": [\"path/to/file.py\"], \"verifyCommand\": \"pytest tests/ -v\", \"acceptanceCriteria\": [\"criterion 1\"]}\n```"
    },
    {
      "id": 1,
      "subject": "Task 1: ...",
      "status": "pending",
      "blockedBy": [0],
      "description": "**Goal:** ...\n\n```json:metadata\n{\"files\": [], \"verifyCommand\": \"\", \"acceptanceCriteria\": []}\n```"
    }
  ],
  "lastUpdated": "<timestamp>"
}
```

Both the plan `.md` and `.tasks.json` must be co-located in `docs/superpowers/plans/`.

### Resuming Work

To resume work from a prior session (not initial execution), a new session can run:
```
/superpowers-extended-cc:executing-plans <plan-path>
```

The skill reads the `.tasks.json` file and continues from where it left off. Note: this is specifically for cross-session resume. Initial execution always uses subagent-driven-development (see Execution Handoff above).
