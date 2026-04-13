# Skill-Aware Parallel Dispatch

**Date:** 2026-04-13
**Status:** Implementing

## Problem

When Claude dispatches multiple parallel agents via the `dispatching-parallel-agents` skill, those agents cannot invoke superpowers skills. The `<SUBAGENT-STOP>` tag in `using-superpowers` blocks all skill access for subagents. This means:

- All guidance (TDD, debugging, verification) must be manually inlined into dispatch prompts
- Dispatched agents produce lower-quality work because they lack access to tested workflows
- The orchestrator's prompts become bloated with duplicated skill content

## Solution

Upgrade `dispatching-parallel-agents` to automatically include a **skill manifest** in every dispatch prompt. The manifest lists execution-phase skills that subagents can invoke via the Skill tool.

### Design Decisions

1. **In-place upgrade** of `dispatching-parallel-agents` (not a new skill)
2. **Curated execution-phase subset** - subagents get access to TDD, systematic-debugging, verification-before-completion, and writing-plans. Orchestration skills (brainstorming, dispatching-parallel-agents, subagent-driven-development) are excluded to prevent recursive dispatch.
3. **Shared template file** at `skills/shared/subagent-skill-manifest.md` - DRY, reusable by other dispatch skills
4. **Manifest in prompt** - subagents receive a list of available skills and invoke them via the Skill tool on demand. No skill content inlined, keeping prompts lightweight.
5. **Always included** - the manifest is appended to every dispatch prompt. Agents that do not need skills simply never invoke them.

### Changes

| File | Change |
|------|--------|
| `skills/shared/subagent-skill-manifest.md` | New file. Contains the skill manifest template with available skills table, invocation syntax, and exclusion list. |
| `skills/dispatching-parallel-agents/SKILL.md` | Updated to reference the manifest. Added skill manifest to agent prompt requirements and example. |
| `skills/using-superpowers/SKILL.md` | `<SUBAGENT-STOP>` replaced with `<SUBAGENT-SKILL-GATE>`. Subagents with a manifest can invoke listed skills; subagents without a manifest skip the skill entirely. |
| `skills/shared/model-selection-guide.md` | Minor update noting skill-aware agents in the dispatching row. |

### Available Skills for Subagents

| Skill | Purpose |
|-------|---------|
| `test-driven-development` | Write tests before implementation |
| `systematic-debugging` | Structured debugging before proposing fixes |
| `verification-before-completion` | Verify work before claiming done |
| `writing-plans` | Decompose complex tasks into subtasks |

### Excluded Skills (Orchestration-Level)

| Skill | Reason |
|-------|--------|
| `brainstorming` | Design-phase, runs at session start |
| `dispatching-parallel-agents` | Would create recursive agent dispatch |
| `subagent-driven-development` | Orchestration-level workflow |
| `workflow-checkpoint` | Session state management |
| `using-superpowers` | Session initialization |

## Recursion Prevention

Subagents cannot invoke orchestration skills, so they cannot dispatch further agents. This is enforced by the manifest's explicit exclusion list and the `<SUBAGENT-SKILL-GATE>` conditional in `using-superpowers`.
