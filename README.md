# Superpowers Extended CC (Personal Fork)

Personal fork of [pcvelz/superpowers](https://github.com/pcvelz/superpowers) (itself a fork of [obra/superpowers](https://github.com/obra/superpowers)) with opinionated workflow customizations.

## What This Fork Changes

This fork enforces a specific development workflow on top of the upstream superpowers-extended-cc plugin. All changes are in-place modifications to existing skill files.

### Workflow Customizations

| Customization | Skill Modified | What It Does |
|---------------|----------------|--------------|
| Brainstorming scope | `using-superpowers` | Brainstorming runs once at session start. No automatic mid-conversation re-trigger. Users invoke explicitly if needed. |
| Adversarial spec review | `brainstorming` | After spec self-review, dispatches subagents (advocate + challenger) to adversarially review the spec |
| Adversarial plan review | `writing-plans` | Same advocate/challenger pattern applied to implementation plans |
| Mandatory TDD | `writing-plans` | All code-producing tasks must specify tests-first ordering. No exceptions for code. Skill edits, config, and docs are excluded. |
| Auto-select subagent-driven | `writing-plans` | Removes the user choice between subagent-driven and parallel session. Always uses subagent-driven development. |
| 3-tier model selection | `subagent-driven-development`, all skills | Shared model guide: haiku for exploration, sonnet for implementation, opus for review. See `skills/shared/model-selection-guide.md`. |
| Mandatory code review | `subagent-driven-development` | Final code review is mandatory with a HARD-GATE. All findings must be addressed before proceeding. |
| Mandatory finishing branch | `subagent-driven-development` | Must invoke finishing-a-development-branch before any push or PR. WIP pushes allowed when explicitly requested. |
| Auto-finish | `finishing-a-development-branch` | Automatically pushes branch and creates PR. No options menu. Only gate is test failure. |

### Removed from Upstream

- `.github/` directory (issue templates, PR template, funding config)
- `scripts/bump-version.sh`

## Installation

```bash
# Register marketplace
claude plugin marketplace add chrisbobrowitz/superpowers

# Install plugin
claude plugin install superpowers-extended-cc@superpowers-extended-cc-marketplace
```

### Verify Installation

```bash
claude plugin list
```

You should see `superpowers-extended-cc@superpowers-extended-cc-marketplace` listed and enabled.

## The Workflow

1. **brainstorming** - Activates before writing code. Refines ideas through questions, explores alternatives, validates design in sections. Runs adversarial spec review (advocate + challenger) before user review. Saves design document.

2. **using-git-worktrees** - Activates after design approval. Creates isolated workspace on new branch, runs project setup, verifies clean test baseline.

3. **writing-plans** - Activates with approved design. Breaks work into TDD-structured tasks. Runs adversarial plan review. Auto-invokes subagent-driven development.

4. **subagent-driven-development** - Dispatches fresh opus subagent per task with two-stage review (spec compliance, then code quality). Mandatory final code review before finishing.

5. **test-driven-development** - Enforces RED-GREEN-REFACTOR within every code-producing task. Tests written and verified failing before any implementation.

6. **finishing-a-development-branch** - Mandatory before any push or PR. Verifies tests, rebases, pushes branch, creates PR automatically. Cleans up worktree.

**The agent checks for relevant skills before any task.**

## How Native Tasks Work

When `writing-plans` creates tasks, each task carries structured metadata that survives across sessions and subagent dispatch:

```yaml
TaskCreate:
  subject: "Task 1: Add price validation to optimizer"
  description: |
    **Goal:** Validate input prices before optimization runs.

    **Files:**
    - Modify: `src/optimizer.py:45-60`
    - Create: `tests/test_price_validation.py`

    **Acceptance Criteria:**
    - [ ] Negative prices raise ValueError
    - [ ] Empty price list raises ValueError
    - [ ] Valid prices pass through unchanged

    **Verify:** `pytest tests/test_price_validation.py -v`

    ```json:metadata
    {"files": ["src/optimizer.py", "tests/test_price_validation.py"],
     "verifyCommand": "pytest tests/test_price_validation.py -v",
     "acceptanceCriteria": ["Negative prices raise ValueError",
       "Empty price list raises ValueError",
       "Valid prices pass through unchanged"]}
    ```
```

The `json:metadata` block is embedded in the description because `TaskGet` returns the description but not the `metadata` parameter. This ensures metadata is always available — for `executing-plans` verification, `subagent-driven-development` dispatch, and `.tasks.json` cross-session resume.

## What's Inside

### Skills Library

**Testing**
- **test-driven-development** - RED-GREEN-REFACTOR cycle (includes testing anti-patterns reference)

**Debugging**
- **systematic-debugging** - 4-phase root cause process (includes root-cause-tracing, defense-in-depth, condition-based-waiting techniques)
- **verification-before-completion** - Ensure it's actually fixed

**Collaboration**
- **brainstorming** - Socratic design refinement + *native task creation*
- **writing-plans** - Detailed implementation plans + *native task dependencies*
- **executing-plans** - Batch execution with checkpoints
- **dispatching-parallel-agents** - Concurrent subagent workflows
- **requesting-code-review** - Pre-review checklist
- **receiving-code-review** - Responding to feedback
- **using-git-worktrees** - Parallel development branches
- **finishing-a-development-branch** - Merge/PR decision workflow
- **subagent-driven-development** - Fast iteration with two-stage review (spec compliance, then code quality)

**Meta**
- **writing-skills** - Create new skills following best practices (includes testing methodology)
- **using-superpowers** - Introduction to the skills system

## Philosophy

- **Test-Driven Development** - Write tests first, always
- **Systematic over ad-hoc** - Process over guessing
- **Complexity reduction** - Simplicity as primary goal
- **Evidence over claims** - Verify before declaring success

Read more: [Superpowers for Claude Code](https://blog.fsck.com/2025/10/09/superpowers/)

## Recommended Configuration

### Disable Auto Plan Mode

Claude Code may automatically enter Plan mode during planning tasks, which conflicts with the structured skill workflows in this plugin. To prevent this, add `EnterPlanMode` to your permission deny list.

**In your project's `.claude/settings.json`:**

```json
{
  "permissions": {
    "deny": ["EnterPlanMode"]
  }
}
```

This blocks the model from calling `EnterPlanMode`, ensuring the brainstorming and writing-plans skills operate correctly in normal mode. See [upstream discussion](https://github.com/anthropics/claude-code/issues/23384) for context.

### Optional: Block Commits With In-Progress Tasks

When using native tasks, you can optionally block commits while tasks are still in progress. This plugin includes an example hook for this. Pending tasks pass through, enabling per-task commit workflows (e.g., subagent-driven-development can commit after each task).

Add this to your `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/plugins/marketplaces/superpowers-extended-cc-marketplace/hooks/examples/pre-commit-check-tasks.sh"
          }
        ]
      }
    ]
  }
}
```

The hook ships with the plugin at `hooks/examples/pre-commit-check-tasks.sh`. The marketplace path is stable across versions. It parses the session transcript for `TaskCreate`/`TaskUpdate` calls and blocks `git commit` when any tasks are not completed, cancelled, or deleted. Non-commit Bash commands pass through unaffected.

## Updating

```bash
claude plugin update superpowers-extended-cc@superpowers-extended-cc-marketplace
```

## Upstream

This fork tracks [pcvelz/superpowers](https://github.com/pcvelz/superpowers) which tracks [obra/superpowers](https://github.com/obra/superpowers). Workflow customizations are additive modifications to existing skill files. Upstream merges will have predictable conflicts in the modified skills.

## License

MIT License - see LICENSE file for details
