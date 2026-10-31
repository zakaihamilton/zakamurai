export const LOCAL_AI_BENCHMARK_CHROMIUM_CHANNEL = 'chromium' as const;

export function getLocalAIBenchmarkChromiumArgs(platform: NodeJS.Platform): string[] {
  const args = ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
  if (platform !== 'linux') return args;

  return [...args, '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface'];
}

export function getLocalAIBenchmarkDevServerEnv(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): NodeJS.ProcessEnv;
export function getLocalAIBenchmarkDevServerEnv(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
): Record<string, string | undefined>;
export function getLocalAIBenchmarkDevServerEnv(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
): Record<string, string | undefined> {
  if (platform !== 'darwin' || env.WATCHPACK_POLLING !== undefined) return env;
  return { ...env, WATCHPACK_POLLING: 'true' };
}
