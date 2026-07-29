import { WorkspaceHealthState } from '@/components/Workspace';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceHealth from './WorkspaceHealth';

vi.mock('@/components/Workspace', () => ({
  WorkspaceHealthState: {
    useState: vi.fn(),
  },
}));

describe('WorkspaceHealth', () => {
  it('renders nothing when health is idle', () => {
    vi.spyOn(WorkspaceHealthState, 'useState').mockReturnValue({
      status: 'idle',
      indexedFiles: 0,
      totalFiles: 0,
      skippedFiles: [],
    });

    const { container } = render(<WorkspaceHealth />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when health is missing', () => {
    vi.spyOn(WorkspaceHealthState, 'useState').mockReturnValue(null);

    const { container } = render(<WorkspaceHealth />);
    expect(container.firstChild).toBeNull();
  });

  it('renders indexing status', () => {
    vi.spyOn(WorkspaceHealthState, 'useState').mockReturnValue({
      status: 'indexing',
      indexedFiles: 4,
      totalFiles: 10,
      skippedFiles: [],
    });

    render(<WorkspaceHealth />);
    expect(screen.getByText('Indexing workspace…')).toBeDefined();
  });

  it('renders indexed file counts when complete', () => {
    vi.spyOn(WorkspaceHealthState, 'useState').mockReturnValue({
      status: 'ready',
      indexedFiles: 8,
      totalFiles: 10,
      skippedFiles: [],
    });

    render(<WorkspaceHealth />);
    expect(screen.getByText('8/10 files indexed')).toBeDefined();
  });

  it('shows skipped file count when present', () => {
    vi.spyOn(WorkspaceHealthState, 'useState').mockReturnValue({
      status: 'ready',
      indexedFiles: 7,
      totalFiles: 10,
      skippedFiles: ['large.bin', 'ignored.tmp'],
    });

    render(<WorkspaceHealth />);
    expect(screen.getByText(/2 skipped/)).toBeDefined();
  });
});
