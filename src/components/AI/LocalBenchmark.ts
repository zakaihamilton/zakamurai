import type { FileMap, WebLLMMessage } from '@/components/AI/types';

export type LocalAIBenchmarkFeature = {
  id: string;
  label: string;
  sourcePattern?: string;
  previewPattern?: string;
};

export type LocalAIBenchmarkCase = {
  id: string;
  request: string;
  features: LocalAIBenchmarkFeature[];
};

export type LocalAIBenchmarkPreview = {
  status?: string;
  domSummary?: string;
  elements?: string[];
  runtimeErrors?: string[];
  screenshotCaptured?: boolean;
  diagnostics?: string;
};

export type LocalAIBenchmarkCheck = {
  id: string;
  label: string;
  passed: boolean;
  details?: string;
};

export const LOCAL_AI_BENCHMARK_CASES: LocalAIBenchmarkCase[] = [
  {
    id: 'todo',
    request:
      'Create a polished, responsive todo app where I can add tasks, mark them complete, delete them, and filter between All, Active, and Completed.',
    features: [
      {
        id: 'task-entry',
        label: 'Task entry control is present',
        sourcePattern: '<(?:input|textarea)\\b',
      },
      {
        id: 'task-actions',
        label: 'Add, completion, and delete actions are implemented',
        sourcePattern:
          '(?=[\\s\\S]*(?:add|create))(?=[\\s\\S]*(?:complete|toggle|done))(?=[\\s\\S]*(?:delete|remove))',
      },
      {
        id: 'task-filters',
        label: 'All, Active, and Completed filters are represented',
        sourcePattern: '(?=[\\s\\S]*all)(?=[\\s\\S]*active)(?=[\\s\\S]*completed)',
      },
      {
        id: 'todo-heading',
        label: 'Preview has a task or todo heading',
        previewPattern: '(todo|to-do|task)',
      },
    ],
  },
  {
    id: 'dashboard',
    request:
      'Create a polished, responsive analytics dashboard with revenue and user metrics, a recent activity section, and clear navigation.',
    features: [
      {
        id: 'dashboard-heading',
        label: 'Preview has a dashboard or analytics heading',
        previewPattern: '(dashboard|analytics|overview)',
      },
      {
        id: 'dashboard-metrics',
        label: 'Revenue and user metrics are represented',
        sourcePattern:
          '(?=[\\s\\S]*(?:revenue|sales|mrr))(?=[\\s\\S]*(?:users|customers|visitors))',
      },
      {
        id: 'dashboard-activity',
        label: 'Recent activity is represented',
        sourcePattern: '(recent activity|activity feed|latest activity)',
      },
      {
        id: 'dashboard-responsive',
        label: 'Responsive layout rules are present',
        sourcePattern: '(@media|auto-fit|clamp\\(|minmax\\()',
      },
    ],
  },
  {
    id: 'landing',
    request:
      'Create a polished, responsive landing page for a design studio with a strong hero, a services section, and a clear contact call to action.',
    features: [
      {
        id: 'landing-heading',
        label: 'Preview has a design or studio heading',
        previewPattern: '(design|studio)',
      },
      {
        id: 'landing-services',
        label: 'Services content is represented',
        sourcePattern: '(services|what we do)',
      },
      {
        id: 'landing-contact',
        label: 'Preview has a contact call to action',
        previewPattern: '(contact|get in touch|let.s talk)',
      },
      {
        id: 'landing-responsive',
        label: 'Responsive layout rules are present',
        sourcePattern: '(@media|auto-fit|clamp\\(|minmax\\()',
      },
    ],
  },
];

export function getLocalAIBenchmarkSetupError({
  hasWebGPU,
  hasAdapter,
  hasWorkers,
}: {
  hasWebGPU: boolean;
  hasAdapter: boolean;
  hasWorkers: boolean;
}): string | null {
  if (!hasWebGPU) {
    return 'WebGPU is unavailable. Use a supported Chromium browser with WebGPU enabled and a compatible graphics driver.';
  }
  if (!hasAdapter) {
    return 'WebGPU could not find a compatible adapter. Check browser GPU settings and available GPU memory.';
  }
  if (!hasWorkers) {
    return 'Web Workers are unavailable. Run the benchmark in a supported browser context.';
  }
  return null;
}

export function getLocalAIBenchmarkModelError(
  modelId: string,
  availableModelIds: string[],
): string | null {
  return availableModelIds.includes(modelId) ? null : `Unknown local model: ${modelId}`;
}

export function fingerprintPromptMessages(messages: WebLLMMessage[]): string {
  const content = messages
    .map((message) => `${message.role}\n${message.content.length}\n${message.content}`)
    .join('\n');
  return fingerprintText(content);
}

export function fingerprintFiles(files: FileMap): string {
  const stableFiles = Object.fromEntries(
    Object.entries(files).sort(([left], [right]) => left.localeCompare(right)),
  );
  return fingerprintText(JSON.stringify(stableFiles));
}

export function evaluateLocalAIBenchmarkCase({
  benchmarkCase,
  startingFiles,
  files,
  buildStatus,
  preview,
}: {
  benchmarkCase: LocalAIBenchmarkCase;
  startingFiles: FileMap;
  files: FileMap;
  buildStatus: string;
  preview: LocalAIBenchmarkPreview | null;
}): { passed: boolean; checks: LocalAIBenchmarkCheck[] } {
  const source = Object.entries(files)
    .filter(([path]) => /\.(?:jsx?|tsx?|css)$/i.test(path))
    .map(([, content]) => content)
    .join('\n')
    .toLowerCase();
  const previewContent = [preview?.domSummary, ...(preview?.elements || [])]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  const runtimeErrors = preview?.runtimeErrors?.filter(Boolean) || [];
  const checks: LocalAIBenchmarkCheck[] = [
    {
      id: 'entry-updated',
      label: 'App entry file was updated',
      passed: Boolean(
        (files['src/App.jsx'] && files['src/App.jsx'] !== startingFiles['src/App.jsx']) ||
          (files['src/App.tsx'] && files['src/App.tsx'] !== startingFiles['src/App.jsx']),
      ),
    },
    {
      id: 'build',
      label: 'Project compiles',
      passed: buildStatus === 'passed',
      details: buildStatus,
    },
    {
      id: 'preview',
      label: 'Preview rendered with screenshot evidence',
      passed: preview?.status === 'passed' && preview.screenshotCaptured === true,
      details: preview?.status || 'unavailable',
    },
    {
      id: 'runtime-errors',
      label: 'Preview has no runtime errors',
      passed: runtimeErrors.length === 0,
      ...(runtimeErrors.length ? { details: runtimeErrors.join('\n') } : {}),
    },
    {
      id: 'no-placeholder',
      label: 'Generated project does not contain starter placeholder copy',
      passed: !Object.values(files).some((content) =>
        /Your implementation|Start coding here/i.test(content),
      ),
    },
  ];

  for (const feature of benchmarkCase.features) {
    const sourceMatches = feature.sourcePattern
      ? new RegExp(feature.sourcePattern, 'i').test(source)
      : true;
    const previewMatches = feature.previewPattern
      ? new RegExp(feature.previewPattern, 'i').test(previewContent)
      : true;
    checks.push({
      id: feature.id,
      label: feature.label,
      passed: sourceMatches && previewMatches,
    });
  }

  return { passed: checks.every((check) => check.passed), checks };
}

function fingerprintText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
