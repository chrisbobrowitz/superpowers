# Subagent Skill Manifest

You have been dispatched with access to execution-phase skills. Invoke them via the Skill tool when they are relevant to your task.

## Available Skills

| Skill | When to Invoke |
|-------|----------------|
| `superpowers-extended-cc:test-driven-development` | Before writing implementation code - write tests first, then make them pass |
| `superpowers-extended-cc:systematic-debugging` | When encountering bugs, test failures, or unexpected behavior - before proposing fixes |
| `superpowers-extended-cc:verification-before-completion` | Before claiming your work is done - run verification and confirm output |
| `superpowers-extended-cc:writing-plans` | When your task is complex enough to need decomposition into subtasks |

## How to Invoke

```
Skill(skill: "superpowers-extended-cc:<skill-name>")
```

When a skill is invoked, its full content is loaded and presented to you. Follow its instructions directly.

## Skills You Must NOT Invoke

These are orchestration-level skills managed by your dispatcher. Invoking them would create recursive dispatch loops:

- `superpowers-extended-cc:brainstorming`
- `superpowers-extended-cc:dispatching-parallel-agents`
- `superpowers-extended-cc:subagent-driven-development`
- `superpowers-extended-cc:workflow-checkpoint`
- `superpowers-extended-cc:using-superpowers`

## Skill Usage Guidelines

- Only invoke a skill when it genuinely applies to your task. The manifest gives you access, not an obligation.
- If you invoke a skill and it turns out to be wrong for the situation, you do not need to follow it.
- Skills are rigid workflows (TDD, debugging) or flexible patterns. The skill itself tells you which.
- You still follow your dispatcher's instructions. Skills supplement those instructions, they do not override them.
