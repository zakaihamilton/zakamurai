import { AgentSessionState } from '@/components/App/Panes/Prompt/AgentSessions';
import { PromptUiState } from '@/components/App/Panes/Prompt/PromptState';
import { TabState } from '@/components/App/Panes/TabBar';
import { WebLLMState } from '@/components/AI/WebLLMState';
import { ChangeSetState } from '@/components/Workspace';
import { makeAgentSession } from '@/test-utils/agentSessionMocks';
import { createMockStateStore, makeTabState } from '@/test-utils/stateMocks';
import type {
  AgentSessionStateShape,
  ChangeSetStateShape,
  PromptUiStateShape,
  WebLLMStateShape,
} from '@/types/domain-types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AISectionView from './AISection';

vi.mock('@/components/App/Panes/Prompt/AgentSessions', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/components/App/Panes/Prompt/AgentSessions')>();
  return {
    ...actual,
    AgentSessionState: { useState: vi.fn() },
  };
});

vi.mock('@/components/App/Panes/Prompt/PromptState', () => ({
  PromptUiState: { useState: vi.fn() },
}));

vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: { useState: vi.fn() },
}));

vi.mock('@/components/AI/WebLLMState', () => ({
  WebLLMState: { useState: vi.fn() },
}));

vi.mock('@/components/Workspace', () => ({
  ChangeSetState: { useState: vi.fn() },
}));

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

describe('AISectionView', () => {
  it('defaults reasoning tabs to Visual and persists switching to Text', () => {
    const session = makeAgentSession({
      reasoning: 'A useful progress update',
      reasoningEvents: [{ text: '**Routing:** choosing a path', timestamp: '10:00:00' }],
    });
    const agentState = createMockStateStore<AgentSessionStateShape>({
      sessions: { [session.id]: session },
      activeSessionId: session.id,
    });
    const tabState = makeTabState({
      openTabs: [{ id: 'ai-section:reasoning', type: 'ai-section', label: 'Progress & Reasoning' }],
      activeTabId: 'ai-section:reasoning',
    });
    const promptState = createMockStateStore<PromptUiStateShape>({
      selectedModel: 'Qwen3.5-4B-q4f16_1-MLC',
      val: '',
      historyIndex: -1,
      draftVal: '',
      welcomePrompt: '',
      isModelManagerOpen: false,
      cachedModelIds: [],
      modelCacheWork: null,
      modelCacheProgress: '',
      modelCacheError: '',
      animatedWidth: 0,
      abortController: null,
      promptScope: 'project',
      welcomeRequest: null,
      runningSessionId: null,
      isAgentTreeOpen: false,
      latestManagerTrace: null,
      latestAIIncident: null,
      stopRequest: 0,
    });
    const webLLMState = createMockStateStore<WebLLMStateShape>({
      engines: {},
      cachedModelIds: [],
      activeModelId: null,
      capabilityReport: null,
    });
    const changeSetState = createMockStateStore<ChangeSetStateShape>({
      items: [],
      activeId: null,
    });

    vi.mocked(AgentSessionState.useState).mockReturnValue(agentState);
    vi.mocked(PromptUiState.useState).mockReturnValue(promptState);
    vi.mocked(TabState.useState).mockReturnValue(tabState);
    vi.mocked(WebLLMState.useState).mockReturnValue(webLLMState);
    vi.mocked(ChangeSetState.useState).mockReturnValue(changeSetState);

    const { rerender } = render(
      <AISectionView
        tab={{ id: 'ai-section:reasoning', type: 'ai-section', label: 'Progress & Reasoning' }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Show visual timeline' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('region', { name: 'Reasoning timeline' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Show text log' }));

    expect(tabState.openTabs[0].viewType).toBe('text');
    rerender(<AISectionView tab={tabState.openTabs[0]} />);
    expect(screen.getByRole('button', { name: 'Show text log' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
