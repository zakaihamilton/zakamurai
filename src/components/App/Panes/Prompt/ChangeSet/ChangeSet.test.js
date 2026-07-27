import { ChangeSetState } from '@/components/Workspace';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChangeSetPanel from './ChangeSet';

vi.mock('@/components/Workspace', () => ({
  ChangeSetState: {
    useState: vi.fn(),
  },
}));

describe('ChangeSetPanel', () => {
  it('renders null when active change set is not found', () => {
    vi.mocked(ChangeSetState.useState).mockReturnValue({ activeId: 'cs1', items: [] });
    const { container } = render(<ChangeSetPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders change set details, reviewed counts, and file list', () => {
    vi.mocked(ChangeSetState.useState).mockReturnValue({
      activeId: 'cs1',
      items: [
        {
          id: 'cs1',
          status: 'pending-review',
          request: 'Refactor components',
          files: [
            { path: 'src/App.js', status: 'accepted' },
            { path: 'src/index.js', status: 'conflicted' },
            { path: 'src/utils.js', status: 'pending-review' },
          ],
        },
      ],
    });

    render(<ChangeSetPanel />);

    expect(screen.getByText('Change set')).toBeDefined();
    expect(screen.getByText('pending-review')).toBeDefined();
    expect(screen.getByText('Refactor components')).toBeDefined();
    expect(screen.getByText(/2\/3 files reviewed/)).toBeDefined();
    expect(screen.getByText('src/App.js')).toBeDefined();
    expect(screen.getByText('⚠ src/index.js')).toBeDefined();
    expect(screen.getByText('src/utils.js')).toBeDefined();
  });
});
