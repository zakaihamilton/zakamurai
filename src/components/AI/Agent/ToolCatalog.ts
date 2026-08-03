import type { AgentActionName, ManagerToolName } from '@/components/AI/types';

export type ToolDescriptor<Name extends string = string> = {
  name: Name;
  purpose: string;
};

type EditLoopActionName = Extract<AgentActionName, 'write_file' | 'delete_file' | 'finish'>;

export const MANAGER_TOOL_CATALOG = [
  {
    name: 'list_files',
    purpose: 'List files in the current workspace, optionally filtered by path or extension.',
  },
  {
    name: 'search_workspace',
    purpose: 'Search file contents for text or a regular expression.',
  },
  {
    name: 'search_semantic',
    purpose: 'Find relevant workspace context using a natural-language search.',
  },
  {
    name: 'read_file',
    purpose: 'Read the contents of a workspace file.',
  },
  {
    name: 'validate',
    purpose: 'Validate staged changes with the workspace build pipeline.',
  },
  {
    name: 'list_project_checks',
    purpose: 'Discover eligible checks declared by the project.',
  },
  {
    name: 'run_project_check',
    purpose: 'Run one of the project checks against the staged workspace.',
  },
  {
    name: 'inspect_preview',
    purpose: 'Inspect the compiled preview for runtime and visual evidence.',
  },
] satisfies readonly ToolDescriptor<ManagerToolName>[];

export const EDIT_LOOP_ACTION_CATALOG = [
  {
    name: 'write_file',
    purpose: 'Stage complete replacement content for a workspace file.',
  },
  {
    name: 'delete_file',
    purpose: 'Stage the deletion of an existing workspace file.',
  },
  {
    name: 'finish',
    purpose: 'Complete the edit loop with a concise result summary.',
  },
] satisfies readonly ToolDescriptor<EditLoopActionName>[];
