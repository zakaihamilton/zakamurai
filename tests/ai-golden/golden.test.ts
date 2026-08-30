import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateAIChanges, validateProjectPath } from '@/components/AI/ChangeValidator';
import { applySearchReplace } from '@/components/AI/Processor/utils/SearchReplaceParser';
import { describe, expect, it } from 'vitest';

const goldenDir = path.resolve(import.meta.dirname);

async function readGolden(name: string) {
  return readFile(path.join(goldenDir, name), 'utf8');
}

describe('AI golden fixtures', () => {
  it('accepts valid SEARCH/REPLACE blocks from golden fixture', async () => {
    const blocks = await readGolden('valid-search-replace.txt');
    const original = 'const x = 1;';
    const result = applySearchReplace(original, blocks);
    expect(result.content).toBe('const x = 2;');
  });

  it('rejects malformed SEARCH/REPLACE golden fixture', async () => {
    const blocks = await readGolden('malformed-diff.txt');
    expect(blocks.includes('>>>>>>> REPLACE')).toBe(false);
  });

  it('rejects unsafe paths from golden fixture list', async () => {
    const raw = await readGolden('unsafe-paths.json');
    const { unsafePaths, safePaths } = JSON.parse(raw);
    for (const pathValue of unsafePaths) {
      expect(validateProjectPath(pathValue)).toBeTruthy();
    }
    for (const pathValue of safePaths) {
      expect(validateProjectPath(pathValue)).toBeNull();
    }
  });

  it('rejects duplicate targets in a multi-change golden payload', () => {
    const result = validateAIChanges([
      { path: 'src/a.js', after: 'one' },
      { path: 'src/a.js', after: 'two' },
    ]);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });

  it('accepts Unicode relative paths and rejects ambiguous path separators', async () => {
    const raw = await readGolden('edge-case-paths.json');
    const { unsafePaths, safePaths } = JSON.parse(raw);
    for (const pathValue of unsafePaths) {
      expect(validateProjectPath(pathValue)).toBeTruthy();
    }
    for (const pathValue of safePaths) {
      expect(validateProjectPath(pathValue)).toBeNull();
    }
  });

  it('rejects prompt-injection payloads that try to write outside the project', async () => {
    const raw = await readGolden('prompt-injection.json');
    const fixture = JSON.parse(raw) as {
      proposedChanges: Array<{ path: string; after: string }>;
    };
    const result = validateAIChanges(fixture.proposedChanges);
    expect(result.rejected.length).toBeGreaterThanOrEqual(3);
    expect(result.accepted.map((change) => change.path)).toEqual(['src/App.jsx']);
  });
});
