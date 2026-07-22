import { describe, expect, it } from 'vitest';
import {
  createDefaultRoleGraph,
  createRoleNode,
  describeRoleGraph,
  normalizeRoleGraph,
  resolveRoleConfig,
  syncLinearAlwaysEdges,
} from './Roles';

describe('role graphs', () => {
  it('creates the default planner → coder → reviewer graph', () => {
    const graph = createDefaultRoleGraph();
    expect(describeRoleGraph(graph)).toBe('Planner → Coder → Reviewer');
    expect(graph.edges.some((edge) => edge.when === 'reject')).toBe(true);
  });

  it('normalizes incomplete graphs and rebuilds always edges', () => {
    const normalized = normalizeRoleGraph({
      roles: [
        { id: 'a', kind: 'planner', label: 'A' },
        { id: 'b', kind: 'coder', label: 'B', modelId: 'model-b' },
      ],
      edges: [],
    });
    expect(normalized.entryRoleId).toBe('a');
    expect(normalized.edges).toEqual([{ from: 'a', to: 'b', when: 'always' }]);
    expect(resolveRoleConfig(normalized.roles[1]).modelId).toBe('model-b');
  });

  it('supports custom roles with prompt overrides', () => {
    const role = createRoleNode({
      kind: 'custom',
      label: 'Security',
      systemPrompt: 'Focus on XSS.',
      modelId: 'secure-model',
    });
    const config = resolveRoleConfig(role);
    expect(config.systemPrompt).toContain('XSS');
    expect(config.modelId).toBe('secure-model');
    expect(config.allowedActions).toContain('write_file');
  });

  it('syncs linear order after reordering', () => {
    const graph = createDefaultRoleGraph();
    const reordered = syncLinearAlwaysEdges({
      ...graph,
      roles: [graph.roles[1], graph.roles[0], graph.roles[2]],
    });
    expect(reordered.entryRoleId).toBe('coder');
    expect(reordered.edges.filter((edge) => edge.when === 'always')).toEqual([
      { from: 'coder', to: 'planner', when: 'always' },
      { from: 'planner', to: 'reviewer', when: 'always' },
    ]);
  });
});
