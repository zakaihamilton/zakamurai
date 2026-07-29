#!/bin/bash

# Zero-Drift AI Regression Guard - Validation Script

echo "--- Starting AI Architectural Drift Scan ---"
if command -v lucidshark &> /dev/null; then
    lucidshark scan --mode selective
elif command -v lucid &> /dev/null; then
    lucid scan --mode selective
else
    echo "Warning: lucidshark (or lucid) not found on PATH. Skipping architectural scan."
    echo "  Install lucidshark and add it to PATH to enable this check."
    echo "  See project docs or releases for download instructions."
fi

echo "--- Starting Static AI Compliance Checks ---"
npx tsx scripts/run-promptfoo-checks.ts

echo "--- Starting promptfoo eval (optional report) ---"
npx promptfoo eval || echo "Warning: promptfoo eval reported failures; static checks above are authoritative."

echo "--- Starting Performance Budget Check ---"
npx tsx scripts/check-performance-budget.ts

echo "--- Starting Visual Regression Tests ---"
npm run test:visual

echo "--- AI Regression Guard Complete ---"
