import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertCssModules,
  assertDomainUseStateViolation,
  assertInlineStyleViolation,
  assertMalformedGoldenDiff,
  assertSearchReplace,
  assertStateProxy,
  assertTailwindViolation,
  assertUnsafePaths,
  assertValidGoldenDiff,
} from './promptfoo-assertions.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

const CASES = [
  {
    name: 'CSS Modules and Styling Compliance',
    varsFile: 'tests/ai-golden/vars-good-css-module.json',
    assert: assertCssModules,
  },
  {
    name: 'State Proxy Architecture Compliance',
    varsFile: 'tests/ai-golden/vars-good-state-proxy.json',
    assert: assertStateProxy,
  },
  {
    name: 'SEARCH/REPLACE Block Format Integrity',
    varsFile: 'tests/ai-golden/vars-valid-diff.json',
    assert: assertSearchReplace,
  },
  {
    name: 'Golden — valid SEARCH/REPLACE fixture',
    varsFile: 'tests/ai-golden/vars-valid-diff.json',
    assert: assertValidGoldenDiff,
  },
  {
    name: 'Golden — malformed diff fixture fails markers check',
    varsFile: 'tests/ai-golden/vars-malformed-diff.json',
    assert: assertMalformedGoldenDiff,
  },
  {
    name: 'Golden — unsafe path fixture',
    varsFile: 'tests/ai-golden/vars-unsafe-paths.json',
    assert: assertUnsafePaths,
  },
  {
    name: 'Golden — Tailwind violation fixture',
    varsFile: 'tests/ai-golden/vars-tailwind-violation.json',
    assert: assertTailwindViolation,
  },
  {
    name: 'Golden — inline style violation fixture',
    varsFile: 'tests/ai-golden/vars-inline-style-violation.json',
    assert: assertInlineStyleViolation,
  },
  {
    name: 'Golden — domain useState violation fixture',
    varsFile: 'tests/ai-golden/vars-domain-usestate-violation.json',
    assert: assertDomainUseStateViolation,
  },
];

function isPass(result) {
  if (result === true) return true;
  if (result && typeof result === 'object' && result.pass === true) return true;
  return false;
}

function failureReason(result) {
  if (result && typeof result === 'object' && result.reason) return result.reason;
  return 'Assertion returned false';
}

const failures = [];

for (const testCase of CASES) {
  const vars = JSON.parse(await readFile(path.join(ROOT, testCase.varsFile), 'utf8'));
  const result = testCase.assert('static', { vars });
  if (!isPass(result)) {
    failures.push(`${testCase.name}: ${failureReason(result)}`);
  }
}

if (failures.length > 0) {
  console.error(`AI compliance checks failed:\n${failures.map((f) => `- ${f}`).join('\n')}`);
  process.exit(1);
}

console.log(`AI compliance checks passed (${CASES.length} cases).`);
