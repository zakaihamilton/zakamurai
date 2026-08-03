import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { WebLLMState } from '@/components/AI/WebLLMState';
import { detectDeviceCapabilities } from '@/contracts/capabilities';
import { useCallback, useEffect, useState } from 'react';

export function useDeviceCapabilities({ enabled = true }: { enabled?: boolean } = {}) {
  const webLLMState = WebLLMState.useState(['capabilityReport']);
  const capabilityReport = webLLMState?.capabilityReport ?? null;
  const [isChecking, setIsChecking] = useState(false);

  const refreshCapabilities = useCallback(async () => {
    setIsChecking(true);
    try {
      const report = await detectDeviceCapabilities(WEB_LLM_MODELS);
      if (typeof webLLMState === 'function') {
        webLLMState((draft) => {
          draft.capabilityReport = report;
        });
      }
      return report;
    } finally {
      setIsChecking(false);
    }
  }, [webLLMState]);

  useEffect(() => {
    if (enabled && !capabilityReport) void refreshCapabilities();
  }, [capabilityReport, enabled, refreshCapabilities]);

  return { capabilityReport, isChecking, refreshCapabilities };
}
