import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ZakamuraiState } from '../State';
import Sidebar from './Sidebar';

// Mock the state
vi.mock('../State', () => ({
  ZakamuraiState: {
    useState: vi.fn(),
  },
}));

describe('Sidebar', () => {
  it('renders the project name', () => {
    ZakamuraiState.useState.mockReturnValue({
      isSidebarOpen: true,
      folderTree: [],
      showAIInput: true,
      projectName: 'Test Project',
    });

    render(<Sidebar />);
    expect(screen.getByText('Test Project')).toBeDefined();
    expect(screen.getByText('ZAKAMURAI')).toBeDefined();
  });

  it('toggles the sidebar when the logo is clicked', () => {
    const _mockState = vi.fn();
    ZakamuraiState.useState.mockReturnValue({
      isSidebarOpen: true,
      folderTree: [],
      showAIInput: true,
      projectName: 'Test Project',
    });
    // In our implementation, ZakamuraiState is also a function to update state
    // but here we are mocking the hook return value which usually includes the updater
    // Actually, in the real code: const state = ZakamuraiState.useState();
    // and state(d => { ... }) is used to update.

    const stateUpdate = vi.fn();
    ZakamuraiState.useState.mockReturnValue(
      Object.assign(stateUpdate, {
        isSidebarOpen: true,
        folderTree: [],
        showAIInput: true,
        projectName: 'Test Project',
      }),
    );

    render(<Sidebar />);
    const logo = screen.getByText('Z');
    fireEvent.click(logo);
    expect(stateUpdate).toHaveBeenCalled();
  });
});
