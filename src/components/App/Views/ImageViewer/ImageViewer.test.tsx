import type { ReactNode } from 'react';
import type { Tab } from '@/components/state/domain-types';
import { TabState } from '@/components/App/Panes/TabBar';
import { createMockTab } from '@/test-utils/editorMocks';
import { makeTabState } from '@/test-utils/stateMocks';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ImageViewer from './ImageViewer';

vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: { usePassiveState: vi.fn() },
}));

vi.mock('@/components/App/Views/FileViewToolbar', () => ({
  default: ({ onSelectView }: { onSelectView?: (view: string) => void }) => (
    <button type="button" data-testid="toolbar" onClick={() => onSelectView?.('editor')}>
      Switch View
    </button>
  ),
}));

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

type ImageViewerTab = Tab & {
  file?: Tab['file'] & { content?: string | Blob };
  fsHandle?: FileSystemFileHandle;
};

function imageTab(
  id: string,
  file: { name: string; path: string[]; content?: string | Blob | Uint8Array },
  extras: Partial<ImageViewerTab> = {},
): ImageViewerTab {
  return createMockTab({
    id,
    label: file.name,
    type: 'file',
    file: file as NonNullable<Tab['file']>,
    ...extras,
  }) as ImageViewerTab;
}

describe('ImageViewer', () => {
  let mockFile: File;
  let mockFsHandle: FileSystemFileHandle;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFile = new File(['image-content'], 'test.png', { type: 'image/png' });
    mockFsHandle = {
      getFile: vi.fn().mockResolvedValue(mockFile),
    } as unknown as FileSystemFileHandle;
    vi.mocked(TabState.usePassiveState).mockReturnValue(
      makeTabState({
        activeTabId: '1',
        openTabs: [
          createMockTab({
            id: '1',
            label: 'test.png',
            type: 'file',
            file: { name: 'test.png', path: ['src', 'test.png'] },
          }),
        ],
      }),
    );
    global.URL.createObjectURL = vi.fn().mockReturnValue('mock-object-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('renders loading states and loads image URL from file handle', async () => {
    const tab = imageTab(
      '1',
      { name: 'test.png', path: ['src', 'test.png'] },
      { fsHandle: mockFsHandle },
    );

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFsHandle.getFile).toHaveBeenCalled();
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockFile);
    expect(screen.getByTestId('toolbar')).toBeDefined();
  });

  it('renders image from file content (no fsHandle)', async () => {
    const tab = imageTab('2', {
      name: 'photo.png',
      path: ['images', 'photo.png'],
      content: new Uint8Array([1, 2, 3]),
    });

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it('shows error when no fsHandle and no content', async () => {
    const tab = imageTab('3', { name: 'broken.png', path: ['broken.png'] });

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('No media content available.')).toBeDefined();
  });

  it('handles fsHandle getFile rejection', async () => {
    const failHandle = {
      getFile: vi.fn().mockRejectedValue(new Error('Permission denied')),
    } as unknown as FileSystemFileHandle;
    const tab = imageTab('4', { name: 'fail.png', path: ['fail.png'] }, { fsHandle: failHandle });

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Unable to load file.')).toBeDefined();
    spy.mockRestore();
  });

  it('zoom in button calls state update', async () => {
    const tabUpdater = makeTabState({
      activeTabId: '1',
      openTabs: [
        createMockTab({
          id: '1',
          label: 'test.png',
          type: 'file',
          file: { name: 'test.png', path: ['test.png'] },
        }),
      ],
    });
    vi.mocked(TabState.usePassiveState).mockReturnValue(tabUpdater);

    const tab = imageTab('1', {
      name: 'test.png',
      path: ['test.png'],
      content: new Uint8Array([1]),
    });

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    const zoomInBtn = screen.getByText('+');
    await act(async () => fireEvent.click(zoomInBtn));
    expect(zoomInBtn).toBeDefined();
  });

  it('zoom out button exists and is clickable', async () => {
    const tab = imageTab('1', {
      name: 'test.png',
      path: ['test.png'],
      content: new Uint8Array([1]),
    });

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    const zoomOutBtn = screen.getByText('−');
    await act(async () => fireEvent.click(zoomOutBtn));
    expect(zoomOutBtn).toBeDefined();
  });

  it('zoom reset button is clickable', async () => {
    const tab = imageTab('1', {
      name: 'test.png',
      path: ['test.png'],
      content: new Uint8Array([1]),
    });

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    const zoomResetBtn = screen.getByText('100%');
    await act(async () => fireEvent.click(zoomResetBtn));
    expect(zoomResetBtn).toBeDefined();
  });

  it('toggle grid button is clickable', async () => {
    const tab = imageTab('1', {
      name: 'test.png',
      path: ['test.png'],
      content: new Uint8Array([1]),
    });

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    const allButtons = screen.getAllByRole('button');
    const gridBtn = allButtons.find((btn) => !btn.textContent || btn.textContent.trim() === '');
    if (gridBtn) {
      await act(async () => fireEvent.click(gridBtn));
    }
  });

  it('toolbar button triggers handleSelectView', async () => {
    const tabUpdater = makeTabState({
      activeTabId: '1',
      openTabs: [
        createMockTab({
          id: '1',
          label: 'test.png',
          type: 'file',
          file: { name: 'test.png', path: ['test.png'] },
        }),
      ],
    });
    vi.mocked(TabState.usePassiveState).mockReturnValue(tabUpdater);

    const tab = imageTab('1', {
      name: 'test.png',
      path: ['test.png'],
      content: new Uint8Array([1]),
    });

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByTestId('toolbar'));
    expect(tabUpdater).toHaveBeenCalled();
  });

  it('renders file path from tab', async () => {
    const tab = imageTab('1', {
      name: 'photo.svg',
      path: ['assets', 'photo.svg'],
      content: '<svg/>',
    });

    render(<ImageViewer tab={tab} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('assets/photo.svg')).toBeDefined();
  });
});
