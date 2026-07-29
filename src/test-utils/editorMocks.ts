import type {
  CodeEditorProps,
  EditorStateDraft,
  ExtendedEditorState,
  FindMatch,
  HighlightEditorState,
  NavigationPopupTarget,
  ScrollContainerRef,
  ShouldScrollRef,
  TextareaRef,
} from '@/components/App/Views/EditorArea/types';
import type { KeyboardEvent } from 'react';
import type { PendingDiff, Tab, TabStateShape } from '@/components/state/domain-types';
import type { Draft, StateStore } from '@/components/state/types';
import type { NavigationTarget, SourceLocation } from '@/utils/navigation/types';
import { vi, type Mock } from 'vitest';

function createStoreInternals<T extends object>() {
  return {
    __monitor: vi.fn(),
    __unmonitor: vi.fn(),
    __monitored: [] as never[],
    __unique: 'mock',
    __id: undefined,
    __object: {} as T,
    __counter: 0,
    __string: 'mock',
    __node: undefined,
  };
}

function createCallableMockStore<T extends object>(initial: T): StateStore<T> & Mock {
  const snapshot = { ...initial };

  const syncProps = () => {
    for (const key of Object.keys(snapshot) as (keyof T)[]) {
      (updater as Record<string, unknown>)[key as string] = snapshot[key];
    }
  };

  const updater = vi.fn((cb: (draft: Draft<T>) => void) => {
    const draft = structuredClone(snapshot) as Draft<T>;
    cb(draft);
    Object.assign(snapshot, draft);
    syncProps();
    return snapshot;
  }) as StateStore<T> & Mock;

  Object.assign(updater, snapshot, createStoreInternals<T>());
  syncProps();

  return new Proxy(updater, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !prop.startsWith('__') && prop in snapshot) {
        return (snapshot as Record<string, unknown>)[prop];
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (typeof prop === 'string' && !prop.startsWith('__') && prop in snapshot) {
        (snapshot as Record<string, unknown>)[prop] = value;
      }
      return Reflect.set(target, prop, value, receiver);
    },
  }) as StateStore<T> & Mock;
}

/** Minimal DOMRect for layout-dependent editor tests. */
export function mockDomRect(
  partial: Partial<DOMRect> & Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): DOMRect {
  const {
    left,
    top,
    width,
    height,
    x = left,
    y = top,
    bottom = top + height,
    right = left + width,
  } = partial;
  return {
    left,
    top,
    width,
    height,
    x,
    y,
    bottom,
    right,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Build a callable mock state store with snapshot properties. */
export function createMockEditorState(
  overrides: Partial<ExtendedEditorState> = {},
): StateStore<ExtendedEditorState> & Mock {
  return createCallableMockStore<ExtendedEditorState>({
    fileContents: {},
    aiCompletionEnabled: false,
    isReadOnly: false,
    navigationHistory: { stack: [], currentIndex: -1 },
    pendingDiffs: {},
    pendingDeletions: {},
    cursorPos: {},
    selectedLines: {},
    history: {},
    isCompleting: {},
    completionActivity: {},
    ...overrides,
  });
}

export function createMockTabState(
  overrides: Partial<TabStateShape> = {},
): StateStore<TabStateShape> & Mock {
  return createCallableMockStore<TabStateShape>({
    openTabs: [],
    activeTabId: null,
    lastCodeTabId: null,
    ...overrides,
  });
}

export function createMockShouldScrollRef(
  initial: { filePath: string; line: number } | null = null,
): ShouldScrollRef {
  return { current: initial };
}

export function createMockNavigationTarget(
  partial: Partial<NavigationTarget> & Pick<NavigationTarget, 'type' | 'start' | 'end'>,
): NavigationTarget {
  return {
    targets: [],
    ...partial,
  };
}

export function createMockSourceLocation(partial: Partial<SourceLocation> = {}): SourceLocation {
  return { line: 1, col: 1, index: 0, ...partial };
}

export function createMockPopupTarget(
  partial: Partial<NavigationPopupTarget> & Pick<NavigationPopupTarget, 'filePath' | 'fileName'>,
): NavigationPopupTarget {
  return {
    loc: createMockSourceLocation(),
    ...partial,
  };
}

export function createDefaultCodeEditorProps(
  overrides: Partial<CodeEditorProps> = {},
): CodeEditorProps {
  return {
    localContent: 'const a = 1;',
    handleChange: vi.fn(),
    highlightedCode: 'const a = 1;',
    readOnly: false,
    onCursorUpdate: vi.fn(),
    cursorPos: { line: 1, col: 1, index: 0 },
    scrollContainerRef: { current: null },
    suggestion: '',
    onAcceptSuggestion: vi.fn(),
    onCancelSuggestion: vi.fn(),
    isCompleting: false,
    filePath: 'src/App.js',
    isReadOnly: true,
    onCopySelection: undefined,
    navigationLinksEnabled: true,
    onNavigateToAssociated: vi.fn(),
    fileContents: {},
    onJumpToTarget: vi.fn(),
    ...overrides,
  };
}

export function createMockFindMatch(partial: Partial<FindMatch> = {}): FindMatch {
  return {
    line: 1,
    index: 0,
    absoluteIndex: 0,
    length: 1,
    ...partial,
  };
}

export function createMockTab(partial: Partial<Tab> & Pick<Tab, 'id' | 'type' | 'label'>): Tab {
  return partial as Tab;
}

export type MockEditorState = StateStore<ExtendedEditorState> &
  Mock<(draft: EditorStateDraft) => void>;
export type MockTabState = StateStore<TabStateShape> & Mock<(draft: TabStateShape) => void>;

export function createMockTextareaRef(partial: Partial<HTMLTextAreaElement> = {}): TextareaRef {
  return {
    current: {
      selectionStart: 0,
      selectionEnd: 0,
      value: '',
      focus: vi.fn(),
      scrollTo: vi.fn(),
      ...partial,
    } as HTMLTextAreaElement,
  };
}

export function createKeyboardEvent(
  partial: Partial<KeyboardEvent<HTMLTextAreaElement>> &
    Pick<KeyboardEvent<HTMLTextAreaElement>, 'key'>,
): KeyboardEvent<HTMLTextAreaElement> {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...partial,
  } as KeyboardEvent<HTMLTextAreaElement>;
}

export function createMockPendingDiff(
  overrides: Partial<PendingDiff> & Pick<PendingDiff, 'originalContent'>,
): PendingDiff {
  return {
    modifiedContent: overrides.originalContent,
    diffs: [],
    ...overrides,
  };
}

export function createMockHighlightState(
  overrides: Partial<HighlightEditorState> = {},
): HighlightEditorState {
  return {
    pendingDiffs: {},
    selectedLines: {},
    fileContents: {},
    cursorPos: {},
    ...overrides,
  };
}

export function createMockScrollContainerRef(
  partial: Partial<HTMLDivElement> = {},
): ScrollContainerRef {
  return {
    current: {
      scrollTo: vi.fn(),
      ...partial,
    } as HTMLDivElement,
  };
}

export function createSetLocalContentMock(): Mock<
  (value: string | ((prev: string) => string)) => void
> {
  return vi.fn((value: string | ((prev: string) => string)) => {
    if (typeof value === 'function') {
      value('');
    }
  });
}
