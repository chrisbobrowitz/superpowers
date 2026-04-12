# Model Selection and Workflow Fixes

**Date:** 2026-04-12
**Status:** Approved

## Problem Statement

Three issues with the current superpowers skill system:

1. **Hardcoded model selection** - Skills either hardcode `model: "opus"` or `model: "sonnet"` with no flexibility based on task complexity. Haiku is never used despite being appropriate for lightweight subagent work (exploration, formatting, context gathering).

2. **Brainstorm loop** - The `using-superpowers` skill's mid-conversation re-trigger logic has a "bias toward triggering" that can re-invoke brainstorming after implementation has started, creating a brainstorm -> spec -> implementation -> brainstorm loop requiring manual intervention.

3. **Unnecessary user gates** - The workflow pauses for user confirmation at multiple points where auto-proceeding is preferred: spec review before writing-plans, writing-plans before subagent-driven-development, and the 4-option menu in finishing-a-development-branch.

Additionally, an upstream fix (`c78dfe33`) for the pre-commit task-checking hook needs to be incorporated.

## Changes

### 1. Shared Model Selection Guide

**New file:** `skills/shared/model-selection-guide.md`

A shared reference document consulted by all skills when dispatching subagents.

#### 3-Tier Scale

| Tier | Model | Cognitive Profile | Examples |
|------|-------|-------------------|----------|
| Light | `model: "haiku"` | Read-only, pattern matching, simple transforms | Codebase exploration, file searches, formatting, gathering context, running commands and reporting output |
| Standard | `model: "sonnet"` | Write code, follow specs, targeted reasoning | Implementation, writing tests, making edits, standard debugging, writing docs |
| Heavy | `model: "opus"` | Judge, argue, reconcile, architect | Adversarial review, architectural decisions, complex multi-file reasoning, reconciliation, final quality gates |

#### Core Rule

Match the model to the cognitive demand of the specific subagent dispatch, not the overall project. A complex project still uses haiku for exploration and sonnet for implementation.

#### Hard Constraint

`claude-sonnet-4-5` is banned. The `"sonnet"` alias must resolve to `claude-sonnet-4-6`. Only `claude-opus-4-6`, `claude-sonnet-4-6`, and `claude-haiku-4-5` are permitted.

#### Per-Skill Application

- **brainstorming**: Adversarial review subagents = Heavy (opus)
- **writing-plans**: Adversarial review subagents = Heavy (opus)
- **subagent-driven-development**: Implementers = Standard (sonnet). Spec reviewers = Heavy (opus). Code quality reviewers = Heavy (opus). Final reviewer = Heavy (opus)
- **dispatching-parallel-agents**: Apply the tier matching what each parallel agent does
- **systematic-debugging**: Hypothesis testing/exploration = Light (haiku). Fix implementation = Standard (sonnet)
- **requesting-code-review**: Code reviewer subagent = Heavy (opus)
- **writing-skills**: Testing subagents = Standard (sonnet)
- **Explore-type agents** (any subagent dispatched with `subagent_type: "Explore"` or whose sole purpose is reading files, searching code, or gathering context without making edits): Always Light (haiku)

### 2. Remove Mid-Conversation Brainstorm Re-trigger

**File:** `skills/using-superpowers/SKILL.md`

Remove the entire "Mid-Conversation Re-trigger" section, including:
- The re-trigger evaluation logic
- "Red flags that SHOULD trigger brainstorming" list
- "Cases where it's fine to skip" list
- "Default: trigger" directive

Replace with:

> Brainstorming runs once at session start for the initial ask. It does not re-trigger automatically mid-conversation. If the user wants to brainstorm a new idea during an active session, they invoke it explicitly.

Remove from the Red Flags table:
- "We already brainstormed this session"
- "This is a follow-up"
- "The user said 'also'"

Update the process flow diagram to remove the "New non-trivial ask?" diamond and the re-trigger path.

### 3. Auto-Proceed: Spec to Implementation

**File:** `skills/brainstorming/SKILL.md`

- Remove checklist step 9 ("User reviews spec") and renumber step 10 to 9
- Remove the "User Review Gate" section that asks the user to review the spec before proceeding
- After adversarial review fixes are applied, immediately invoke `writing-plans`

**File:** `skills/writing-plans/SKILL.md`

- Verify the HARD-GATE ("You MUST invoke subagent-driven-development directly. No user choice. No interactive prompt.") has no competing instructions elsewhere in the file
- Check for any "ask the user", "present options", or "wait for" language that could override the HARD-GATE
- If found, remove the competing language

### 4. Auto-Finish: Push and PR

**File:** `skills/finishing-a-development-branch/SKILL.md`

Replace the 4-option menu with deterministic behavior:

1. Verify tests pass
2. Verify branch is up-to-date with main (rebase if needed)
3. Push the branch
4. Create a PR against main using `gh pr create`
5. Report the PR URL

No options menu. No user confirmation. The only gate: if tests fail, stop and report the failure.

**Scope:** This auto-finish behavior applies only when `finishing-a-development-branch` is invoked by the workflow pipeline (after subagent-driven-development completes). It does not affect manual branch management outside the skill system.

### 5. Upstream Hook Changes (c78dfe33)

**Delete:** `hooks/pre-commit-check-tasks`

**Edit:** `hooks/examples/pre-commit-check-tasks.sh`
- Change blocking condition from "not in completed/cancelled/deleted" to only `in_progress`
- Update error message to reference in-progress tasks specifically

**Edit:** `hooks/hooks.json`
- Remove the PreToolUse hook entry for pre-commit-check-tasks

**Edit:** `README.md`
- Reframe pre-commit hook as optional opt-in
- Add instructions for enabling via `.claude/settings.local.json`
- Note that pending tasks pass through for per-task workflows

## Files Changed

| File | Action | Change |
|------|--------|--------|
| `skills/shared/model-selection-guide.md` | Create | 3-tier model selection reference |
| `skills/brainstorming/SKILL.md` | Edit | Remove user review gate, add model guide reference |
| `skills/writing-plans/SKILL.md` | Edit | Tighten auto-proceed gate, add model guide reference |
| `skills/subagent-driven-development/SKILL.md` | Edit | Replace hardcoded models with guide reference |
| `skills/using-superpowers/SKILL.md` | Edit | Remove mid-conversation re-trigger |
| `skills/finishing-a-development-branch/SKILL.md` | Edit | Replace options menu with auto push+PR |
| `skills/dispatching-parallel-agents/SKILL.md` | Edit | Add model guide reference |
| `skills/systematic-debugging/SKILL.md` | Edit | Add model guide reference |
| `skills/requesting-code-review/SKILL.md` | Edit | Add model guide reference |
| `skills/writing-skills/SKILL.md` | Edit | Add model guide reference |
| `hooks/pre-commit-check-tasks` | Delete | Upstream: make hook opt-in |
| `hooks/examples/pre-commit-check-tasks.sh` | Edit | Upstream: block only in_progress |
| `hooks/hooks.json` | Edit | Upstream: remove PreToolUse entry |
| `README.md` | Edit | Upstream: document opt-in hook |

## Testing

**Structural checks:**
- Verify all skill files parse correctly (no broken markdown)
- Verify the model-selection-guide is referenced consistently across all skills that dispatch subagents
- Verify the pre-commit hook only blocks on in_progress tasks

**Behavioral spot-checks:**
- Run a brainstorming session and confirm it auto-proceeds to writing-plans without pausing for user spec review
- Confirm writing-plans auto-invokes subagent-driven-development without presenting options
- Confirm finishing-a-development-branch pushes and creates PR without presenting the 4-option menu
- Confirm brainstorming does not re-trigger mid-session after implementation has started
- Verify haiku is used for Explore-type subagent dispatches, sonnet for implementers, opus for reviewers
