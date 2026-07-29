import { describe, expect, it } from 'vitest';
import { groupReasoningEntries } from './AISection';

describe('groupReasoningEntries', () => {
  it('groups consecutive step events beneath one step header and removes their repeated prefix', () => {
    expect(
      groupReasoningEntries([
        { timestamp: '20:39:24', text: '**Preparing workspace:** collecting project files…' },
        { timestamp: '20:39:24', text: '**Step 1:** Reviewing the request…' },
        { timestamp: '20:39:24', text: '**Step 1:** Requesting the next action…' },
        { timestamp: '20:39:32', text: '**Step 1 result:** `list_files` completed…' },
        { timestamp: '20:39:32', text: '**Step 2:** Reviewing the latest tool result…' },
      ]),
    ).toEqual([
      {
        step: null,
        entries: [
          { timestamp: '20:39:24', text: '**Preparing workspace:** collecting project files…' },
        ],
      },
      {
        step: 1,
        entries: [
          { timestamp: '20:39:24', text: 'Reviewing the request…' },
          { timestamp: '20:39:24', text: 'Requesting the next action…' },
          { timestamp: '20:39:32', text: '`list_files` completed…' },
        ],
      },
      {
        step: 2,
        entries: [{ timestamp: '20:39:32', text: 'Reviewing the latest tool result…' }],
      },
    ]);
  });
});
