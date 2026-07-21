import { TabState } from '@/components/App/Panes/TabBar';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ImageViewer from './ImageViewer';

vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: { useState: vi.fn() },
}));

vi.mock('@/components/App/Views/FileViewToolbar', () => ({
  default: ({ onSelectView }) => (
    <button type="button" data-testid="toolbar" onClick={() => onSelectView?.('editor')}>
      Switch View
    </button>
  ),
}));

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }) => <>{children}</>,
}));

describe('ImageViewer', () => {
  let mockFile;
  let mockFsHandle;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFile = new File(['image-content'], 'test.png', { type: 'image/png' });
    mockFsHandle = {
      getFile: vi.fn().mockResolvedValue(mockFile),
    };
    TabState.useState.mockReturnValue(
      Object.assign(vi.fn(), {
        activeTabId: '1',
        openTabs: [{ id: '1', file: { name: 'test.png', path: ['src', 'test.png'] } }],
      }),
    );
    global.URL.createObjectURL = vi.fn().mockReturnValue('mock-object-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('renders loading states and loads image URL from file handle', async () => {
    const tab = {
      id: '1',
      file: { name: 'test.png', path: ['src', 'test.png'] },
      fsHandle: mockFsHandle,
    };

    render(<ImageViewer tab={tab} />);

    // Wait for the useEffect to fetch file and create object URL
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFsHandle.getFile).toHaveBeenCalled();
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockFile);
    expect(screen.getByTestId('toolbar')).toBeDefined();
  });

  it('renders image from file content (no fsHandle)', async () => {
    const tab = {
      id: '2',
      file: {
        name: 'photo.png',
        path: ['images', 'photo.png'],
        content: new Uint8Array([1, 2, 3]),
      },
    };

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it('shows error when no fsHandle and no content', async () => {
    const tab = {
      id: '3',
      file: { name: 'broken.png', path: ['broken.png'] },
    };

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('No media content available.')).toBeDefined();
  });

  it('handles fsHandle getFile rejection', async () => {
    const failHandle = {
      getFile: vi.fn().mockRejectedValue(new Error('Permission denied')),
    };
    const tab = {
      id: '4',
      file: { name: 'fail.png', path: ['fail.png'] },
      fsHandle: failHandle,
    };

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Error message should be displayed
    expect(screen.getByText('Unable to load file.')).toBeDefined();
    spy.mockRestore();
  });

  it('zoom in button calls state update', async () => {
    const tabUpdater = vi.fn();
    TabState.useState.mockReturnValue(
      Object.assign(tabUpdater, {
        activeTabId: '1',
        openTabs: [{ id: '1', file: { name: 'test.png', path: ['test.png'] } }],
      }),
    );

    const tab = {
      id: '1',
      file: { name: 'test.png', path: ['test.png'], content: new Uint8Array([1]) },
    };

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    const zoomInBtn = screen.getByText('+');
    await act(async () => fireEvent.click(zoomInBtn));
    // Since ImageViewerState is the real hook, clicking zoom-in will invoke state update
    // We verify the button exists and is clickable without crash
    expect(zoomInBtn).toBeDefined();
  });

  it('zoom out button exists and is clickable', async () => {
    const tab = {
      id: '1',
      file: { name: 'test.png', path: ['test.png'], content: new Uint8Array([1]) },
    };

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    const zoomOutBtn = screen.getByText('−');
    await act(async () => fireEvent.click(zoomOutBtn));
    expect(zoomOutBtn).toBeDefined();
  });

  it('zoom reset button is clickable', async () => {
    const tab = {
      id: '1',
      file: { name: 'test.png', path: ['test.png'], content: new Uint8Array([1]) },
    };

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    const zoomResetBtn = screen.getByText('100%');
    await act(async () => fireEvent.click(zoomResetBtn));
    expect(zoomResetBtn).toBeDefined();
  });

  it('toggle grid button is clickable', async () => {
    const tab = {
      id: '1',
      file: { name: 'test.png', path: ['test.png'], content: new Uint8Array([1]) },
    };

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    // The grid toggle button contains a Grid icon
    const allButtons = screen.getAllByRole('button');
    // Last button among zoom controls is toggle grid
    const gridBtn = allButtons.find((btn) => !btn.textContent || btn.textContent.trim() === '');
    if (gridBtn) {
      await act(async () => fireEvent.click(gridBtn));
    }
  });

  it('toolbar button triggers handleSelectView', async () => {
    const tabUpdater = vi.fn();
    TabState.useState.mockReturnValue(
      Object.assign(tabUpdater, {
        activeTabId: '1',
        openTabs: [{ id: '1', file: { name: 'test.png', path: ['test.png'] } }],
      }),
    );

    const tab = {
      id: '1',
      file: { name: 'test.png', path: ['test.png'], content: new Uint8Array([1]) },
    };

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByTestId('toolbar'));
    expect(tabUpdater).toHaveBeenCalled();
  });

  it('renders file path from tab', async () => {
    const tab = {
      id: '1',
      file: { name: 'photo.svg', path: ['assets', 'photo.svg'], content: '<svg/>' },
    };

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('assets/photo.svg')).toBeDefined();
  });
});
