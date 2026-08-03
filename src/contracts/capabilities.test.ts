import { describe, expect, it, vi } from 'vitest';
import {
  detectDeviceCapabilities,
  getCapabilityTier,
  getModelTier,
  getRecommendedModelId,
} from './capabilities';

describe('device capability contracts', () => {
  it('classifies unavailable, compact, and full AI tiers', () => {
    expect(
      getCapabilityTier({
        hasWorker: false,
        hasWebGPU: true,
        isMobile: false,
        deviceMemoryGB: 16,
        hardwareConcurrency: 8,
      }),
    ).toBe('no-ai');
    expect(
      getCapabilityTier({
        hasWorker: true,
        hasWebGPU: true,
        isMobile: true,
        deviceMemoryGB: 8,
        hardwareConcurrency: 8,
      }),
    ).toBe('compact-ai');
    expect(
      getCapabilityTier({
        hasWorker: true,
        hasWebGPU: true,
        isMobile: false,
        deviceMemoryGB: 16,
        hardwareConcurrency: 8,
      }),
    ).toBe('full-ai');
    expect(
      getCapabilityTier({
        hasWorker: true,
        hasWebGPU: false,
        isMobile: false,
        deviceMemoryGB: 16,
        hardwareConcurrency: 8,
      }),
    ).toBe('no-ai');
    expect(
      getCapabilityTier({
        hasWorker: true,
        hasWebGPU: true,
        isMobile: false,
        deviceMemoryGB: 16,
        hardwareConcurrency: 4,
      }),
    ).toBe('compact-ai');
  });

  it('maps model size to a practical profile and recommendation', () => {
    expect(getModelTier({ ramMB: 1600 })).toBe('recovery');
    expect(getModelTier({ ramMB: 3500 })).toBe('compact');
    expect(getModelTier({ ramMB: 6000 })).toBe('full');
    expect(
      getRecommendedModelId('compact-ai', [
        { id: 'small', ramMB: 1600 },
        { id: 'medium', ramMB: 3500 },
      ]),
    ).toBe('medium');
    expect(getRecommendedModelId('no-ai', [{ id: 'small', ramMB: 1600 }])).toBeNull();
    expect(getRecommendedModelId('full-ai', [])).toBeNull();
    expect(getRecommendedModelId('full-ai', [{ id: 'medium', ramMB: 3500 }])).toBe('medium');
  });

  it('reports browser capabilities and storage estimates', async () => {
    const originalWorker = globalThis.Worker;
    const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    const originalDeviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const originalHardwareConcurrency = navigator.hardwareConcurrency;
    const originalUserAgent = navigator.userAgent;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class Worker {} });
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: vi.fn().mockResolvedValue({}) },
    });
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Chrome/1.0' });
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: vi.fn().mockResolvedValue({ usage: 2_000_000, quota: 1_000_000_000 }) },
    });

    const report = await detectDeviceCapabilities([{ id: 'small', ramMB: 1600 }]);

    expect(report.tier).toBe('full-ai');
    expect(report.browser).toBe('Google Chrome');
    expect(report.storageUsageMB).toBeCloseTo(1.9, 1);
    expect(report.storageQuotaMB).toBeCloseTo(953.7, 1);
    expect(report.recommendedModelId).toBe('small');

    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Edg/1.0' });
    expect((await detectDeviceCapabilities()).browser).toBe('Microsoft Edge');
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Firefox/1.0' });
    expect((await detectDeviceCapabilities()).browser).toBe('Firefox');
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Safari/1.0' });
    expect((await detectDeviceCapabilities()).browser).toBe('Safari');
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Other/1.0' });
    expect((await detectDeviceCapabilities()).browser).toBe('Unknown browser');

    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: originalWorker });
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: originalGpu });
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      value: originalDeviceMemory,
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      value: originalHardwareConcurrency,
    });
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: originalUserAgent });
  });

  it('surfaces constrained mobile and storage failures without throwing', async () => {
    const originalWorker = globalThis.Worker;
    const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    const originalDeviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const originalHardwareConcurrency = navigator.hardwareConcurrency;
    const originalWidth = window.innerWidth;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class Worker {} });
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: vi.fn().mockResolvedValue({}) },
    });
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });

    const report = await detectDeviceCapabilities();

    expect(report.tier).toBe('compact-ai');
    expect(report.isMobile).toBe(true);
    expect(report.reasons).toEqual(
      expect.arrayContaining([
        'Mobile device detected; compact models are recommended.',
        'The browser reports 2 GB of device memory.',
      ]),
    );
    expect(report.storageUsageMB).toBeNull();
    expect(report.hardwareConcurrency).toBeNull();

    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: originalWorker });
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: originalGpu });
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      value: originalDeviceMemory,
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      value: originalHardwareConcurrency,
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });

  it('reports no-AI mode when browser execution primitives are missing', async () => {
    const originalWorker = globalThis.Worker;
    const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });

    const report = await detectDeviceCapabilities();

    expect(report.tier).toBe('no-ai');
    expect(report.reasons).toEqual(
      expect.arrayContaining([
        'Web Workers are unavailable.',
        'WebGPU is unavailable in this browser or context.',
      ]),
    );

    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: originalWorker });
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: originalGpu });
  });

  it('does not claim WebGPU support when no adapter is available', async () => {
    const originalWorker = globalThis.Worker;
    const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class Worker {} });
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: vi.fn().mockResolvedValue(null) },
    });

    const report = await detectDeviceCapabilities();

    expect(report.hasWebGPU).toBe(false);
    expect(report.tier).toBe('no-ai');

    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: originalWorker });
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: originalGpu });
  });

  it('recovers from WebGPU adapter probing failures', async () => {
    const originalWorker = globalThis.Worker;
    const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class Worker {} });
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: vi.fn().mockRejectedValue(new Error('adapter unavailable')) },
    });

    const report = await detectDeviceCapabilities();

    expect(report.hasWebGPU).toBe(false);
    expect(report.tier).toBe('no-ai');

    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: originalWorker });
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: originalGpu });
  });

  it('does not treat an incomplete WebGPU object as supported', async () => {
    const originalWorker = globalThis.Worker;
    const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class Worker {} });
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: {} });

    const report = await detectDeviceCapabilities();

    expect(report.hasWebGPU).toBe(false);
    expect(report.tier).toBe('no-ai');

    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: originalWorker });
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: originalGpu });
  });

  it('chooses a model that fits constrained reported memory', () => {
    expect(
      getRecommendedModelId(
        'compact-ai',
        [
          { id: 'recovery', ramMB: 1600 },
          { id: 'compact', ramMB: 2245 },
          { id: 'large-compact', ramMB: 3867 },
        ],
        2,
      ),
    ).toBe('recovery');
  });
});
