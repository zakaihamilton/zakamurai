import { describe, expect, it } from 'vitest';
import {
  normalizePendingDiffs,
  normalizePromptHistory,
  parseStoredJson,
  serializeOpenTabs,
} from './SettingsSerialization';

describe('settings serialization', () => {
  it('uses fallbacks for malformed persisted JSON', () => {
    expect(parseStoredJson('{bad', [])).toEqual([]);
    expect(parseStoredJson('{"ok":true}', null)).toEqual({ ok: true });
  });

  it('serializes only durable tab fields and normalizes prompt history', () => {
    expect(
      serializeOpenTabs([
        { id: 'a', type: 'file', label: 'App', transient: true },
        { id: 'ai-section:reasoning', type: 'ai-section', label: 'Progress', viewType: 'text' },
      ]),
    ).toEqual([
      { id: 'a', type: 'file', label: 'App' },
      { id: 'ai-section:reasoning', type: 'ai-section', label: 'Progress', viewType: 'text' },
    ]);
    expect(normalizePromptHistory([' first ', 'first', '', 1, 'second'])).toEqual([
      'first',
      'second',
    ]);
  });

  it('rejects malformed persisted diff ranges', () => {
    expect(normalizePendingDiffs({ bad: { originalContent: 'a', diffs: [] } })).toEqual({});
    expect(
      normalizePendingDiffs({
        good: {
          originalContent: 'a',
          modifiedContent: 'b',
          diffs: [{ start: 0, end: 1, origStart: 0, origEnd: 1 }],
        },
      }),
    ).toHaveProperty('good');
  });
});
