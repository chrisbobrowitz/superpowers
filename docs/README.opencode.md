# Superpowers for OpenCode

Guide for using this fork with [OpenCode.ai](https://opencode.ai).

## Installation

Add this fork to the `plugin` array in your `opencode.json`:

```json
{
  "plugin": ["superpowers@git+https://github.com/chrisbobrowitz/superpowers.git"]
}
```

Restart OpenCode. It installs the plugin package with Bun, loads `.opencode/plugins/superpowers.js`, and registers the bundled skills automatically.

Verify by asking OpenCode which skills it can see, or by asking: `Tell me about your superpowers`.

### Migrating from the old symlink-based install

If you previously installed with `git clone` and symlinks, remove the old setup:

```bash
rm -f ~/.config/opencode/plugins/superpowers.js
rm -rf ~/.config/opencode/skills/superpowers
rm -rf ~/.config/opencode/superpowers
```

If you manually added `skills.paths` for superpowers, remove that entry too.

## Usage

### Finding Skills

Ask OpenCode to list the skills it can currently see. The plugin also injects `using-superpowers` at session start, so the core bootstrap instructions are already present.

Examples:

```text
List the available skills you can see.
Use the skill tool to load the brainstorming skill.
```

### Personal Skills

Create personal skills in `~/.config/opencode/skills/`.

```bash
mkdir -p ~/.config/opencode/skills/my-skill
```

Then add `~/.config/opencode/skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
description: Use when [condition] and [what it does]
---

# My Skill

[Your skill content here]
```

### Project Skills

Create project-specific skills in `.opencode/skills/` within the repo.

Skill priority is: project skills > personal skills > bundled superpowers skills.

## How It Works

The plugin does three main things:

1. Injects bootstrap context through `experimental.chat.messages.transform` so every session starts with superpowers awareness.
2. Registers the bundled `skills/` directory through the `config` hook.
3. Adds OpenCode-compatible `TaskCreate`, `TaskList`, `TaskGet`, and `TaskUpdate` tools plus fork-specific subagents for review, adversarial review, and task execution workflows.

### Tool Mapping

Skills written for Claude Code are adapted for OpenCode like this:

- `Skill` -> OpenCode's native `skill` tool
- `TodoWrite` -> `todowrite`
- `TaskCreate`, `TaskList`, `TaskGet`, `TaskUpdate` -> plugin-provided tools
- Generic task-subagent dispatch -> OpenCode subagents such as `@general`, `@explore`, `@code-reviewer`, `@plan-reviewer`, `@plan-advocate`, `@plan-challenger`, `@implementer`, `@spec-reviewer`, `@spec-advocate`, and `@spec-challenger`
- File operations -> native OpenCode tools

Task state is stored in `.superpowers-opencode-tasks.json` at the worktree root. When `.claude-workflow-state.json` contains `artifacts.planPath`, the plugin also syncs `<plan>.tasks.json` next to the plan so resume flows keep working.

Reviewer-style agents choose from the configured OpenCode model inventory. When a comparable Claude Opus 4.6 or Claude Sonnet 4.6 model exists on a different provider than your default model, the plugin prefers that alternate provider for reviewer and adversarial-review agents.

## Updating

The plugin is refreshed from the configured git source when OpenCode refreshes plugins on startup.

To pin a branch or tag:

```json
{
  "plugin": ["superpowers@git+https://github.com/chrisbobrowitz/superpowers.git#main"]
}
```

## Troubleshooting

### Plugin not loading

1. Check logs: `opencode run --print-logs "hello" 2>&1 | grep -i superpowers`
2. Verify the plugin entry in `opencode.json`
3. Restart OpenCode so it can refresh the plugin install

### Skills not found

1. Ask OpenCode to list the skills it can see
2. Check that the plugin loaded successfully
3. Confirm each skill lives at `skills/<name>/SKILL.md` with valid frontmatter

### Task tools not available

1. Confirm the plugin loaded without install errors
2. Clear the OpenCode cache if plugin install failed: `rm -rf ~/.cache/opencode`
3. Restart OpenCode after clearing the cache

## Getting Help

- Fork repository: https://github.com/chrisbobrowitz/superpowers
- OpenCode docs: https://opencode.ai/docs/
