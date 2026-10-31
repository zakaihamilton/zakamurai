import { describe, expect, it } from 'vitest';
import {
  LOCAL_AI_BENCHMARK_CHROMIUM_CHANNEL,
  getLocalAIBenchmarkChromiumArgs,
  getLocalAIBenchmarkDevServerEnv,
} from '../../scripts/ai-bench-browser';

describe('local AI benchmark browser setup', () => {
  it('uses full Chromium new headless instead of the limited headless shell', () => {
    expect(LOCAL_AI_BENCHMARK_CHROMIUM_CHANNEL).toBe('chromium');
  });

  it('uses the native WebGPU backend on macOS', () => {
    const args = getLocalAIBenchmarkChromiumArgs('darwin');

    expect(args).toContain('--enable-unsafe-webgpu');
    expect(args).toContain('--ignore-gpu-blocklist');
    expect(args).not.toContain('--use-vulkan');
    expect(args).not.toContain('--use-angle=vulkan');
    expect(args).not.toContain('--enable-features=Vulkan');
  });

  it('uses the documented Vulkan setup for headless Linux WebGPU', () => {
    expect(getLocalAIBenchmarkChromiumArgs('linux')).toEqual([
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--use-angle=vulkan',
      '--enable-features=Vulkan',
      '--disable-vulkan-surface',
    ]);
  });

  it('enables polling for the temporary macOS dev server to avoid watcher exhaustion', () => {
    expect(getLocalAIBenchmarkDevServerEnv({}, 'darwin')).toEqual({
      WATCHPACK_POLLING: 'true',
    });
    expect(getLocalAIBenchmarkDevServerEnv({ WATCHPACK_POLLING: 'false' }, 'darwin')).toEqual({
      WATCHPACK_POLLING: 'false',
    });
    expect(getLocalAIBenchmarkDevServerEnv({}, 'linux')).toEqual({});
  });
});
