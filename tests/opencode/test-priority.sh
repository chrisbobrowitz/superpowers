#!/usr/bin/env bash
# Test: Skill Priority Resolution
# Verifies that skills are resolved with correct priority: project > personal > superpowers
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Test: Skill Priority Resolution ==="

source "$SCRIPT_DIR/setup.sh"
trap cleanup_test_env EXIT

echo "Setting up priority test fixtures..."

mkdir -p "$SUPERPOWERS_SKILLS_DIR/priority-test"
cat > "$SUPERPOWERS_SKILLS_DIR/priority-test/SKILL.md" <<'EOF'
---
name: priority-test
description: Superpowers version of priority test skill
---
# Priority Test Skill (Superpowers Version)

PRIORITY_MARKER_SUPERPOWERS_VERSION
EOF

mkdir -p "$OPENCODE_CONFIG_DIR/skills/priority-test"
cat > "$OPENCODE_CONFIG_DIR/skills/priority-test/SKILL.md" <<'EOF'
---
name: priority-test
description: Personal version of priority test skill
---
# Priority Test Skill (Personal Version)

PRIORITY_MARKER_PERSONAL_VERSION
EOF

mkdir -p "$TEST_HOME/test-project/.opencode/skills/priority-test"
cat > "$TEST_HOME/test-project/.opencode/skills/priority-test/SKILL.md" <<'EOF'
---
name: priority-test
description: Project version of priority test skill
---
# Priority Test Skill (Project Version)

PRIORITY_MARKER_PROJECT_VERSION
EOF

echo "  Created priority-test skill in all three locations"

echo ""
echo "Test 1: Verifying test fixtures..."

for fixture in \
    "$SUPERPOWERS_SKILLS_DIR/priority-test/SKILL.md" \
    "$OPENCODE_CONFIG_DIR/skills/priority-test/SKILL.md" \
    "$TEST_HOME/test-project/.opencode/skills/priority-test/SKILL.md"
do
    if [ -f "$fixture" ]; then
        echo "  [PASS] $(basename "$(dirname "$fixture")") fixture exists"
    else
        echo "  [FAIL] Missing fixture: $fixture"
        exit 1
    fi
done

if ! command -v opencode >/dev/null 2>&1; then
    echo ""
    echo "  [SKIP] OpenCode not installed - skipping integration tests"
    echo "  To run these tests, install OpenCode: https://opencode.ai"
    echo ""
    echo "=== Priority fixture tests passed (integration tests skipped) ==="
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
    (cd "$PWD" && opencode run --print-logs "$prompt" 2>&1)
}

echo ""
echo "Test 2: Personal skill overrides bundled superpowers skill outside project context..."
cd "$TEST_NEUTRAL_DIR"
output=$(run_opencode "Use the skill tool to load the priority-test skill and quote the PRIORITY_MARKER value.") || {
    exit_code=$?
    echo "  [WARN] OpenCode returned non-zero exit code: $exit_code"
}

if echo "$output" | grep -qi "PRIORITY_MARKER_PERSONAL_VERSION"; then
    echo "  [PASS] Personal version won outside project context"
elif echo "$output" | grep -qi "PRIORITY_MARKER_SUPERPOWERS_VERSION"; then
    echo "  [FAIL] Superpowers version won over personal"
    exit 1
else
    echo "  [FAIL] Could not verify which version loaded"
    printf '%s\n' "$output" | sed -n '1,80p'
    exit 1
fi

echo ""
echo "Test 3: Project skill overrides personal and bundled versions inside project context..."
cd "$TEST_HOME/test-project"
output=$(run_opencode "Use the skill tool to load the priority-test skill and quote the PRIORITY_MARKER value.") || {
    exit_code=$?
    echo "  [WARN] OpenCode returned non-zero exit code: $exit_code"
}

if echo "$output" | grep -qi "PRIORITY_MARKER_PROJECT_VERSION"; then
    echo "  [PASS] Project version won inside project context"
elif echo "$output" | grep -qi "PRIORITY_MARKER_PERSONAL_VERSION\|PRIORITY_MARKER_SUPERPOWERS_VERSION"; then
    echo "  [FAIL] Higher-priority project skill did not win"
    exit 1
else
    echo "  [FAIL] Could not verify which version loaded"
    printf '%s\n' "$output" | sed -n '1,80p'
    exit 1
fi

echo ""
echo "=== All priority tests passed ==="
