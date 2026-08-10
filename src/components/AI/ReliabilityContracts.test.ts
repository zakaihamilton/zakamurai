import { describe, expect, it } from 'vitest';
import { COMPLETION_RESPONSE_GRAMMAR } from './CompletionResponseFormat';
import {
  buildTaskContract,
  formatTaskContract,
  getModelCapabilityProfile,
  isTaskPathAllowed,
  responseFormatForTask,
  validateGroundedAnswer,
} from './ReliabilityContracts';

describe('AI reliability contracts', () => {
  it('builds UI contracts with bounded calls and complete validation requirements', () => {
    const contract = buildTaskContract({
      request: 'create a responsive todo app',
      activeFile: 'src/App.jsx',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
    });
    expect(contract.maxModelCalls).toBe(16);
    expect(contract.maxRepairRounds).toBe(2);
    expect(contract.requiredValidations).toEqual(['content', 'build', 'preview', 'console']);
    expect(formatTaskContract(contract)).toContain('src/App.jsx');
  });

  it('allows existing and new files only under approved project roots', () => {
    const contract = buildTaskContract({
      request: 'add a component',
      files: { 'src/App.jsx': '' },
    });
    expect(isTaskPathAllowed(contract, 'src/components/Card.jsx')).toBe(true);
    expect(isTaskPathAllowed(contract, 'package.json')).toBe(true);
    expect(isTaskPathAllowed(contract, '../secret')).toBe(false);
    expect(isTaskPathAllowed(contract, 'private/secret.ts')).toBe(false);
  });

  it.each([
    ['Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC', 'compact', 'standard'],
    ['Qwen3.5-2B-q4f16_1-MLC', 'compact', 'enhanced'],
    ['Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', 'recovery', 'enhanced'],
    ['Qwen3.5-0.8B-q4f16_1-MLC', 'recovery', 'enhanced'],
  ] as const)(
    'gives %s full task parity with tier-specific assistance',
    (model, tier, assistance) => {
      expect(getModelCapabilityProfile(model)).toMatchObject({
        tier,
        hostAssistance: assistance,
        filesPerGeneration: 1,
        supportsAllTaskKinds: true,
      });
    },
  );

  it('selects JSON and completion grammar formats without wrapping file bodies', () => {
    expect(responseFormatForTask('answer')).toEqual({ type: 'json_object' });
    expect(responseFormatForTask('plan-edit')).toEqual({ type: 'json_object' });
    expect(responseFormatForTask('completion')).toEqual({
      type: 'grammar',
      grammar: COMPLETION_RESPONSE_GRAMMAR,
    });
    expect(responseFormatForTask('write-file')).toBeUndefined();
  });

  it('rejects explanation paths that are absent from evidence', () => {
    expect(validateGroundedAnswer('src/App.jsx renders the app.', 'src/App.jsx')).toBeNull();
    expect(validateGroundedAnswer('src/Invented.ts owns state.', 'src/App.jsx')).toContain(
      'src/Invented.ts',
    );
  });
});
