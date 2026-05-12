import { describe, expect, it } from 'vitest';
import {
  COMPLETION_SYSTEM_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  SEARCH_REPLACE_INSTRUCTION,
  buildEditPrompt,
  formatCompactContext,
} from './Prompts';

describe('AI Prompts', () => {
  it('has DEFAULT_SYSTEM_PROMPT', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toBeDefined();
    expect(DEFAULT_SYSTEM_PROMPT).toContain('SEARCH/REPLACE');
  });

  it('has SEARCH_REPLACE_INSTRUCTION', () => {
    expect(SEARCH_REPLACE_INSTRUCTION).toBeDefined();
    expect(SEARCH_REPLACE_INSTRUCTION).toContain('<<<<<<< SEARCH');
  });

  it('has COMPLETION_SYSTEM_PROMPT', () => {
    expect(COMPLETION_SYSTEM_PROMPT).toBeDefined();
    expect(COMPLETION_SYSTEM_PROMPT).toContain('<completion>');
  });

  it('formats compact context with a small number of files', () => {
    const context = formatCompactContext([
      { filePath: 'a.js', content: 'a', linkedCss: [] },
      { filePath: 'b.js', content: 'b', linkedCss: [] },
      { filePath: 'c.js', content: 'c', linkedCss: [] },
      { filePath: 'd.js', content: 'd', linkedCss: [] },
    ]);

    expect(context).toContain('Related file: a.js');
    expect(context).toContain('Related file: c.js');
    expect(context).not.toContain('Related file: d.js');
  });

  it('builds a consistent edit prompt', () => {
    const prompt = buildEditPrompt({
      userRequest: 'Change the title',
      activeFilePath: 'src/App.js',
      activeFileContent: 'export default function App() {}',
      selectedLines: [3, 4],
      relatedContext: [{ filePath: 'src/styles.css', content: '.title {}', linkedCss: [] }],
    });

    expect(prompt).toContain('Current file: src/App.js');
    expect(prompt).toContain('Related file: src/styles.css');
    expect(prompt).toContain('Selected lines: 3, 4');
    expect(prompt).toContain('User request:\nChange the title');
  });
});
