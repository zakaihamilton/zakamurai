import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProjectDeviceReadiness from './DeviceReadiness';

const refreshCapabilities = vi.fn();

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Brain: () => <span />,
  },
}));

vi.mock('@/components/AI/WebLLMModels', () => ({
  WEB_LLM_MODELS: [{ id: 'compact', name: 'Compact model' }],
}));

vi.mock('@/components/AI/useDeviceCapabilities', () => ({
  useDeviceCapabilities: vi.fn(),
}));

import { useDeviceCapabilities } from '@/components/AI/useDeviceCapabilities';

const report = {
  tier: 'compact-ai' as const,
  browser: 'Google Chrome',
  isMobile: true,
  hasWorker: true,
  hasWebGPU: true,
  deviceMemoryGB: 4,
  hardwareConcurrency: 4,
  storageUsageMB: 120,
  storageQuotaMB: 2048,
  recommendedModelId: 'compact',
  reasons: ['Mobile device detected; compact models are recommended.'],
  checkedAt: 0,
};

describe('ProjectDeviceReadiness', () => {
  it('shows a loading state before capability detection completes', () => {
    vi.mocked(useDeviceCapabilities).mockReturnValue({
      capabilityReport: null,
      isChecking: true,
      refreshCapabilities,
    });

    render(<ProjectDeviceReadiness />);

    expect(screen.getByText('Checking local AI support…')).toBeDefined();
    expect(screen.getByRole('region', { name: 'Device and AI readiness' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows device details and the recommended model', () => {
    vi.mocked(useDeviceCapabilities).mockReturnValue({
      capabilityReport: report,
      isChecking: false,
      refreshCapabilities,
    });

    render(<ProjectDeviceReadiness />);

    expect(screen.getByText('Compact local AI recommended')).toBeDefined();
    expect(screen.getByText('Compact model')).toBeDefined();
    expect(screen.getByText('2,048 MB quota')).toBeDefined();
    expect(screen.getByText(/Mobile device detected/)).toBeDefined();
  });

  it('disables recheck while detection is running', () => {
    vi.mocked(useDeviceCapabilities).mockReturnValue({
      capabilityReport: report,
      isChecking: true,
      refreshCapabilities,
    });

    render(<ProjectDeviceReadiness />);

    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
  });

  it('shows unavailable capability details without a model recommendation', () => {
    vi.mocked(useDeviceCapabilities).mockReturnValue({
      capabilityReport: {
        ...report,
        tier: 'no-ai',
        isMobile: false,
        hasWorker: false,
        hasWebGPU: false,
        deviceMemoryGB: null,
        storageQuotaMB: null,
        recommendedModelId: null,
        reasons: [],
      },
      isChecking: false,
      refreshCapabilities,
    });

    render(<ProjectDeviceReadiness />);

    expect(screen.getByText('Local AI needs attention')).toBeDefined();
    expect(screen.getByText(/Desktop · WebGPU unavailable/)).toBeDefined();
    expect(screen.getByText('Unavailable')).toBeDefined();
    expect(screen.getByText('Not reported')).toBeDefined();
    expect(screen.getByText('Quota unavailable')).toBeDefined();
    expect(screen.getByText('No model selected')).toBeDefined();
  });
});
