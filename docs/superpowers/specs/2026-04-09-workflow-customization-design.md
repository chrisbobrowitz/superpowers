# Workflow Customization Design Spec

**Date:** 2026-04-09
**Author:** Christopher Bobrowitz
**Status:** Draft

## Overview

Customize the superpowers fork at `chrisbobrowitz/superpowers` to enforce an opinionated development workflow. The goal is to remove deployment artifacts, enforce brainstorming discipline, add adversarial review gates after both spec and plan phases, mandate TDD, auto-select subagent-driven development, and ensure code review and branch finishing are never skipped.

All changes are in-place modifications to existing skill files (Approach 1). No new skills are created.

## Section 1: File Removals

**Goal:** Strip all GHA workflows, deployment scripts, and contribution templates since this fork won't accept external PRs or publish releases.

**Files to delete:**
- `.github/` (entire directory)
  - `ISSUE_TEMPLATE/bug_report.md`
  - `ISSUE_TEMPLATE/config.yml`
  - `ISSUE_TEMPLATE/feature_request.md`
  - `ISSUE_TEMPLATE/platform_support.md`
  - `PULL_REQUEST_TEMPLATE.md`
  - `FUNDING.yml`
- `scripts/bump-version.sh`

**Files to keep as-is:**
- `CLAUDE.md` - low cost to keep, doesn't interfere with fork behavior, and reduces noise in upstream diffs

## Section 2: Brainstorming Re-trigger

**File:** `skills/using-superpowers/SKILL.md`

**Goal:** Mid-conversation, re-invoke brainstorming for any new non-trivial ask. Bias toward triggering.

**Logic for mid-conversation re-trigger:**
1. Has a brainstorming cycle already completed for THIS SPECIFIC ask? If yes, skip.
2. Is this a new ask (not a follow-up to the current in-progress task)? If yes, evaluate.
3. Judgment call with bias toward triggering: Would this ask benefit from exploring requirements, approaches, or trade-offs? If even slightly yes, invoke brainstorming.

**Red flags that should trigger brainstorming:**
- "Can you also add..." (new feature on top of existing work)
- "Actually, let's change..." (pivot in direction)
- "New thing -" / "Next task -" (explicit new scope)
- Any ask that introduces new behavior, new files, or new integration points

**Cases where it's fine to skip:**
- "Fix this typo"
- "Rename X to Y"
- "Run the tests"
- Small, self-evident code changes (add a log line, update a constant)
- Direct follow-up questions about in-progress work

**Flow diagram change:** Add a decision node between "User message received" and "Might any skill apply?" - "New non-trivial ask? -> Re-invoke brainstorming."

## Section 3: Adversarial Spec Review Gate

**File:** `skills/brainstorming/SKILL.md`

**Goal:** After spec self-review, before user reviews the spec, dispatch two opus subagents to adversarially review the spec. Fix issues autonomously, only escalate true unknowns.

**New step 7.5 in the checklist (between self-review and user review):**

1. Dispatch two opus subagents in parallel:
   - **Advocate**: Argues the spec is solid. Identifies strengths, validates completeness, confirms feasibility. Must genuinely defend the design, not rubber-stamp.
   - **Challenger**: Argues against the spec. Finds gaps, ambiguities, missing edge cases, flawed assumptions, better alternatives. Must genuinely attack, not nitpick formatting.

2. Both receive the full spec document content. Both are told the other exists. Neither sees the other's output.

3. Orchestrator reconciles:
   - Challenger raises a point the advocate also flagged as a risk -> high-confidence issue, fix it.
   - Challenger raises a point the advocate explicitly defended with reasoning -> evaluate both arguments, pick the stronger one.
   - Both agree -> no action needed.
   - Neither can resolve, depends on user intent or domain knowledge -> surface to user.

4. Implement fixes directly into the spec.

5. Proceed to user spec review (step 8) with the improved spec.

**Checklist updates from 9 items to 10.** Flow diagram gets a new "Adversarial spec review" node between "Spec self-review" and "User reviews spec?"

## Section 4: Adversarial Plan Review Gate

**File:** `skills/writing-plans/SKILL.md`

**Goal:** After plan self-review, before execution begins, dispatch two opus subagents to adversarially review the plan. Same pattern as spec review.

**New step inserted after plan self-review:**

1. Dispatch two opus subagents in parallel:
   - **Advocate**: Argues the plan is ready to execute. Validates task ordering, granularity, completeness against the spec, TDD structure, and that each task is independently verifiable.
   - **Challenger**: Argues the plan has problems. Looks for missing steps, incorrect ordering, tasks too large or too small, implicit dependencies not captured, gaps in test coverage strategy, assumptions about the codebase that haven't been verified.

2. Same reconciliation logic as spec review.

3. Update the plan in-place with fixes.

4. Proceed to execution.

## Section 5: Mandatory TDD and Auto-select Subagent-Driven

**File:** `skills/writing-plans/SKILL.md`

### TDD Enforcement

- Every task in the plan must specify tests-first ordering.
- Task description template gets a mandatory "Tests" section that comes BEFORE "Implementation."
- Plan self-review checklist adds: "Does every task that produces code have tests written before implementation?" If not, reorder.
- Explicit statement: "All tasks that produce application or production code follow TDD. Tests are written and verified failing before implementation code. No exceptions for code-producing tasks."
- Skill file edits, configuration changes, documentation, and other non-code tasks are excluded from the TDD requirement.

### Auto-select Subagent-Driven Development

- Remove the `AskUserQuestion` choice between subagent-driven and parallel session.
- Always invoke `subagent-driven-development` directly. No prompt, no decision point.
- Replace the HARD-GATE requiring user choice with a HARD-GATE requiring direct invocation of subagent-driven-development.

## Section 6: Mandatory Code Review and Finishing Branch

**File:** `skills/subagent-driven-development/SKILL.md`

### Code Review

- Existing per-task spec reviewer + code quality reviewer + final code reviewer all stay.
- Add explicit language: "Code review is mandatory. Never skip the final code review round regardless of task count or perceived simplicity."
- After the final code review, all findings must be addressed before proceeding. No "minor, will fix later."

### Finishing Branch

- Existing handoff to finishing-a-development-branch stays.
- Add explicit language: "You MUST invoke finishing-a-development-branch before any git push or PR creation. No shortcutting directly to `gh pr create` or `git push`."
- **WIP push escape hatch:** When the user explicitly requests a WIP push for backup or collaboration, allow it without requiring finishing-a-development-branch. The mandate applies to completed work, not in-progress backups.

## Section 7: Plugin Swap

**Sequence:**
1. Push all changes to a branch on the fork
2. Create PR against `chrisbobrowitz/superpowers` main
3. Merge the PR
4. Uninstall the current marketplace plugin (`superpowers-extended-cc@superpowers-extended-cc-marketplace`)
5. Install from the GitHub fork (`chrisbobrowitz/superpowers`)
6. Verify the new plugin loads and all skills are listed correctly

## Model Policy

All subagents use opus. No sonnet. No haiku. This applies to:
- Adversarial review subagents (spec and plan)
- Implementation subagents in subagent-driven-development
- Code review subagents
- Any other subagent dispatched by any skill

**Override in subagent-driven-development:** The existing skill has model selection logic that chooses between cheap/standard/capable tiers based on task complexity. This is overridden: all implementation subagents use opus regardless of task complexity. Remove or replace the model selection logic.

## Files Modified (Summary)

| File | Change |
|------|--------|
| `.github/` | Delete entire directory |
| `scripts/bump-version.sh` | Delete |
| `skills/using-superpowers/SKILL.md` | Add brainstorming re-trigger logic |
| `skills/brainstorming/SKILL.md` | Add adversarial spec review gate (step 7.5) |
| `skills/writing-plans/SKILL.md` | Add adversarial plan review gate, enforce TDD, auto-select subagent-driven |
| `skills/subagent-driven-development/SKILL.md` | Reinforce mandatory code review and finishing branch |
