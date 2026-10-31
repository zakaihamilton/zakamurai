export type LocalAIBenchmarkCliOptions = {
  modelId?: string;
  caseId?: string;
  help: boolean;
};

export function parseLocalAIBenchmarkArgs(argv: string[]): LocalAIBenchmarkCliOptions {
  const options: LocalAIBenchmarkCliOptions = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--model' || argument === '--case') {
      const value = argv[index + 1]?.trim();
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      if (argument === '--model') options.modelId = value;
      else options.caseId = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export const LOCAL_AI_BENCHMARK_USAGE = `Usage: pnpm run ai:bench -- [options]

Options:
  --model <model-id>  Use a local WebLLM model (defaults to the recommended model)
  --case <case-id>    Run one case: todo, dashboard, or landing
  --help              Show this help`;
