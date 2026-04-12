# Model Selection Guide

Shared reference for choosing which model to use when dispatching subagents. All skills that dispatch subagents MUST consult this guide.

## 3-Tier Scale

Match the model to the cognitive demand of the **specific subagent dispatch**, not the overall project. A complex project still uses haiku for exploration and sonnet for implementation.

| Tier | Model | Cognitive Profile | Examples |
|------|-------|-------------------|----------|
| **Light** | `model: "haiku"` | Read-only, pattern matching, simple transforms | Codebase exploration, file searches, formatting, gathering context, running commands and reporting output |
| **Standard** | `model: "sonnet"` | Write code, follow specs, targeted reasoning | Implementation, writing tests, making edits, standard debugging, writing docs |
| **Heavy** | `model: "opus"` | Judge, argue, reconcile, architect | Adversarial review, architectural decisions, complex multi-file reasoning, reconciliation, final quality gates |

## Hard Constraint

`claude-sonnet-4-5` is **banned**. The `"sonnet"` alias must resolve to `claude-sonnet-4-6`. The only permitted models are:

- `claude-opus-4-6` (Heavy tier)
- `claude-sonnet-4-6` (Standard tier)
- `claude-haiku-4-5` (Light tier)

Always pass the `model` parameter explicitly when dispatching subagents. Never omit it.

## Per-Skill Application

| Skill | Subagent Role | Tier |
|-------|---------------|------|
| **brainstorming** | Adversarial review (advocate/challenger) | Heavy (opus) |
| **writing-plans** | Adversarial review (advocate/challenger) | Heavy (opus) |
| **subagent-driven-development** | Implementer | Standard (sonnet) |
| **subagent-driven-development** | Spec compliance reviewer | Heavy (opus) |
| **subagent-driven-development** | Code quality reviewer | Heavy (opus) |
| **subagent-driven-development** | Final code reviewer | Heavy (opus) |
| **dispatching-parallel-agents** | Depends on task | Match tier to what agent does |
| **systematic-debugging** | Hypothesis testing / exploration | Light (haiku) |
| **systematic-debugging** | Fix implementation | Standard (sonnet) |
| **requesting-code-review** | Code reviewer | Heavy (opus) |
| **writing-skills** | Testing subagents | Standard (sonnet) |

**Explore-type agents** - any subagent dispatched with `subagent_type: "Explore"`, or whose sole purpose is reading files, searching code, or gathering context without making edits - always use **Light (haiku)**.
