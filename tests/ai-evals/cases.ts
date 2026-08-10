import { AI_EVAL_VERSION, type AIEvalCase } from '@/components/AI/AIEvals';

export const QUALIFICATION_MODEL_IDS = [
  'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
  'Qwen3.5-2B-q4f16_1-MLC',
  'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
  'Qwen3.5-0.8B-q4f16_1-MLC',
];

const base = (
  id: string,
  category: AIEvalCase['category'],
  request: string,
  candidate: AIEvalCase['candidate'],
  expected: AIEvalCase['expected'],
  modelFacing = true,
): AIEvalCase => ({
  version: AI_EVAL_VERSION,
  id,
  category,
  request,
  modelFacing,
  modelIds: QUALIFICATION_MODEL_IDS,
  candidate,
  expected,
});

const appChange = (content: string, preview = false): AIEvalCase['candidate'] => ({
  changes: [{ path: 'src/App.jsx', content }],
  buildStatus: 'passed',
  previewStatus: preview ? 'passed' : 'not-required',
  mutatedInput: false,
  latencyMs: 1,
  memoryMB: 1,
  repairCount: 0,
  fallbackCount: 0,
});

const component = (body: string) =>
  `export default function App() { return <main><h1>${body}</h1><button type="button">Save</button></main>; }`;

export const AI_EVAL_CASES: AIEvalCase[] = [
  ...[
    ['agent-new-todo', 'Create a todo app', 'Todo'],
    ['agent-new-dashboard', 'Create a dashboard', 'Dashboard'],
    ['agent-new-form', 'Create a contact form', 'Contact'],
    ['agent-new-list', 'Create a reading list', 'Reading'],
    ['agent-fix-title', 'Fix the incorrect title', 'Correct title'],
    ['agent-fix-handler', 'Fix the save handler', 'Save changes'],
    ['agent-fix-state', 'Fix the empty state', 'No items'],
    ['agent-refactor-component', 'Refactor the header component', 'Header'],
    ['agent-refactor-types', 'Refactor the TypeScript props', 'Typed'],
    ['agent-package-change', 'Add the declared package integration', 'Package'],
    ['agent-follow-up-copy', 'Update the copy from the prior request', 'Updated copy'],
    ['agent-follow-up-style', 'Polish the existing interface', 'Polished'],
  ].map(([id, request, label]) =>
    base(
      id,
      'agent',
      request,
      appChange(component(label), id.startsWith('agent-new') || id.includes('style')),
      {
        requiredIncludes: [label],
        forbiddenIncludes: ['TODO', 'Your implementation'],
        requireBuild: true,
        requirePreview: id.startsWith('agent-new') || id.includes('style'),
      },
    ),
  ),
  ...[
    ['completion-js', 'Complete JavaScript', 'return value;'],
    ['completion-ts', 'Complete TypeScript', ': string => value;'],
    ['completion-tsx', 'Complete TSX', '<Button>Save</Button>'],
    ['completion-css', 'Complete CSS', 'display: grid;'],
    ['completion-json', 'Complete JSON', '"enabled": true'],
    ['completion-boundary', 'Complete without repeating context', 'nextValue'],
  ].map(([id, request, completion]) =>
    base(id, 'completion', request, { completion }, { requiredIncludes: [completion] }),
  ),
  ...[
    ['explain-app', 'Explain the app', 'src/App.jsx renders the application.', 'src/App.jsx'],
    [
      'explain-state',
      'Explain state management',
      'src/components/state/State.tsx creates state stores.',
      'src/components/state/State.tsx',
    ],
    [
      'explain-build',
      'Explain the build',
      'scripts/runtime-assets.ts prepares assets.',
      'scripts/runtime-assets.ts',
    ],
    [
      'explain-tests',
      'Explain tests',
      'tests/ai-manager/replay.test.ts checks replay.',
      'tests/ai-manager/replay.test.ts',
    ],
  ].map(([id, request, answer, path]) =>
    base(
      id,
      'explanation',
      request,
      { answer, evidence: `${path}\nsource evidence` },
      { requiredIncludes: [path] },
    ),
  ),
  ...[
    ['lifecycle-cold-start', ['initializing', 'ready', 'generating', 'success']],
    ['lifecycle-warm-reuse', ['ready', 'generating', 'success']],
    ['lifecycle-cancel', ['generating', 'aborted', 'cleaned']],
    ['lifecycle-unload', ['ready', 'idle', 'unloaded']],
  ].map(([id, events]) =>
    base(
      id as string,
      'lifecycle',
      id as string,
      { events: events as string[] },
      { eventSequence: events as string[] },
      false,
    ),
  ),
  ...[
    ['recovery-network', ['network-failure', 'retry', 'success']],
    ['recovery-worker', ['worker-failure', 'retry', 'success']],
    ['recovery-oom', ['out-of-memory', 'fallback', 'success']],
    ['recovery-stall', ['stalled', 'retry', 'fallback', 'success']],
  ].map(([id, events]) =>
    base(
      id as string,
      'recovery',
      id as string,
      {
        events: events as string[],
        fallbackCount: (events as string[]).includes('fallback') ? 1 : 0,
      },
      { eventSequence: events as string[] },
      false,
    ),
  ),
];
