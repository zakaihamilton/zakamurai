import {
  COMPLETION_SYSTEM_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  PATCH_SYSTEM_PROMPT,
  PLANNING_SYSTEM_PROMPT,
  PromptRegistry,
  REPAIR_SYSTEM_PROMPT,
  SEARCH_REPLACE_INSTRUCTION,
  allocateTokenBudget,
  buildEditPrompt,
  buildPatchPrompt,
  buildPlanningPrompt,
  buildRepairPrompt,
  formatCompactContext,
} from './Prompts';

describe('AI Prompts', () => {
  it('exposes PromptRegistry with v2 versioning', () => {
    expect(PromptRegistry.getPrompt('edit', 'v2')).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(PromptRegistry.getPrompt('planning', 'v2')).toBe(PLANNING_SYSTEM_PROMPT);
    expect(PromptRegistry.getPrompt('patch', 'v2')).toBe(PATCH_SYSTEM_PROMPT);
    expect(PromptRegistry.getPrompt('repair', 'v2')).toBe(REPAIR_SYSTEM_PROMPT);
    expect(PromptRegistry.getPrompt('completion')).toBe(COMPLETION_SYSTEM_PROMPT);
    expect(PromptRegistry.getPrompt('unknown')).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it('has DEFAULT_SYSTEM_PROMPT', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toBeDefined();
    expect(DEFAULT_SYSTEM_PROMPT).toContain('SEARCH');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('REPLACE');
  });

  it('has SEARCH_REPLACE_INSTRUCTION', () => {
    expect(SEARCH_REPLACE_INSTRUCTION).toBeDefined();
    expect(SEARCH_REPLACE_INSTRUCTION).toContain('<<<<<<< SEARCH');
  });

  it('has COMPLETION_SYSTEM_PROMPT', () => {
    expect(COMPLETION_SYSTEM_PROMPT).toBeDefined();
    expect(COMPLETION_SYSTEM_PROMPT).toContain('<completion>');
  });

  it('builds planning, patch, and repair prompts', () => {
    const planPrompt = buildPlanningPrompt({
      userRequest: 'Refactor state',
      activeFilePath: 'src/State.js',
      activeFileContent: 'const state = {};',
    });
    expect(planPrompt).toContain('Current file: src/State.js');
    expect(planPrompt).toContain('User request:\nRefactor state');

    const patchPrompt = buildPatchPrompt({
      userRequest: 'Refactor state',
      plan: '- Objective: Clean up state',
      activeFilePath: 'src/State.js',
      activeFileContent: 'const state = {};',
    });
    expect(patchPrompt).toContain('Implementation Plan:\n- Objective: Clean up state');

    const repairPrompt = buildRepairPrompt({
      userRequest: 'Fix syntax',
      filePath: 'src/State.js',
      originalContent: 'const state = {};',
      failedPatch: 'invalid patch',
      diagnosticError: 'Unclosed bracket on line 1',
    });
    expect(repairPrompt).toContain('Diagnostic Error Trace:\nUnclosed bracket on line 1');
  });

  it('allocates token budget efficiently', () => {
    const allocated = allocateTokenBudget({
      systemPrompt: 'System',
      userRequest: 'Request',
      activeFileContent: 'x'.repeat(2000),
      relatedContext: [{ filePath: 'a.js', content: 'y'.repeat(2000) }],
      maxTokenBudget: 400,
    });

    expect(allocated.estimatedTokens).toBeLessThanOrEqual(450);
    expect(allocated.activeFileContent).toContain('[truncated]');
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

  it('includes linked CSS and truncates oversized context', () => {
    const context = formatCompactContext([
      {
        filePath: 'src/Card.js',
        content: 'x'.repeat(1500),
        linkedCss: [{ filePath: 'src/Card.css', content: 'y'.repeat(1500) }],
      },
    ]);

    expect(context).toContain('Related CSS: src/Card.css');
    expect(context.match(/\.\.\.\[truncated\]/g)).toHaveLength(2);
  });

  it('builds a minimal prompt when optional context is absent', () => {
    expect(
      buildEditPrompt({
        userRequest: 'Create a button',
        activeFilePath: '',
        activeFileContent: undefined,
      }),
    ).toBe('User request:\nCreate a button');
    expect(formatCompactContext()).toBe('');
  });

  it('handles a related file with omitted optional content and CSS metadata', () => {
    expect(formatCompactContext([{ filePath: 'empty.js' }])).toContain(
      'Related file: empty.js\n```\n\n```',
    );
  });

  it('omits incomplete active-file context', () => {
    const withMissingContent = buildEditPrompt({
      userRequest: 'Continue',
      activeFilePath: 'src/App.js',
      activeFileContent: undefined,
    });
    const withMissingPath = buildEditPrompt({
      userRequest: 'Continue',
      activeFilePath: '',
      activeFileContent: 'content',
    });

    expect(withMissingContent).toBe('User request:\nContinue');
    expect(withMissingPath).toBe('User request:\nContinue');
  });

  it('estimates token counts accurately', async () => {
    const { estimateTokens } = await import('./Prompts');
    expect(estimateTokens('12345678')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });

  it('trims related context when exceeding token budget', () => {
    const prompt = buildEditPrompt({
      userRequest: 'Fix layout',
      activeFilePath: 'src/App.js',
      activeFileContent: 'const a = 1;',
      relatedContext: [
        { filePath: 'src/a.js', content: 'file a content', linkedCss: [] },
        { filePath: 'src/b.js', content: 'file b content', linkedCss: [] },
      ],
      options: { maxTokenBudget: 50 },
    });

    expect(prompt).toContain('src/App.js');
    expect(prompt).toContain('User request:\nFix layout');
  });
});
