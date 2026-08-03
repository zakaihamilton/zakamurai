import { describe, expect, it } from 'vitest';
import { ALL_AGENT_ACTIONS } from './Protocol';
import { EDIT_LOOP_ACTION_CATALOG, MANAGER_TOOL_CATALOG } from './ToolCatalog';

describe('tool catalog', () => {
  it('documents every action supported by the edit loop exactly once', () => {
    const documented = [...MANAGER_TOOL_CATALOG, ...EDIT_LOOP_ACTION_CATALOG].map(
      (tool) => tool.name,
    );

    expect(new Set(documented)).toEqual(new Set(ALL_AGENT_ACTIONS));
    expect(documented).toHaveLength(ALL_AGENT_ACTIONS.length);
  });

  it('provides a purpose for every documented tool', () => {
    for (const tool of [...MANAGER_TOOL_CATALOG, ...EDIT_LOOP_ACTION_CATALOG]) {
      expect(tool.purpose.trim()).not.toBe('');
    }
  });
});
