#!/usr/bin/env bash
# Test: Skill Tool Functionality
# Verifies that OpenCode can discover and load skills with the current API
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Test: Skill Tool Functionality ==="

source "$SCRIPT_DIR/setup.sh"
trap cleanup_test_env EXIT

if ! command -v opencode >/dev/null 2>&1; then
    echo "  [SKIP] OpenCode not installed - skipping integration tests"
    echo "  To run these tests, install OpenCode: https://opencode.ai"
    exit 0
fi

if ! opencode_smoke_check "$TEST_NEUTRAL_DIR"; then
    status=$?
    if [ "$status" -eq 2 ]; then
        exit 0
    fi
    exit 1
fi

run_opencode() {
    local prompt="$1"
    (cd "$TEST_NEUTRAL_DIR" && opencode run --print-logs "$prompt" 2>&1)
}

mkdir -p "$SUPERPOWERS_SKILLS_DIR/bundled-test"
cat > "$SUPERPOWERS_SKILLS_DIR/bundled-test/SKILL.md" <<'EOF'
---
name: bundled-test
description: Bundled superpowers skill for integration verification
---
# Bundled Test Skill

BUNDLED_SKILL_MARKER_24680
EOF

echo "Test 1: Loading the personal test skill..."
output=$(run_opencode "Use the skill tool to load the personal-test skill, then quote the marker string you received.") || {
    exit_code=$?
    echo "  [WARN] OpenCode returned non-zero exit code: $exit_code"
}

if echo "$output" | grep -qi "PERSONAL_SKILL_MARKER_12345\|Personal Test Skill"; then
    echo "  [PASS] Personal skill loaded successfully"
else
    echo "  [FAIL] Personal skill did not load as expected"
    printf '%s\n' "$output" | sed -n '1,80p'
    exit 1
fi

echo ""
echo "Test 2: Loading a bundled superpowers skill..."
output=$(run_opencode "Use the skill tool to load the bundled-test skill and quote the marker string you received.") || {
    exit_code=$?
    echo "  [WARN] OpenCode returned non-zero exit code: $exit_code"
}

if echo "$output" | grep -qi "BUNDLED_SKILL_MARKER_24680\|Bundled Test Skill"; then
    echo "  [PASS] Bundled superpowers skill loaded"
else
    echo "  [FAIL] Bundled superpowers skill did not load as expected"
    printf '%s\n' "$output" | sed -n '1,80p'
    exit 1
fi

echo ""
echo "=== All skill tool tests passed ==="
