import type { AgentAction, AgentEventHandler, FileMap } from '@/components/AI/types';
import { CHANGE_REQUEST_PATTERN } from './ActionLoopPromptBuilder';
import type { AgentWorkspace } from './Workspace';

export const APP_ENTRY_PATHS = new Set([
  'src/App.jsx',
  'src/App.tsx',
  'src/main.jsx',
  'src/main.tsx',
  'src/index.jsx',
  'src/index.tsx',
]);

export const isScratchEntry = (content: string | undefined): boolean =>
  Boolean(
    content && /<h1>New Project<\/h1>/.test(content) && /Start coding here\.\.\./.test(content),
  );

export const recoveryWritePath = (
  files: Record<string, string>,
  activeFile?: string | null,
  request = '',
): string | null => {
  const requestedComponent =
    /\b(src\/components\/[A-Za-z0-9_/-]+\.(?:jsx|tsx))\b/.exec(request)?.[1] || null;
  if (requestedComponent) return requestedComponent;
  if (activeFile && Object.hasOwn(files, activeFile) && /\.(?:[jt]sx?)$/i.test(activeFile))
    return activeFile;
  return (
    [...APP_ENTRY_PATHS].find((path) => Object.hasOwn(files, path)) ||
    Object.keys(files).find((path) => /\.(?:[jt]sx?)$/i.test(path)) ||
    null
  );
};

export const recoverDeferredSource = ({
  source,
  files,
  request,
  lightweight,
  turn,
  action,
  agentRole,
  onEvent,
  fulfills,
}: {
  source: { path: string; content: string };
  files: FileMap;
  request: string;
  lightweight: boolean;
  turn: number;
  action: AgentAction;
  agentRole: string | null;
  onEvent: AgentEventHandler;
  fulfills: (files: FileMap, request: string) => string | null;
}): { path: string; content: string; diagnostic: string } | null => {
  if (!lightweight) return null;
  const diagnostic = fulfills(files, request);
  if (!diagnostic) return null;
  onEvent({
    type: 'observation',
    turn,
    action,
    error: true,
    message: `${diagnostic} The queued source was staged for context, but it is not accepted as complete. Return a corrected write_file action for ${source.path} with the complete implementation.`,
    agentRole,
  });
  return { path: source.path, content: files[source.path] || source.content, diagnostic };
};

export const newlyCreatedComponentsNeedEntryWiring = (workspace: AgentWorkspace): boolean =>
  workspace
    .changes()
    .some(
      (change) =>
        change.before === undefined &&
        /^src\/components\/[^/]+\.(?:jsx|tsx)$/i.test(change.path) &&
        ![...APP_ENTRY_PATHS].some((path) => workspace.original[path] !== workspace.files[path]),
    );

export const wireNewComponentIntoScratchEntry = (workspace: AgentWorkspace): string | null => {
  const entryPath = [...APP_ENTRY_PATHS].find((path) => isScratchEntry(workspace.original[path]));
  if (!entryPath || workspace.original[entryPath] !== workspace.files[entryPath]) return null;

  const component = workspace
    .changes()
    .find(
      (change) =>
        change.before === undefined &&
        /^src\/components\/[^/]+\.(?:jsx|tsx)$/i.test(change.path) &&
        /\bexport\s+default\b/.test(change.after || ''),
    );
  if (!component?.after) return null;

  const componentName = component.path
    .split('/')
    .pop()
    ?.replace(/\.(?:jsx|tsx)$/i, '')
    .replace(/[^A-Za-z0-9_$]/g, '');
  if (!componentName || !/^[A-Za-z_$]/.test(componentName)) return null;

  const componentSpecifier = `./${component.path
    .split('/')
    .slice(1)
    .join('/')
    .replace(/\.(?:jsx|tsx)$/i, '')}`;
  workspace.write(
    entryPath,
    `import ${componentName} from "${componentSpecifier}";\n\nexport default function App() {\n  return <${componentName} />;\n}\n`,
  );
  return entryPath;
};

export const createAutoFinishSummary =
  (request: string) =>
  (
    reason: 'validate' | 'fulfillment' | 'identical-write' | 'unchanged-reads' | 'safety-limit',
    wiredEntry: string | null,
    validationStatus: 'passed' | 'failed' | 'unavailable' = 'passed',
  ): string => {
    const base =
      reason === 'safety-limit'
        ? 'Prepared a partial draft after the agent reached its step safety limit; it was not reported as a completed request.'
        : validationStatus === 'unavailable'
          ? CHANGE_REQUEST_PATTERN.test(request)
            ? 'Prepared the requested changes for review; build validation was unavailable.'
            : 'Prepared the staged changes for review; build validation was unavailable.'
          : CHANGE_REQUEST_PATTERN.test(request)
            ? reason === 'fulfillment'
              ? 'Prepared the requested changes for review; deterministic request checks passed, but build validation was unavailable.'
              : 'Completed the requested changes and validated the build.'
            : reason === 'validate'
              ? 'Validated the staged changes after the local model repeated validation.'
              : reason === 'fulfillment'
                ? 'Prepared the staged changes for review; build validation was unavailable.'
                : reason === 'identical-write'
                  ? 'Validated the staged changes after the local model repeated an identical write action.'
                  : 'Validated the staged changes after the local model repeatedly read unchanged files.';
    return wiredEntry
      ? `${base} wired ${wiredEntry} to the new component so it renders in the app.`
      : base;
  };

const GENERIC_FINISH_SUMMARY =
  /further development|start coding|proceed with|\/dist\b|build sequence|necessary files|successfully (?:created|built)(?:\s+\w+){0,4}\s+validat/i;

/** Replace scaffold-style finish blurbs with a request-grounded summary. */
export const normalizeFinishSummary = ({
  summary,
  request,
  changeCount,
  wiredEntry = null,
  validationStatus = 'passed',
}: {
  summary?: string | null;
  request: string;
  changeCount: number;
  wiredEntry?: string | null;
  validationStatus?: 'passed' | 'failed' | 'unavailable';
}): string => {
  const trimmed = typeof summary === 'string' ? summary.trim() : '';
  const clipped = request.trim().replace(/\s+/g, ' ').slice(0, 80);
  const validationUnavailable =
    validationStatus === 'unavailable' &&
    /\b(?:build|built|complete|completed|finish(?:ed)?|implement(?:ed)?|validat(?:e|ed|ion)|ready)\b/i.test(
      trimmed,
    );
  const useRequestSummary =
    CHANGE_REQUEST_PATTERN.test(request) &&
    changeCount > 0 &&
    (!trimmed || GENERIC_FINISH_SUMMARY.test(trimmed));
  const base = validationUnavailable
    ? 'Prepared the requested changes for review; build validation was unavailable.'
    : useRequestSummary
      ? `Implemented “${clipped}” and validated the build.`
      : trimmed || (changeCount > 0 ? `Prepared ${changeCount} file(s) for review.` : 'Done.');
  return wiredEntry
    ? `${base} Wired ${wiredEntry} to the new component so it renders in the app.`
    : base;
};
