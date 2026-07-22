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

echo "--- Starting Semantic Correctness Evaluation ---"
npx promptfoo eval

echo "--- Starting Performance Budget Check ---"
node scripts/check-performance-budget.mjs

echo "--- Starting Visual Regression Tests ---"
npm run test:visual

echo "--- AI Regression Guard Complete ---"
