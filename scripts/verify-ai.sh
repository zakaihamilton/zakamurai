#!/bin/bash

# Zero-Drift AI Regression Guard - Validation Script

echo "--- Starting AI Architectural Drift Scan ---"
if command -v lucid &> /dev/null; then
    lucid scan --mode selective
elif command -v lucidshark &> /dev/null; then
    lucidshark scan --mode selective
else
    echo "Warning: lucid/lucidshark command not found. Skipping architectural scan."
fi

echo "--- Starting Semantic Correctness Evaluation ---"
npx promptfoo eval

echo "--- Starting Performance Budget Check ---"
node scripts/check-performance.js

echo "--- AI Regression Guard Complete ---"
