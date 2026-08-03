import { describe, expect, it } from 'vitest';
import {
  formatRunUsageSummary,
  getCompletedRunUsageSummary,
  groupReasoningEntries,
  keyReasoningEntries,
} from './AISection';

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

describe('keyReasoningEntries', () => {
  it('disambiguates repeated same-second entries with identical text', () => {
    const keyed = keyReasoningEntries([
      { timestamp: '07:36:34', text: '`write_file`' },
      { timestamp: '07:36:34', text: '`write_file`' },
    ]);

    expect(keyed.map((entry) => entry.renderKey)).toEqual([
      '07:36:34-`write_file`-0',
      '07:36:34-`write_file`-1',
    ]);
  });
});

describe('formatRunUsageSummary', () => {
  it('includes token coverage, tools, and reported performance metrics', () => {
    expect(
      formatRunUsageSummary({
        modelIds: ['model-a'],
        modelCalls: 2,
        outcomes: { success: 1, error: 1, aborted: 0 },
        promptTokens: 12,
        promptTokenCalls: 1,
        completionTokens: 4,
        completionTokenCalls: 1,
        totalMs: 250,
        timeToFirstTokenMs: 40,
        timeToFirstTokenCalls: 1,
        decodeTokensPerSecond: 20,
        decodeTokensPerSecondCalls: 1,
        toolCalls: { write_file: 1, read_file: 2 },
      }),
    ).toContain(
      '**Input tokens:** 12\n\n**Output tokens:** 4\n\n**Total tokens:** 16\n\n**Token reporting:** Input 1/2 calls reported · Output 1/2 calls reported',
    );
    expect(
      formatRunUsageSummary({
        modelIds: ['model-a'],
        modelCalls: 1,
        outcomes: { success: 1, error: 0, aborted: 0 },
        promptTokens: 1,
        promptTokenCalls: 1,
        completionTokens: 1,
        completionTokenCalls: 1,
        totalMs: 100,
        timeToFirstTokenMs: 20,
        timeToFirstTokenCalls: 1,
        decodeTokensPerSecond: 20,
        decodeTokensPerSecondCalls: 1,
        toolCalls: {},
      }),
    ).toContain('**Avg. first token:** 20 ms\n\n**Avg. generation speed:** 20 tokens/s');
    expect(
      formatRunUsageSummary({
        modelIds: [],
        modelCalls: 1,
        outcomes: { success: 1, error: 0, aborted: 0 },
        promptTokens: 0,
        promptTokenCalls: 0,
        completionTokens: 0,
        completionTokenCalls: 0,
        totalMs: 1,
        timeToFirstTokenMs: 0,
        timeToFirstTokenCalls: 0,
        decodeTokensPerSecond: 0,
        decodeTokensPerSecondCalls: 0,
        toolCalls: {},
      }),
    ).toContain('**Token reporting:** Input unavailable · Output unavailable');
  });

  it('hides the summary until the agent run is no longer running', () => {
    const usage = {
      modelIds: ['model-a'],
      modelCalls: 1,
      outcomes: { success: 1, error: 0, aborted: 0 },
      promptTokens: 12,
      promptTokenCalls: 1,
      completionTokens: 4,
      completionTokenCalls: 1,
      totalMs: 100,
      timeToFirstTokenMs: 20,
      timeToFirstTokenCalls: 1,
      decodeTokensPerSecond: 20,
      decodeTokensPerSecondCalls: 1,
      toolCalls: {},
    };
    expect(getCompletedRunUsageSummary('running', usage)).toBe('');
    expect(getCompletedRunUsageSummary('idle', usage)).toContain('Run summary');
  });
});
