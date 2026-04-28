#!/usr/bin/env bash
# Test: Plugin Loading
# Verifies that the superpowers plugin loads correctly in OpenCode
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Test: Plugin Loading ==="

# Source setup to create isolated environment
source "$SCRIPT_DIR/setup.sh"

# Trap to cleanup on exit
trap cleanup_test_env EXIT

plugin_link="$OPENCODE_CONFIG_DIR/plugins/superpowers.js"

# Test 1: Verify plugin file exists and is registered
echo "Test 1: Checking plugin registration..."
if [ -L "$plugin_link" ]; then
    echo "  [PASS] Plugin symlink exists"
else
    echo "  [FAIL] Plugin symlink not found at $plugin_link"
    exit 1
fi

# Verify symlink target exists
if [ -f "$(readlink -f "$plugin_link")" ]; then
    echo "  [PASS] Plugin symlink target exists"
else
    echo "  [FAIL] Plugin symlink target does not exist"
    exit 1
fi

# Test 2: Verify skills directory is populated
echo "Test 2: Checking skills directory..."
skill_count=$(find "$SUPERPOWERS_SKILLS_DIR" -name "SKILL.md" | wc -l)
if [ "$skill_count" -gt 0 ]; then
    echo "  [PASS] Found $skill_count skills"
else
    echo "  [FAIL] No skills found in $SUPERPOWERS_SKILLS_DIR"
    exit 1
fi

# Test 3: Check using-superpowers skill exists (critical for bootstrap)
echo "Test 3: Checking using-superpowers skill (required for bootstrap)..."
if [ -f "$SUPERPOWERS_SKILLS_DIR/using-superpowers/SKILL.md" ]; then
    echo "  [PASS] using-superpowers skill exists"
else
    echo "  [FAIL] using-superpowers skill not found (required for bootstrap)"
    exit 1
fi

# Test 4: Verify plugin JavaScript syntax (basic check)
echo "Test 4: Checking plugin JavaScript syntax..."
if node --check "$SUPERPOWERS_PLUGIN_FILE" 2>/dev/null; then
    echo "  [PASS] Plugin JavaScript syntax is valid"
else
    echo "  [FAIL] Plugin has JavaScript syntax errors"
    exit 1
fi

# Test 5: Verify reviewer model selection honors config inventory
echo "Test 5: Checking reviewer model selection..."
node --input-type=module <<'EOF'
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const pluginPath = pathToFileURL(process.env.SUPERPOWERS_PLUGIN_FILE).href;
const { SuperpowersPlugin } = await import(pluginPath);

const worktree = path.join(process.env.TEST_HOME, 'test-project');
const plugin = await SuperpowersPlugin({ worktree, directory: worktree });

const applyConfig = async (config) => {
  await plugin.config(config);
  return config;
};

const multiProviderConfig = await applyConfig({
  model: 'openai/gpt-5',
  provider: {
    openai: {
      models: {
        'gpt-5': {
          name: 'GPT-5',
        },
      },
    },
    openrouter: {
      models: {
        'review-primary': {
          id: 'claude-opus-4-6',
          name: 'Claude Opus 4.6',
        },
      },
    },
    'google-vertex-anthropic': {
      models: {
        'review-secondary': {
          id: 'claude-sonnet-4-6@default',
          name: 'Claude Sonnet 4.6 (1M)',
        },
      },
    },
  },
  skills: { paths: [] },
  agent: {},
});

assert.equal(multiProviderConfig.agent['code-reviewer'].model, 'openrouter/review-primary');
assert.equal(multiProviderConfig.agent['plan-reviewer'].model, 'openrouter/review-primary');
assert.equal(multiProviderConfig.agent['plan-advocate'].model, 'openrouter/review-primary');
assert.equal(multiProviderConfig.agent['spec-reviewer'].model, 'openrouter/review-primary');
assert.equal(multiProviderConfig.agent['spec-advocate'].model, 'openrouter/review-primary');
assert.equal(multiProviderConfig.agent['plan-challenger'].model, 'google-vertex-anthropic/review-secondary');
assert.equal(multiProviderConfig.agent['spec-challenger'].model, 'google-vertex-anthropic/review-secondary');
assert.equal(multiProviderConfig.agent.implementer.model, 'openai/gpt-5');

const singleProviderConfig = await applyConfig({
  model: 'anthropic/default-reviewer',
  provider: {
    anthropic: {
      models: {
        'default-reviewer': {
          name: 'Claude Sonnet 4.6',
        },
      },
    },
  },
  skills: { paths: [] },
  agent: {},
});

assert.equal(singleProviderConfig.agent['code-reviewer'].model, 'anthropic/default-reviewer');
assert.equal(singleProviderConfig.agent['plan-challenger'].model, 'anthropic/default-reviewer');
assert.equal(singleProviderConfig.agent['spec-challenger'].model, 'anthropic/default-reviewer');
assert.equal(singleProviderConfig.agent.implementer.model, 'anthropic/default-reviewer');

console.log('  [PASS] Review agents prefer configured alternate providers when available');
console.log('  [PASS] Review agent matching uses provider model metadata');
console.log('  [PASS] Implementer stays on the configured default model');

const explicitOverrideConfig = await applyConfig({
  model: 'openai/gpt-5',
  provider: {
    openai: {
      models: {
        'gpt-5': {
          name: 'GPT-5',
        },
      },
    },
    openrouter: {
      models: {
        'review-primary': {
          id: 'claude-opus-4-6',
          name: 'Claude Opus 4.6',
        },
      },
    },
  },
  skills: { paths: [] },
  agent: {
    'code-reviewer': {
      model: 'openai/gpt-5',
    },
    implementer: {
      model: 'openrouter/review-primary',
    },
  },
});

assert.equal(explicitOverrideConfig.agent['code-reviewer'].model, 'openai/gpt-5');
assert.equal(explicitOverrideConfig.agent['code-reviewer'].description, 'Reviews code changes for production readiness using the Superpowers review rubric');
assert.equal(explicitOverrideConfig.agent.implementer.model, 'openrouter/review-primary');
assert.equal(explicitOverrideConfig.agent.implementer.description, 'Implements one planned Superpowers task and reports structured completion status');

console.log('  [PASS] Per-subagent config overrides preserve plugin prompts and permissions');
EOF

# Test 6: Verify bootstrap text does not reference a hardcoded skills path
echo "Test 6: Checking bootstrap does not advertise a wrong skills path..."
if grep -q 'configDir}/skills/superpowers/' "$SUPERPOWERS_PLUGIN_FILE"; then
    echo "  [FAIL] Plugin still references old configDir skills path"
    exit 1
else
    echo "  [PASS] Plugin does not advertise a misleading skills path"
fi

# Test 7: Verify personal test skill was created
echo "Test 7: Checking test fixtures..."
if [ -f "$OPENCODE_CONFIG_DIR/skills/personal-test/SKILL.md" ]; then
    echo "  [PASS] Personal test skill fixture created"
else
    echo "  [FAIL] Personal test skill fixture not found"
    exit 1
fi

echo ""
echo "=== All plugin loading tests passed ==="
