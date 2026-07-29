import { validateProjectPath } from '@/components/AI/ChangeValidator';
import { compilerErrorMessage } from '@/contracts/compiler';
import type { CompilerDiagnostic } from './types';

const LOCATION = /(?:^|\s)([^\s:]+\.(?:[cm]?[jt]sx?|css|json|html)):(\d+)(?::(\d+))?/m;

export function normalizeCompilerDiagnostic(error: unknown): CompilerDiagnostic {
  const message = compilerErrorMessage(error);
  const match = message.match(LOCATION);
  if (!match || validateProjectPath(match[1])) return { message, location: null };
  return {
    message,
    location: { path: match[1], line: Number(match[2]), column: Number(match[3] || 1) },
  };
}
