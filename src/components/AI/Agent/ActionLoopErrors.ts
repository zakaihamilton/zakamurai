import type { AgentChange } from '@/components/AI/types';

export class AgentExecutionError extends Error {
  changes: AgentChange[];

  constructor(message: string, changes: AgentChange[]) {
    super(message);
    this.name = 'AgentExecutionError';
    this.changes = changes;
  }
}

export class AgentRecoveryValidationError extends AgentExecutionError {}
