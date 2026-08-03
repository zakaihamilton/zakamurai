import { describe, expect, it } from 'vitest';
import { parseFileCommand } from './filePrompt';

describe('parseFileCommand', () => {
  it('recognizes /file at the beginning of a prompt', () => {
    expect(parseFileCommand('/file Fix the button')).toEqual({ prompt: 'Fix the button' });
    expect(parseFileCommand('/FILE\nFix the button')).toEqual({ prompt: 'Fix the button' });
  });

  it('does not treat an embedded command as a file selector', () => {
    expect(parseFileCommand('please use /file App.tsx')).toBeNull();
    expect(parseFileCommand('/files App.tsx')).toBeNull();
  });
});
