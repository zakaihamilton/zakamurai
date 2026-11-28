import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes';
import { LogState } from '@/components/App/Views/LogArea';
import { getProjectTemplates } from '@/components/Storage/InitialData';
import { makeAppState, makeLogState, makeTabState } from '@/test-utils/stateMocks';
import StartOptions from './StartOptions';

vi.mock('@/components/App/AppState', () => ({ AppState: { usePassiveState: vi.fn() } }));
vi.mock('@/components/App/Panes', () => ({ TabState: { usePassiveState: vi.fn() } }));
vi.mock('@/components/App/Views/LogArea', () => ({ LogState: { useState: vi.fn() } }));
vi.mock('@/components/ui/Icons', () => ({ Icons: { ChevronLeft: () => <span /> } }));

describe('StartOptions', () => {
  beforeEach(() => {
    vi.mocked(AppState.usePassiveState).mockReturnValue(makeAppState());
    vi.mocked(TabState.usePassiveState).mockReturnValue(
      makeTabState({
        openTabs: [
          { id: 'start-options', type: 'start-options', label: 'Starting point' },
          { id: 'instructions', type: 'instructions', label: 'Instructions' },
        ],
        activeTabId: 'start-options',
      }),
    );
    vi.mocked(LogState.useState).mockReturnValue(makeLogState());
  });

  it('shows the template choices and saved-project action on a separate page', () => {
    render(<StartOptions />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Choose a starting point' }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open saved project' })).toBeDefined();
    expect(screen.getAllByRole('button', { name: /Use this template/ })).toHaveLength(
      getProjectTemplates().length,
    );
  });

  it('requests the selected template', () => {
    const appState = makeAppState();
    vi.mocked(AppState.usePassiveState).mockReturnValue(appState);

    render(<StartOptions />);
    fireEvent.click(screen.getAllByRole('button', { name: /Use this template/ })[0]);

    expect(appState.projectActionRequest).toMatchObject({
      type: 'template',
      templateId: getProjectTemplates()[0].id,
    });
  });

  it('opens the saved-project library', () => {
    const appState = makeAppState();
    vi.mocked(AppState.usePassiveState).mockReturnValue(appState);

    render(<StartOptions />);
    fireEvent.click(screen.getByRole('button', { name: 'Open saved project' }));

    expect(appState.projectActionRequest).toMatchObject({ type: 'library' });
  });

  it('returns to Welcome and removes only its own tab', () => {
    const tabState = makeTabState({
      openTabs: [
        { id: 'start-options', type: 'start-options', label: 'Starting point' },
        { id: 'instructions', type: 'instructions', label: 'Instructions' },
      ],
      activeTabId: 'start-options',
    });
    vi.mocked(TabState.usePassiveState).mockReturnValue(tabState);

    render(<StartOptions />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to Welcome' }));

    expect(tabState.activeTabId).toBeNull();
    expect(tabState.openTabs.map((tab) => tab.id)).toEqual(['instructions']);
  });

  it('disables project actions while the workspace is processing', () => {
    vi.mocked(LogState.useState).mockReturnValue(makeLogState({ isAIProcessing: true }));

    render(<StartOptions />);

    expect(screen.getByRole('button', { name: 'Open saved project' })).toBeDisabled();
    for (const button of screen.getAllByRole('button', { name: /Use this template/ })) {
      expect(button).toBeDisabled();
    }
  });
});
