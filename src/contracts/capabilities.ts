import type { WebLLMModel } from '@/components/AI/types';

export type DeviceCapabilityTier = 'full-ai' | 'compact-ai' | 'no-ai';

export type DeviceCapabilityReport = {
  tier: DeviceCapabilityTier;
  browser: string;
  isMobile: boolean;
  hasWorker: boolean;
  hasWebGPU: boolean;
  deviceMemoryGB: number | null;
  hardwareConcurrency: number | null;
  storageUsageMB: number | null;
  storageQuotaMB: number | null;
  recommendedModelId: string | null;
  reasons: string[];
  checkedAt: number;
};

export type ModelProfile = {
  id: string;
  name: string;
  tier: 'full' | 'compact' | 'recovery';
  ramMB: number;
  storageMB: number;
  recommendedFor: DeviceCapabilityTier[];
};

type NavigatorWithCapabilities = Navigator & {
  deviceMemory?: number;
  gpu?: { requestAdapter?: () => Promise<unknown | null> } | unknown;
  storage?: StorageManager;
};

const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return (
    coarsePointer ||
    window.innerWidth <= 768 ||
    /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  );
};

const browserName = (): string => {
  if (typeof navigator === 'undefined') return 'Unknown browser';
  const userAgent = navigator.userAgent;
  if (/Edg\//.test(userAgent)) return 'Microsoft Edge';
  if (/Chrome\//.test(userAgent)) return 'Google Chrome';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return 'Safari';
  return 'Unknown browser';
};

export function getModelTier(model: Pick<WebLLMModel, 'ramMB'>): ModelProfile['tier'] {
  if (model.ramMB <= 1800) return 'recovery';
  if (model.ramMB <= 4200) return 'compact';
  return 'full';
}

export function getCapabilityTier({
  hasWorker,
  hasWebGPU,
  isMobile,
  deviceMemoryGB,
  hardwareConcurrency,
}: Pick<
  DeviceCapabilityReport,
  'hasWorker' | 'hasWebGPU' | 'isMobile' | 'deviceMemoryGB' | 'hardwareConcurrency'
>): DeviceCapabilityTier {
  if (!hasWorker || !hasWebGPU) return 'no-ai';
  if (isMobile || (deviceMemoryGB !== null && deviceMemoryGB <= 4)) return 'compact-ai';
  if (hardwareConcurrency !== null && hardwareConcurrency <= 4) return 'compact-ai';
  return 'full-ai';
}

export function getRecommendedModelId(
  tier: DeviceCapabilityTier,
  models: Array<Pick<WebLLMModel, 'id' | 'ramMB'>>,
  deviceMemoryGB: number | null = null,
): string | null {
  if (tier === 'no-ai' || models.length === 0) return null;
  const memoryLimitMB =
    deviceMemoryGB !== null && deviceMemoryGB > 0 ? deviceMemoryGB * 1024 * 0.85 : null;
  const fittingModels = memoryLimitMB
    ? models.filter((model) => model.ramMB <= memoryLimitMB)
    : models;
  const candidates = (fittingModels.length ? fittingModels : models).filter((model) => {
    if (tier === 'full-ai') return getModelTier(model) === 'full';
    return getModelTier(model) === 'compact' || getModelTier(model) === 'recovery';
  });
  return (
    (
      candidates.sort((left, right) => right.ramMB - left.ramMB)[0] ||
      (fittingModels.length ? fittingModels : models).sort(
        (left, right) => right.ramMB - left.ramMB,
      )[0]
    )?.id || null
  );
}

export async function detectDeviceCapabilities(
  models: Array<Pick<WebLLMModel, 'id' | 'ramMB'>> = [],
): Promise<DeviceCapabilityReport> {
  const currentNavigator =
    typeof navigator === 'undefined' ? null : (navigator as NavigatorWithCapabilities);
  const isMobile = isMobileDevice();
  const hasWorker = typeof Worker !== 'undefined';
  let hasWebGPU = false;
  try {
    const gpu = currentNavigator?.gpu;
    hasWebGPU = Boolean(
      gpu &&
        typeof gpu === 'object' &&
        'requestAdapter' in gpu &&
        typeof gpu.requestAdapter === 'function' &&
        (await gpu.requestAdapter()),
    );
  } catch {
    hasWebGPU = false;
  }
  const deviceMemoryGB = Number.isFinite(currentNavigator?.deviceMemory)
    ? Number(currentNavigator?.deviceMemory)
    : null;
  const hardwareConcurrency = Number.isFinite(currentNavigator?.hardwareConcurrency)
    ? Number(currentNavigator?.hardwareConcurrency)
    : null;
  let storageUsageMB: number | null = null;
  let storageQuotaMB: number | null = null;
  try {
    const estimate = await currentNavigator?.storage?.estimate();
    if (Number.isFinite(estimate?.usage)) storageUsageMB = Number(estimate?.usage) / (1024 * 1024);
    if (Number.isFinite(estimate?.quota)) storageQuotaMB = Number(estimate?.quota) / (1024 * 1024);
  } catch {
    // Storage estimates are optional and can be denied by the browser.
  }

  const tier = getCapabilityTier({
    hasWorker,
    hasWebGPU,
    isMobile,
    deviceMemoryGB,
    hardwareConcurrency,
  });
  const reasons: string[] = [];
  if (!hasWorker) reasons.push('Web Workers are unavailable.');
  if (!hasWebGPU) reasons.push('WebGPU is unavailable in this browser or context.');
  if (isMobile) reasons.push('Mobile device detected; compact models are recommended.');
  if (deviceMemoryGB !== null && deviceMemoryGB <= 4) {
    reasons.push(`The browser reports ${deviceMemoryGB} GB of device memory.`);
  }
  if (storageQuotaMB !== null && storageQuotaMB < 1200) {
    reasons.push('Browser storage quota may be too small for local model downloads.');
  }

  return {
    tier,
    browser: browserName(),
    isMobile,
    hasWorker,
    hasWebGPU,
    deviceMemoryGB,
    hardwareConcurrency,
    storageUsageMB,
    storageQuotaMB,
    recommendedModelId: getRecommendedModelId(tier, models, deviceMemoryGB),
    reasons,
    checkedAt: Date.now(),
  };
}
