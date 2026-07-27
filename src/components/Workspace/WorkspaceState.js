import { createState } from '@/components/state/State';

/** Project-wide metadata that is deliberately separate from editor buffers. */
export const WorkspaceProfileState = createState('WorkspaceProfileState');
export const WorkspaceHealthState = createState('WorkspaceHealthState');
export const ProblemsState = createState('ProblemsState');
export const ChangeSetState = createState('ChangeSetState');

export const DEFAULT_WORKSPACE_PROFILE = {
  include: [],
  exclude: [],
  maxFileBytes: 512 * 1024,
};

export const DEFAULT_WORKSPACE_HEALTH = {
  status: 'idle',
  error: null,
  totalFiles: 0,
  indexedFiles: 0,
  indexedBytes: 0,
  skippedFiles: [],
  lastIndexedAt: null,
};
