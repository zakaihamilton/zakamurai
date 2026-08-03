import type { AIIncident, ManagerTrace } from '@/components/AI/Agent';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PromptHeader from './Header';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Brain: () => <span />,
    Close: () => <span />,
    Copy: () => <span />,
    Check: () => <span />,
    Terminal: () => <span />,
    Download: () => <span />,
    Grid: () => <span />,
  },
}));

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
  },
  writable: true,
});

describe('PromptHeader', () => {
  it('renders title and status indicators', () => {
    render(<PromptHeader isAIProcessing={true} isSystemProcessing={true} />);
    expect(screen.getByText('AI Manager')).toBeDefined();
    expect(screen.getByText('Compiling')).toBeDefined();
  });

  it('copies full session content to clipboard when copy button is clicked', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(
      <PromptHeader
        isAIProcessing={false}
        isSystemProcessing={false}
        copyContent={'--- Transcript ---\nHello world'}
      />,
    );

    const copyBtn = screen.getByRole('button', {
      name: 'Copy full session transcript and reasoning to clipboard',
    });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('--- Transcript ---\nHello world');
  });

  it('does not expose agent mode controls', () => {
    render(<PromptHeader isAIProcessing={false} isSystemProcessing={false} />);
    expect(screen.queryByRole('button', { name: 'Team' })).toBeNull();
  });

  it('places the manager trace trigger in the header action row', () => {
    const trace: ManagerTrace = {
      version: 1,
      runId: 'header-trace',
      request: 'create a todo app',
      startedAt: 100,
      endedAt: 125,
      durationMs: 25,
      outcome: 'success' as const,
      events: [],
    };

    const { container } = render(
      <PromptHeader isAIProcessing={false} isSystemProcessing={false} latestManagerTrace={trace} />,
    );

    const traceButton = screen.getByRole('button', {
      name: 'Open manager debug trace (success)',
    });
    const headerActions = container.querySelector('[class*="headerActions"]');
    expect(headerActions?.contains(traceButton)).toBe(true);
  });

  it('opens the supported AI tools dialog from the header action row', () => {
    const { container } = render(
      <PromptHeader isAIProcessing={false} isSystemProcessing={false} />,
    );

    const toolsButton = screen.getByRole('button', { name: 'View supported AI tools' });
    const headerActions = container.querySelector('[class*="headerActions"]');
    expect(headerActions?.contains(toolsButton)).toBe(true);

    fireEvent.click(toolsButton);

    expect(screen.getByRole('dialog', { name: 'Supported AI tools' })).toBeDefined();
    expect(screen.getByText('Manager tools')).toBeDefined();
    expect(screen.getByText('Internal edit-loop actions')).toBeDefined();
    for (const name of [
      'list_files',
      'search_workspace',
      'search_semantic',
      'read_file',
      'validate',
      'list_project_checks',
      'run_project_check',
      'inspect_preview',
      'write_file',
      'delete_file',
      'finish',
    ]) {
      expect(screen.getByText(name)).toBeDefined();
    }
  });

  it('closes the supported AI tools dialog with Escape', () => {
    render(<PromptHeader isAIProcessing={false} isSystemProcessing={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'View supported AI tools' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Supported AI tools' })).toBeNull();
  });

  it('closes the supported AI tools dialog with its close button', () => {
    render(<PromptHeader isAIProcessing={false} isSystemProcessing={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'View supported AI tools' }));
    const dialog = screen.getByRole('dialog', { name: 'Supported AI tools' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));

    expect(screen.queryByRole('dialog', { name: 'Supported AI tools' })).toBeNull();
  });

  it('exposes export action for the latest incident', () => {
    const incident = { id: 'incident-header', classification: 'model-protocol' } as AIIncident;
    const onExportAIIncident = vi.fn();

    render(
      <PromptHeader
        isAIProcessing={false}
        isSystemProcessing={false}
        latestAIIncident={incident}
        onExportAIIncident={onExportAIIncident}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export AI incident' }));

    expect(onExportAIIncident).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Copy AI diagnosis' })).toBeNull();
  });
});
