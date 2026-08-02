import type {
  FileMap,
  ManagerModelCall,
  ManagerModelClient,
  SemanticSearchResult,
  VerificationResult,
} from '@/components/AI/types';

export type FakeToolCall = {
  tool: 'validate' | 'run_project_check' | 'inspect_preview' | 'retrieve_context';
  input: string | Record<string, unknown>;
  files?: FileMap;
};

export type FakeManagerModel = {
  calls: ManagerModelCall[];
  client: ManagerModelClient;
};

export type FakeManagerTools = {
  calls: FakeToolCall[];
  validate: (files: FileMap) => Promise<VerificationResult | string>;
  runProjectCheck: (check: string, files: FileMap) => Promise<string>;
  inspectPreview: (files: FileMap) => Promise<unknown>;
  retrieveContext: (query: string, k: number) => Promise<SemanticSearchResult[]>;
};

export function createFakeModel(responses: string[]): FakeManagerModel {
  const queue = [...responses];
  const calls: ManagerModelCall[] = [];
  return {
    calls,
    client: async (call) => {
      calls.push(call);
      const response = queue.shift();
      if (response === undefined) throw new Error('Fake model response queue exhausted.');
      return response;
    },
  };
}

export function createFakeTools(options?: {
  validation?: Array<VerificationResult | string>;
  projectChecks?: Record<string, string>;
  previews?: unknown[];
  semanticResults?: SemanticSearchResult[];
}): FakeManagerTools {
  const validation = [...(options?.validation || [{ status: 'passed', check: 'fake' }])];
  const previews = [...(options?.previews || [{ status: 'passed', title: 'Fake preview' }])];
  const calls: FakeToolCall[] = [];
  return {
    calls,
    validate: async (files) => {
      calls.push({ tool: 'validate', input: {}, files: { ...files } });
      return validation.shift() || { status: 'passed', check: 'fake' };
    },
    runProjectCheck: async (check, files) => {
      calls.push({ tool: 'run_project_check', input: { check }, files: { ...files } });
      return options?.projectChecks?.[check] || '';
    },
    inspectPreview: async (files) => {
      calls.push({ tool: 'inspect_preview', input: {}, files: { ...files } });
      return previews.shift() || { status: 'passed', title: 'Fake preview' };
    },
    retrieveContext: async (query, k) => {
      calls.push({ tool: 'retrieve_context', input: { query, k } });
      return (options?.semanticResults || []).slice(0, k);
    },
  };
}
