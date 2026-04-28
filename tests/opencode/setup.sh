#!/usr/bin/env bash
# Setup script for OpenCode plugin tests
# Creates an isolated test environment with proper plugin installation
set -euo pipefail

# Get the repository root (two levels up from tests/opencode/)
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Create a temp config/workspace root for isolation.
# Keep the caller's real HOME so OpenCode can use whatever auth/model setup
# already exists on this machine.
export TEST_HOME
TEST_HOME=$(mktemp -d)
export OPENCODE_CONFIG_DIR="$TEST_HOME/.config/opencode"
export TEST_NEUTRAL_DIR="$TEST_HOME/non-project"

# Standard install layout:
#   $OPENCODE_CONFIG_DIR/superpowers/             ← package root
#   $OPENCODE_CONFIG_DIR/superpowers/skills/      ← skills dir (../../skills from plugin)
#   $OPENCODE_CONFIG_DIR/superpowers/.opencode/plugins/superpowers.js ← plugin file
#   $OPENCODE_CONFIG_DIR/plugins/superpowers.js   ← symlink OpenCode reads

SUPERPOWERS_DIR="$OPENCODE_CONFIG_DIR/superpowers"
SUPERPOWERS_SKILLS_DIR="$SUPERPOWERS_DIR/skills"
SUPERPOWERS_PLUGIN_FILE="$SUPERPOWERS_DIR/.opencode/plugins/superpowers.js"

mkdir -p "$OPENCODE_CONFIG_DIR"
mkdir -p "$TEST_NEUTRAL_DIR"

# Minimal portable config for the isolated test harness.
cat > "$OPENCODE_CONFIG_DIR/opencode.json" <<'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "*": "allow"
  }
}
EOF

# Install plugin dependency support in the isolated config dir.
cp "$REPO_ROOT/package.json" "$OPENCODE_CONFIG_DIR/package.json"

if command -v bun >/dev/null 2>&1; then
    (cd "$OPENCODE_CONFIG_DIR" && bun install --silent >/dev/null)
elif command -v npm >/dev/null 2>&1; then
    (cd "$OPENCODE_CONFIG_DIR" && npm install --silent >/dev/null)
else
    echo "Warning: neither bun nor npm was found; plugin dependency install was skipped" >&2
fi

# Install skills and plugin package contents.
mkdir -p "$SUPERPOWERS_DIR"
cp -r "$REPO_ROOT/skills" "$SUPERPOWERS_DIR/"
mkdir -p "$SUPERPOWERS_DIR/.opencode"
cp -r "$REPO_ROOT/.opencode/plugins" "$SUPERPOWERS_DIR/.opencode/"
cp "$REPO_ROOT/package.json" "$SUPERPOWERS_DIR/package.json"

# Register plugin via symlink (what OpenCode actually reads)
mkdir -p "$OPENCODE_CONFIG_DIR/plugins"
ln -sf "$SUPERPOWERS_PLUGIN_FILE" "$OPENCODE_CONFIG_DIR/plugins/superpowers.js"

# Create test skills in different locations for testing

# Personal test skill
mkdir -p "$OPENCODE_CONFIG_DIR/skills/personal-test"
cat > "$OPENCODE_CONFIG_DIR/skills/personal-test/SKILL.md" <<'EOF'
---
name: personal-test
description: Test personal skill for verification
---
# Personal Test Skill

This is a personal skill used for testing.

PERSONAL_SKILL_MARKER_12345
EOF

# Create a project directory for project-level skill tests
mkdir -p "$TEST_HOME/test-project/.opencode/skills/project-test"
cat > "$TEST_HOME/test-project/.opencode/skills/project-test/SKILL.md" <<'EOF'
---
name: project-test
description: Test project skill for verification
---
# Project Test Skill

This is a project skill used for testing.

PROJECT_SKILL_MARKER_67890
EOF

# Make the project fixture an actual git repo so project-local skill discovery
# matches normal checked-out usage.
(cd "$TEST_HOME/test-project" && git init -q)

echo "Setup complete: $TEST_HOME"
echo "OPENCODE_CONFIG_DIR:  $OPENCODE_CONFIG_DIR"
echo "Superpowers dir:      $SUPERPOWERS_DIR"
echo "Skills dir:           $SUPERPOWERS_SKILLS_DIR"
echo "Plugin file:          $SUPERPOWERS_PLUGIN_FILE"
echo "Plugin registered at: $OPENCODE_CONFIG_DIR/plugins/superpowers.js"
echo "Test project at:      $TEST_HOME/test-project"

# Helper function for cleanup (call from tests or trap)
cleanup_test_env() {
    if [ -n "${TEST_HOME:-}" ] && [ -d "$TEST_HOME" ]; then
        rm -rf "$TEST_HOME"
    fi
}

opencode_smoke_check() {
    local smoke_dir="${1:-$TEST_NEUTRAL_DIR}"
    local output

    set +e
    output=$(cd "$smoke_dir" && opencode run --print-logs "Reply with OK and nothing else." 2>&1)
    local exit_code=$?
    set -e

    if [ "$exit_code" -eq 0 ]; then
        return 0
    fi

    if printf '%s\n' "$output" | grep -Eqi 'Authentication issues|/connect|ProviderInitError|ProviderModelNotFoundError|Model not available|Bad credentials|API key|AI_APICallError|not found or your project does not have access|Please ensure you are using a valid model version'; then
        echo "  [SKIP] OpenCode is installed but this environment is not configured for provider-backed integration tests"
        echo "  Configure a working model/provider, then rerun the integration suite"
        return 2
    fi

    echo "  [FAIL] OpenCode smoke check failed unexpectedly"
    printf '%s\n' "$output" | sed -n '1,80p'
    return 1
}

# Export for use in tests
export REPO_ROOT
export SUPERPOWERS_DIR
export SUPERPOWERS_SKILLS_DIR
export SUPERPOWERS_PLUGIN_FILE
export TEST_NEUTRAL_DIR
