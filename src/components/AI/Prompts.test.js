import { describe, expect, it } from 'vitest';
import {
  COMPLETION_SYSTEM_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  SEARCH_REPLACE_INSTRUCTION,
} from './Prompts';

describe('AI Prompts', () => {
  it('has DEFAULT_SYSTEM_PROMPT', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toBeDefined();
    expect(DEFAULT_SYSTEM_PROMPT).toContain('React and JavaScript');
  });

  it('has SEARCH_REPLACE_INSTRUCTION', () => {
    expect(SEARCH_REPLACE_INSTRUCTION).toBeDefined();
    expect(SEARCH_REPLACE_INSTRUCTION).toContain('SEARCH/REPLACE');
  });

  it('has COMPLETION_SYSTEM_PROMPT', () => {
    expect(COMPLETION_SYSTEM_PROMPT).toBeDefined();
    expect(COMPLETION_SYSTEM_PROMPT).toContain('<completion>');
  });
});
