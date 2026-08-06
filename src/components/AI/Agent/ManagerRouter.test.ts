import { describe, expect, it } from 'vitest';
import {
  classifyManagerIntent,
  createManagerPlan,
  isLikelyFileRequest,
  isLikelyProjectCheck,
  isLikelyUiRequest,
} from './ManagerRouter';

describe('manager router', () => {
  it('routes obvious workspace requests to tools without requiring a model', () => {
    expect(classifyManagerIntent('list the files in src/components')).toBe('workspace-query');
    expect(createManagerPlan('search for useState').modelRequired).toBe(false);
  });

  it('routes checks and preview inspection to deterministic tools', () => {
    expect(createManagerPlan('run the tests').steps[0]).toMatchObject({
      kind: 'tool',
      tool: 'list_project_checks',
    });
    expect(createManagerPlan('inspect the preview').steps[0]).toMatchObject({
      kind: 'tool',
      tool: 'inspect_preview',
    });
    expect(createManagerPlan('build the project').modelRequired).toBe(false);
    expect(createManagerPlan('which project checks are available').modelRequired).toBe(false);
  });

  it('routes direct file reads to tools', () => {
    expect(createManagerPlan('read package.json')).toMatchObject({
      intent: 'workspace-query',
      modelRequired: false,
    });
  });

  it('routes edits and explanations through bounded model work', () => {
    expect(createManagerPlan('explain this component')).toMatchObject({
      intent: 'explanation',
      modelRequired: true,
    });
    expect(createManagerPlan('add a button to the app')).toMatchObject({
      intent: 'edit',
      modelRequired: true,
    });
    expect(isLikelyUiRequest('create a todo app')).toBe(true);
    expect(createManagerPlan('create a todo app').steps).toContainEqual(
      expect.objectContaining({ kind: 'tool', tool: 'inspect_preview' }),
    );
    expect(isLikelyUiRequest('rename a utility function')).toBe(false);
  });

  it('uses the fallback manager plan for ambiguous requests and exposes mixed routing', () => {
    expect(classifyManagerIntent('')).toBeNull();
    expect(createManagerPlan('tell me something interesting')).toMatchObject({
      intent: 'explanation',
      confidence: 'fallback',
      modelRequired: true,
    });
    expect(createManagerPlan('change the app and inspect the preview')).toMatchObject({
      intent: 'mixed',
      modelRequired: true,
    });
  });

  it('keeps semantic diagnostics on the model path', () => {
    expect(createManagerPlan('why is the build failing?')).toMatchObject({
      intent: 'explanation',
      modelRequired: true,
    });
    expect(createManagerPlan('diagnose this test error')).toMatchObject({
      intent: 'explanation',
      modelRequired: true,
    });
    expect(classifyManagerIntent('search for error')).toBe('workspace-query');
  });

  it('keeps the legacy request predicates deterministic', () => {
    expect(isLikelyProjectCheck('perform a lint check')).toBe(true);
    expect(isLikelyProjectCheck('explain the check')).toBe(false);
    expect(isLikelyFileRequest('read src/App.jsx')).toBe(true);
    expect(isLikelyFileRequest('explain the component')).toBe(false);
  });
});
