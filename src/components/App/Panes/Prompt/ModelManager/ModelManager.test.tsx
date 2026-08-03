import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { detectDeviceCapabilities } from '@/contracts/capabilities';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ModelManager from './index';

const capabilityMock = vi.hoisted(() => ({
  report: null as Awaited<ReturnType<typeof detectDeviceCapabilities>> | null,
  isChecking: false,
  refreshCapabilities: vi.fn(),
}));

const defaultModelManagerProps = {
  modelCacheWork: null,
  modelCacheProgress: '',
  modelCacheError: '',
};

vi.mock('@/components/ui/Dialog', () => ({
  default: ({
    children,
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText,
    cancelText,
  }: {
    children?: ReactNode;
    isOpen?: boolean;
    title?: ReactNode;
    message?: ReactNode;
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmText?: ReactNode;
    cancelText?: ReactNode;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="dialog">
        <button type="button" onClick={onCancel}>
          {cancelText || 'Close Dialog'}
        </button>
        <h3>{title}</h3>
        {children || <p>{message}</p>}
        {onConfirm && (
          <button type="button" onClick={onConfirm}>
            {confirmText || 'Confirm'}
          </button>
        )}
      </div>
    );
  },
}));

vi.mock('@/components/ui/Tooltip', () => ({
  __esModule: true,
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/AI/useDeviceCapabilities', () => ({
  useDeviceCapabilities: () => ({
    capabilityReport: capabilityMock.report,
    isChecking: capabilityMock.isChecking,
    refreshCapabilities: capabilityMock.refreshCapabilities,
  }),
}));

describe('ModelManager', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ModelManager
        isOpen={false}
        selectedModelId="Llama-3-8B-Instruct-q4f16_1"
        onCancel={vi.fn()}
        {...defaultModelManagerProps}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('opens the model manager dialog with searchable content', () => {
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3.5-4B-q4f16_1-MLC"
        cachedModelIds={['Qwen3.5-4B-q4f16_1-MLC']}
        onCancel={vi.fn()}
        {...defaultModelManagerProps}
      />,
    );

    expect(screen.getByText('AI Models')).toBeDefined();
    expect(screen.getByRole('searchbox', { name: 'Search models' })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Cache' })).toBeDefined();
  });

  it('displays progress or error status message', () => {
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3.5-4B-q4f16_1-MLC"
        cachedModelIds={[]}
        onCancel={vi.fn()}
        modelCacheProgress="Downloading: 50%"
        modelCacheWork={null}
        modelCacheError=""
      />,
    );

    expect(screen.getByText('Downloading: 50%')).toBeDefined();
  });

  it('filters models and sorts the result table', () => {
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3.5-4B-q4f16_1-MLC"
        cachedModelIds={[]}
        onCancel={vi.fn()}
        {...defaultModelManagerProps}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search models' }), {
      target: { value: 'Qwen' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'RAM' }));
    expect(screen.getByText('Qwen3.5 4B')).toBeDefined();
  });

  it('renders a visible model cache error', () => {
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3.5-4B-q4f16_1-MLC"
        cachedModelIds={[]}
        onCancel={vi.fn()}
        modelCacheProgress=""
        modelCacheWork={null}
        modelCacheError="Unable to cache this model"
      />,
    );
    expect(screen.getByText('Unable to cache this model')).toBeDefined();
  });

  it('shows the capability-specific local AI diagnostics card', async () => {
    capabilityMock.report = await detectDeviceCapabilities(WEB_LLM_MODELS);
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3.5-4B-q4f16_1-MLC"
        cachedModelIds={[]}
        onCancel={vi.fn()}
        {...defaultModelManagerProps}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Local AI unavailable')).toBeDefined();
    });
    expect(screen.getByText(/WebGPU unavailable/)).toBeDefined();
    expect(screen.getByText(/quota unavailable/)).toBeDefined();
    expect(screen.getByText(/Workers: available/)).toBeDefined();
  });

  it('recommends compact local AI on constrained mobile hardware', async () => {
    const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    const originalMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const originalWidth = window.innerWidth;
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: vi.fn().mockResolvedValue({}) },
    });
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    capabilityMock.report = await detectDeviceCapabilities(WEB_LLM_MODELS);

    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3.5-4B-q4f16_1-MLC"
        cachedModelIds={[]}
        onCancel={vi.fn()}
        {...defaultModelManagerProps}
      />,
    );

    await waitFor(() => expect(screen.getByText('Compact local AI recommended')).toBeDefined());
    expect(screen.getByText(/Mobile · WebGPU ready/)).toBeDefined();
    expect(screen.getByText(/Device memory: 2 GB/)).toBeDefined();

    Object.defineProperty(navigator, 'gpu', { configurable: true, value: originalGpu });
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      value: originalMemory,
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });

  it('shows the full local AI recommendation on capable desktop hardware', async () => {
    const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    const originalMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const originalConcurrency = navigator.hardwareConcurrency;
    const originalWidth = window.innerWidth;
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: vi.fn().mockResolvedValue({}) },
    });
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 16 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: vi.fn().mockResolvedValue({ quota: 2_000_000_000 }) },
    });
    capabilityMock.report = await detectDeviceCapabilities(WEB_LLM_MODELS);

    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3.5-4B-q4f16_1-MLC"
        cachedModelIds={[]}
        onCancel={vi.fn()}
        {...defaultModelManagerProps}
      />,
    );

    await waitFor(() => expect(screen.getByText('Full local AI available')).toBeDefined());
    expect(screen.getByText(/Desktop · WebGPU ready/)).toBeDefined();
    expect(screen.getByText(/Recommended:/)).toBeDefined();

    Object.defineProperty(navigator, 'gpu', { configurable: true, value: originalGpu });
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      value: originalMemory,
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      value: originalConcurrency,
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });
});
