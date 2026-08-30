import { describe, expect, it } from 'vitest';
import {
  buildContextReadyUserRequest,
  buildRepairFileMessages,
  createAutoFinishSummary,
  isNewAppGenerationRequest,
  normalizeFinishSummary,
} from './ActionLoopRecovery';
import { createProjectStyleProfile } from './ProjectStyleProfile';

describe('responsive generation scope', () => {
  it('does not call a safety-limited draft completed', () => {
    const summary = createAutoFinishSummary('create a todo app')('safety-limit', null);

    expect(summary).toContain('partial draft');
    expect(summary).not.toContain('Completed the requested changes');
  });

  it('does not claim automatic validation when the validator is unavailable', () => {
    const summary = createAutoFinishSummary('create a notes app')('validate', null, 'unavailable');

    expect(summary).toContain('validation was unavailable');
    expect(summary).not.toContain('validated the build');
  });

  it('does not claim build validation when validation is unavailable', () => {
    const summary = normalizeFinishSummary({
      summary: 'Completed the requested changes and validated the build.',
      request: 'create a todo app',
      changeCount: 2,
      validationStatus: 'unavailable',
    });

    expect(summary).toContain('validation was unavailable');
    expect(summary).not.toContain('validated the build');
  });

  it('recognizes new app-generation requests without treating existing edits as generation', () => {
    expect(isNewAppGenerationRequest('Create a responsive dashboard')).toBe(true);
    expect(isNewAppGenerationRequest('Build a new dashboard')).toBe(true);
    expect(isNewAppGenerationRequest('make a todo app')).toBe(true);
    expect(isNewAppGenerationRequest('make this dashboard responsive')).toBe(false);
    expect(isNewAppGenerationRequest('polish the existing interface')).toBe(false);
  });

  it('adds the stronger responsive contract only for new app generation', () => {
    const styleProfile = createProjectStyleProfile({});
    const base = {
      targetPath: 'src/App.jsx',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      styleProfile,
    };
    const generated = buildContextReadyUserRequest({
      ...base,
      request: 'Create a responsive dashboard',
      responsiveGeneration: true,
    });
    const edited = buildContextReadyUserRequest({
      ...base,
      request: 'polish the existing interface',
      responsiveGeneration: false,
    });

    expect(generated).toContain('320px, 375px, 768px, and 1440px');
    expect(edited).not.toContain('320px, 375px, 768px, and 1440px');
  });

  it('builds a focused repair prompt with the failed source and diagnostic', () => {
    const messages = buildRepairFileMessages({
      request: 'create a tic tac toe game',
      targetPath: 'src/App.jsx',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      failedContent: 'export default function App() { return <main>Broken</main>;',
      diagnostic: "Unclosed '{' in src/App.jsx",
    });

    expect(messages[0].content).toContain('repairing one failed source file');
    expect(messages[1].content).toContain("Unclosed '{'");
    expect(messages[1].content).toContain('Broken');
    expect(messages[1].content).toContain('src/App.jsx');
    expect(messages[1].content).toContain('targeted item or cell by index');
    expect(messages[1].content).toContain('compute derived status from the next state');
  });

  it('gives mapped clickable collection items a concrete semantic repair', () => {
    const messages = buildRepairFileMessages({
      request: 'create a game',
      targetPath: 'src/App.jsx',
      files: {},
      failedContent: 'items.map((item) => <div onClick={() => select(item)}>{item}</div>)',
      diagnostic:
        'Generated content for src/App.jsx uses a non-interactive element as a clickable collection item.',
      lightweight: true,
    });

    expect(messages[1].content).toContain('<button type="button">');
    expect(messages[1].content).toContain('mapped root element itself has onClick');
    expect(messages[1].content).toContain('Nested controls inside a <li>');
    expect(messages[1].content).toContain('do not repeat the failed JSX unchanged');
  });

  it('does not feed starter markup back into a repair loop', () => {
    const messages = buildRepairFileMessages({
      request: 'build a todo app',
      targetPath: 'src/App.jsx',
      files: {},
      failedContent:
        'export default function App() { return <><h1>New Project</h1><p>Start coding here...</p></>; }',
      diagnostic: 'Generated content for src/App.jsx still looks like the starter template.',
      lightweight: true,
    });

    expect(messages[1].content).toContain('generate the requested application from scratch');
    expect(messages[1].content).not.toContain('<h1>New Project</h1>');
    expect(messages[1].content).toContain('All/Active/Completed filter tabs');
  });

  it('injects host guidance and truncates oversized lightweight context', () => {
    const prompt = buildContextReadyUserRequest({
      request: 'create a notes app',
      targetPath: 'src/App.jsx',
      files: {
        'src/App.jsx': `export default function App() { return <main>${'x'.repeat(3000)}</main>; }`,
      },
      lightweight: true,
      hostGuidance: 'Host assistance: write one complete component file.',
      priorContext: `[read_file {"path":"src/Other.jsx"}]\n${'y'.repeat(2200)}`,
    });

    expect(prompt).toContain('Host assistance: write one complete component file.');
    expect(prompt).toContain('…[context truncated]');
    expect(prompt).toContain('labelled code fence');
  });

  it('carries todo behavior and visual guidance into context-ready generation', () => {
    const prompt = buildContextReadyUserRequest({
      request: 'build a todo app',
      targetPath: 'src/App.jsx',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      lightweight: true,
    });

    expect(prompt).toContain('stable ids');
    expect(prompt).toContain('All/Active/Completed filter tabs');
    expect(prompt).toContain('terracotta accent');
  });
});
