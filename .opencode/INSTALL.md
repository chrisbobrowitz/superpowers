# Installing Superpowers for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed

## Installation

Add this fork to the `plugin` array in your `opencode.json`:

```json
{
  "plugin": ["superpowers@git+https://github.com/chrisbobrowitz/superpowers.git"]
}
```

Restart OpenCode. OpenCode installs the plugin package with Bun, loads `.opencode/plugins/superpowers.js`, and registers the bundled skills automatically.

Verify by asking OpenCode to list the skills it can see, or by asking: `Tell me about your superpowers`.

## Migrating from the old symlink-based install

If you previously installed superpowers with `git clone` and symlinks, remove the old setup:

```bash
rm -f ~/.config/opencode/plugins/superpowers.js
rm -rf ~/.config/opencode/skills/superpowers
rm -rf ~/.config/opencode/superpowers
```

If you added a manual `skills.paths` entry for superpowers, remove that too. Then follow the plugin installation above.

## Usage

Use OpenCode's native `skill` tool. The plugin also injects bootstrap context so `using-superpowers` is already loaded at session start.

Examples:

```text
List the available skills you can see.
Use the skill tool to load the brainstorming skill.
```

## Tool Mapping

When the skills reference Claude Code tools:

- `Skill` maps to OpenCode's native `skill` tool
- `TodoWrite` maps to `todowrite`
- `TaskCreate`, `TaskList`, `TaskGet`, and `TaskUpdate` are provided by the plugin
- Generic task-subagent dispatch maps to OpenCode subagents such as `@general`, `@explore`, `@code-reviewer`, `@plan-reviewer`, `@plan-advocate`, `@plan-challenger`, `@implementer`, `@spec-reviewer`, `@spec-advocate`, and `@spec-challenger`

Task state is stored in `.superpowers-opencode-tasks.json` at the worktree root. When `.claude-workflow-state.json` has `artifacts.planPath`, the plugin also syncs `<plan>.tasks.json` beside the plan for resume flows.

Reviewer-style agents choose from the configured OpenCode model inventory. When a comparable Claude Opus 4.6 or Claude Sonnet 4.6 model exists on a different provider than your default model, the plugin prefers that alternate provider for reviewer and adversarial-review agents.

## Updating

The plugin updates when OpenCode refreshes its plugin cache on startup.

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
2. Check that the plugin is loading
3. Confirm the bundled skills live under `skills/<name>/SKILL.md`

### Task tools not available

1. Confirm the plugin loaded without install errors
2. Clear the OpenCode plugin cache if startup install failed: `rm -rf ~/.cache/opencode`
3. Restart OpenCode after clearing the cache

## Getting Help

- Fork documentation: https://github.com/chrisbobrowitz/superpowers/blob/main/docs/README.opencode.md
- Upstream OpenCode docs: https://opencode.ai/docs/plugins/
