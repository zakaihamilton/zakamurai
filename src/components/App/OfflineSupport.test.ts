import { mockServiceWorker } from '@/test-utils/domMocks';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useOfflineSupport } from './OfflineSupport';

describe('useOfflineSupport', () => {
  it('registers service worker when supported', async () => {
    const mockRegistration = { update: vi.fn() };
    const mockRegister = vi.fn().mockResolvedValue(mockRegistration);

    mockServiceWorker(mockRegister);

    const { unmount } = renderHook(() => useOfflineSupport());

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockRegister).toHaveBeenCalledWith('/__sw__.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    expect(mockRegistration.update).toHaveBeenCalled();

    unmount();
  });

  it('handles service worker registration errors gracefully', async () => {
    const mockRegister = vi.fn().mockRejectedValue(new Error('Registration failed'));
    mockServiceWorker(mockRegister);

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderHook(() => useOfflineSupport());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });
});
