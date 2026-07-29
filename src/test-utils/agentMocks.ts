import type {
  AgentEvent,
  ChangeSetStateDraft,
  EditorStateDraft,
  FileMap,
  LogStateDraft,
  SidebarStateDraft,
  StateHandle,
} from '@/components/AI/types';
import { vi } from 'vitest';

export function createEditorStateMock(
  initial: EditorStateDraft = {},
): StateHandle<EditorStateDraft> {
  const state: EditorStateDraft = initial;
  state.fileContents ??= {};
  state.pendingDiffs ??= {};
  state.cursorPos ??= {};

  const syncProps = () => {
    for (const key of Object.keys(state) as (keyof EditorStateDraft)[]) {
      (updater as unknown as Record<string, unknown>)[key as string] = state[key];
    }
  };

  const updater = vi.fn((cb: (draft: EditorStateDraft) => void) => {
    const draft = structuredClone(state);
    cb(draft);
    Object.assign(state, draft);
    syncProps();
  }) as unknown as StateHandle<EditorStateDraft>;
  Object.assign(updater, state);
  syncProps();
  return updater;
}

export function createSidebarStateMock(
  initial: SidebarStateDraft = { folderTree: [] },
): StateHandle<SidebarStateDraft> {
  const state: SidebarStateDraft = initial;
  const syncProps = () => {
    for (const key of Object.keys(state) as (keyof SidebarStateDraft)[]) {
      (updater as unknown as Record<string, unknown>)[key as string] = state[key];
    }
  };
  const updater = vi.fn((cb: (draft: SidebarStateDraft) => void) => {
    cb(state);
    syncProps();
  }) as unknown as StateHandle<SidebarStateDraft>;
  Object.assign(updater, state);
  syncProps();
  return updater;
}

export function createLogStateMock(
  initial: LogStateDraft = { logs: [] },
): StateHandle<LogStateDraft> {
  const state: LogStateDraft = { ...initial };
  const updater = vi.fn((cb: (draft: LogStateDraft) => void) => {
    cb(state);
  }) as unknown as StateHandle<LogStateDraft>;
  Object.assign(updater, state);
  return updater;
}

export function createChangeSetStateMock(
  initial: ChangeSetStateDraft = { items: [], activeId: null },
): StateHandle<ChangeSetStateDraft> {
  const state: ChangeSetStateDraft = { ...initial };
  const updater = vi.fn((cb: (draft: ChangeSetStateDraft) => void) => {
    cb(state);
  }) as unknown as StateHandle<ChangeSetStateDraft>;
  Object.assign(updater, state);
  return updater;
}

export function createMutableEditorState(
  initial: EditorStateDraft = {},
): StateHandle<EditorStateDraft> {
  const state: EditorStateDraft = {
    fileContents: {},
    pendingDiffs: {},
    cursorPos: {},
    ...initial,
  };
  const updater = ((cb: (draft: EditorStateDraft) => void) => {
    const draft = structuredClone(state);
    cb(draft);
    Object.assign(state, draft);
  }) as StateHandle<EditorStateDraft>;
  Object.assign(updater, state);
  return updater;
}

export function createAskWebLLMMock(
  responses: string[] | string = '',
): ReturnType<typeof vi.fn> & { responses: string[] } {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const mock = vi.fn(async () => queue.shift() ?? '') as ReturnType<typeof vi.fn> & {
    responses: string[];
  };
  mock.responses = queue;
  return mock;
}

export function collectAgentEvents(): {
  events: AgentEvent[];
  handler: (event: AgentEvent) => void;
} {
  const events: AgentEvent[] = [];
  return {
    events,
    handler: (event: AgentEvent) => {
      events.push(event);
    },
  };
}

export function sampleFiles(overrides: FileMap = {}): FileMap {
  return {
    'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
    'src/a.js': 'export const a = 1;\n',
    ...overrides,
  };
}
