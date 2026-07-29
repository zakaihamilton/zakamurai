import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAppBackgroundServices } from './AppBackgroundServices';

const useOfflineSupport = vi.fn();
const useTabRestorer = vi.fn();
const usePreviewRestorer = vi.fn();
const usePreviewErrorBridge = vi.fn();
const useContentSaver = vi.fn();
const useKeyboardHandler = vi.fn();
const useWorkspaceIndexer = vi.fn();

vi.mock('./OfflineSupport', () => ({
  useOfflineSupport: (...args: unknown[]) => useOfflineSupport(...args),
}));
vi.mock('@/components/App/Panes/TabBar/TabRestorer', () => ({
  useTabRestorer: (...args: unknown[]) => useTabRestorer(...args),
}));
vi.mock('@/components/App/Views/PreviewArea/PreviewRestorer', () => ({
  usePreviewRestorer: (...args: unknown[]) => usePreviewRestorer(...args),
}));
vi.mock('@/components/App/Views/PreviewArea/usePreviewErrorBridge', () => ({
  usePreviewErrorBridge: (...args: unknown[]) => usePreviewErrorBridge(...args),
}));
vi.mock('@/components/Storage/ContentSaver', () => ({
  useContentSaver: (...args: unknown[]) => useContentSaver(...args),
}));
vi.mock('@/components/App/keyboard/KeyboardHandler', () => ({
  useKeyboardHandler: (...args: unknown[]) => useKeyboardHandler(...args),
}));
vi.mock('@/components/Workspace', () => ({
  useWorkspaceIndexer: (...args: unknown[]) => useWorkspaceIndexer(...args),
}));

describe('useAppBackgroundServices', () => {
  it('starts all background service hooks', () => {
    renderHook(() => useAppBackgroundServices());

    expect(useOfflineSupport).toHaveBeenCalled();
    expect(useTabRestorer).toHaveBeenCalled();
    expect(usePreviewRestorer).toHaveBeenCalled();
    expect(usePreviewErrorBridge).toHaveBeenCalled();
    expect(useContentSaver).toHaveBeenCalled();
    expect(useKeyboardHandler).toHaveBeenCalled();
    expect(useWorkspaceIndexer).toHaveBeenCalled();
  });
});
