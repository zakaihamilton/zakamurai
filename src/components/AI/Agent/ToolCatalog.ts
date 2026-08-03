import type { AgentActionName, ManagerToolName } from '@/components/AI/types';

export type ToolDescriptor<Name extends string = string> = {
  name: Name;
  purpose: string;
};

type EditLoopActionName = Extract<
  AgentActionName,
  'write_file' | 'replace_file_content' | 'delete_file' | 'finish'
>;

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
  {
    name: 'inspect_console_logs',
    purpose:
      'Query runtime console logs and uncaught exception traces filtered by level or search keyword.',
  },
  {
    name: 'get_file_symbols',
    purpose:
      'Extract symbol definitions (functions, components, types) and import dependencies for a file.',
  },
  {
    name: 'manage_packages',
    purpose:
      'List, add, or remove package dependencies in package.json for the browser environment.',
  },
] satisfies readonly ToolDescriptor<ManagerToolName>[];

export const EDIT_LOOP_ACTION_CATALOG = [
  {
    name: 'write_file',
    purpose: 'Stage complete replacement content for a workspace file.',
  },
  {
    name: 'replace_file_content',
    purpose: 'Stage targeted search-and-replace edits to specific lines within a workspace file.',
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
