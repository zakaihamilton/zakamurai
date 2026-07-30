/**
 * Coordinates browser-local inference backends that can otherwise retain
 * independent WebGPU sessions at the same time.
 */
let webLLMGpuReserved = false;

export function reserveWebLLMGpuMemory(): void {
  webLLMGpuReserved = true;
}

export function releaseWebLLMGpuMemory(): void {
  webLLMGpuReserved = false;
}

export function isWebLLMGpuMemoryReserved(): boolean {
  return webLLMGpuReserved;
}
