import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ZakamuraiState } from '../State';
import TopBar from './TopBar';

vi.mock('../State', () => ({
  ZakamuraiState: {
    useState: vi.fn(),
  },
}));

describe('TopBar', () => {
  it('renders breadcrumbs for an active file', () => {
    ZakamuraiState.useState.mockReturnValue({
      openTabs: [
        {
          id: 'test.js',
          type: 'file',
          label: 'test.js',
          file: { path: ['src', 'test.js'], name: 'test.js' },
        },
      ],
      activeTabId: 'test.js',
    });

    render(<TopBar />);
    expect(screen.getByText('src')).toBeDefined();
    expect(screen.getByText('test.js')).toBeDefined();
  });

  it('renders default breadcrumb when no active tab', () => {
    ZakamuraiState.useState.mockReturnValue({
      openTabs: [],
      activeTabId: null,
    });

    render(<TopBar />);
    expect(screen.getByText('Zakamurai')).toBeDefined();
  });
});
