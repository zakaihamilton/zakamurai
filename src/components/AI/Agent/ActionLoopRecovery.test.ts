import { describe, expect, it } from 'vitest';
import {
  SMALL_MODEL_CONTEXT_READY_CHAR_BUDGET,
  buildContextReadyUserRequest,
  buildRepairFileMessages,
  createAutoFinishSummary,
  normalizeFinishSummary,
} from './ActionLoopRecovery';
import {
  isNewAppGenerationRequest,
  resolveActionLoopSessionPolicy,
  restrictLowerModelActions,
  restrictMidTierContextReadyActions,
  shouldSalvageGeneratedInteractiveSource,
} from './ActionLoopSmallModel';
import { createProjectStyleProfile } from './ProjectStyleProfile';
import { ALL_AGENT_ACTIONS } from './Protocol';

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

  it('injects host guidance, keeps the target file whole, and drops oversized sibling context', () => {
    const targetBody = `export default function App() { return <main>${'x'.repeat(3000)}</main>; }`;
    const prompt = buildContextReadyUserRequest({
      request: 'create a notes app',
      targetPath: 'src/App.jsx',
      files: {
        'src/App.jsx': targetBody,
        'src/App.module.css': `/* ${'z'.repeat(3000)} */\n.app { color: black; }\n`,
      },
      lightweight: true,
      hostGuidance: 'Host assistance: write one complete component file.',
      priorContext: `[read_file {"path":"src/Other.jsx"}]\n${'y'.repeat(2200)}`,
    });

    expect(prompt).toContain('Host assistance: write one complete component file.');
    expect(prompt).toContain(targetBody);
    expect(prompt).not.toContain('z'.repeat(3000));
    expect(prompt).toContain('labelled code fence');
    expect(prompt.length).toBeLessThanOrEqual(SMALL_MODEL_CONTEXT_READY_CHAR_BUDGET + 80);
  });

  it('carries todo behavior, interactive contract, and visual guidance into context-ready generation', () => {
    const prompt = buildContextReadyUserRequest({
      request: 'build a todo app',
      targetPath: 'src/App.jsx',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      lightweight: true,
    });

    expect(prompt).toContain('stable ids');
    expect(prompt).toContain('All/Active/Completed filter tabs');
    expect(prompt).toContain('terracotta accent');
    expect(prompt).toContain('primary controls and current status');
    expect(prompt).toContain('targeted item or cell by index');
  });

  it('adds clock and board briefs for those request types', () => {
    const clock = buildContextReadyUserRequest({
      request: 'create a stopwatch timer',
      targetPath: 'src/App.jsx',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      lightweight: true,
    });
    const board = buildContextReadyUserRequest({
      request: 'create a tic tac toe game',
      targetPath: 'src/App.jsx',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      includeProductContract: true,
    });

    expect(clock).toContain('setInterval or setTimeout');
    expect(board).toContain('indexed collection');
    expect(board).toContain('<button type="button">');
  });

  it('treats list-app requests as notes-style apps without matching list-files queries', () => {
    const listApp = buildContextReadyUserRequest({
      request: 'create a list app',
      targetPath: 'src/App.jsx',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      lightweight: true,
    });
    const listFiles = buildContextReadyUserRequest({
      request: 'list files in src',
      targetPath: 'src/App.jsx',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      lightweight: true,
    });

    expect(listApp).toContain('controlled title or body field');
    expect(listFiles).not.toContain('controlled title or body field');
  });

  it('blocks replace_file_content for lower-tier models and keeps 3B on write/finish', () => {
    expect(restrictLowerModelActions(ALL_AGENT_ACTIONS)).not.toContain('replace_file_content');
    expect(restrictLowerModelActions(ALL_AGENT_ACTIONS)).toContain('write_file');
    expect(restrictMidTierContextReadyActions(ALL_AGENT_ACTIONS)).toEqual([
      'write_file',
      'delete_file',
      'finish',
    ]);
  });

  it('keeps 3B on the mid-tier write path even without manager context', () => {
    const policy = resolveActionLoopSessionPolicy({
      model: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
      priorContext: '',
      agentRole: null,
      allowedActions: ALL_AGENT_ACTIONS,
      systemPrompt: 'default system prompt',
    });

    expect(policy.midTierAssisted).toBe(true);
    expect(policy.useContextReadyPrompt).toBe(true);
    expect(policy.enforceFulfillment).toBe(true);
    expect(policy.effectiveAllowedActions).toEqual(['write_file', 'delete_file', 'finish']);
  });

  it('salvages interactive source for new apps and known app types, not unrelated edits', () => {
    expect(shouldSalvageGeneratedInteractiveSource('create a notes app', false)).toBe(true);
    expect(
      shouldSalvageGeneratedInteractiveSource('wire up the notes form on the existing page', true),
    ).toBe(true);
    expect(shouldSalvageGeneratedInteractiveSource('change the heading color', true)).toBe(false);
    expect(shouldSalvageGeneratedInteractiveSource('polish the existing interface', true)).toBe(
      false,
    );
  });
});
