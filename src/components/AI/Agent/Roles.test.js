import { describe, expect, it } from 'vitest';
import {
  createDefaultRoleGraph,
  createRoleNode,
  describeRoleGraph,
  findEdge,
  formatPlanContext,
  getRoleById,
  normalizeRoleGraph,
  parsePlanSummary,
  parseReviewSummary,
  resolveRoleConfig,
  syncLinearAlwaysEdges,
  validateRoleGraph,
} from './Roles';

describe('role graphs', () => {
  it('creates the default planner → coder → reviewer graph', () => {
    const graph = createDefaultRoleGraph();
    expect(describeRoleGraph(graph)).toBe('Planner → Coder → Reviewer');
    expect(graph.edges.some((edge) => edge.when === 'reject')).toBe(true);
    expect(findEdge(graph, 'reviewer', 'reject')?.to).toBe('coder');
    expect(getRoleById(graph, 'coder')?.kind).toBe('coder');
    expect(getRoleById(graph, 'missing')).toBeNull();
  });

  it('normalizes incomplete graphs and rebuilds always edges', () => {
    expect(normalizeRoleGraph(null).roles).toHaveLength(3);
    expect(normalizeRoleGraph([]).roles).toHaveLength(3);
    expect(normalizeRoleGraph({ roles: [] }).roles).toHaveLength(3);

    const normalized = normalizeRoleGraph({
      roles: [
        { id: 'a', kind: 'planner', label: 'A' },
        { kind: 'coder', label: 'B', modelId: 'model-b' },
        null,
        { id: 'a', kind: 'reviewer', label: 'Dup' },
      ],
      edges: [
        { from: 'a', to: 'missing', when: 'always' },
        { from: 'a', to: 'a', when: 'reject', maxTimes: 0 },
      ],
      entryRoleId: 'missing',
    });
    expect(normalized.roles.length).toBeGreaterThanOrEqual(2);
    expect(normalized.entryRoleId).toBe(normalized.roles[0].id);
    expect(resolveRoleConfig(normalized.roles[1]).modelId).toBeTruthy();
  });

  it('keeps explicit always edges when present', () => {
    const graph = normalizeRoleGraph({
      entryRoleId: 'r2',
      roles: [
        { id: 'r1', kind: 'planner', label: 'One' },
        { id: 'r2', kind: 'coder', label: 'Two' },
      ],
      edges: [{ from: 'r2', to: 'r1', when: 'always' }],
    });
    expect(graph.entryRoleId).toBe('r2');
    expect(graph.edges).toEqual([{ from: 'r2', to: 'r1', when: 'always' }]);
  });

  it('supports custom roles with prompt overrides', () => {
    const role = createRoleNode({
      kind: 'custom',
      label: 'Security',
      systemPrompt: 'Focus on XSS.',
      modelId: 'secure-model',
      allowedActions: ['read_file', 'finish'],
      maxTurns: 8,
    });
    const config = resolveRoleConfig(role);
    expect(config.systemPrompt).toContain('XSS');
    expect(config.modelId).toBe('secure-model');
    expect(config.allowedActions).toEqual(['read_file', 'finish']);
    expect(config.maxTurns).toBe(8);

    expect(resolveRoleConfig({ id: 'x', kind: 'nope' }).kind).toBe('custom');
    expect(createRoleNode({ kind: 'weird' }).kind).toBe('custom');

    expect(
      createRoleNode({
        id: 'edge-cases',
        label: '   ',
        modelId: '',
        systemPrompt: '  ',
        allowedActions: [],
        maxTurns: 0,
        join: 'any',
        maxRetries: 99,
      }),
    ).toMatchObject({
      label: 'Custom',
      modelId: null,
      systemPrompt: null,
      allowedActions: null,
      maxTurns: null,
      join: 'any',
      maxRetries: 3,
    });
  });

  it('syncs linear order after reordering and drops invalid reject edges', () => {
    const graph = createDefaultRoleGraph();
    const reordered = syncLinearAlwaysEdges({
      ...graph,
      roles: [graph.roles[1], graph.roles[0], graph.roles[2]],
      edges: [...graph.edges, { from: 'reviewer', to: 'gone', when: 'reject', maxTimes: 2 }],
    });
    expect(reordered.entryRoleId).toBe('coder');
    expect(reordered.edges.filter((edge) => edge.when === 'always')).toEqual([
      { from: 'coder', to: 'planner', when: 'always' },
      { from: 'planner', to: 'reviewer', when: 'always' },
    ]);
    expect(reordered.edges.some((edge) => edge.to === 'gone')).toBe(false);

    expect(
      syncLinearAlwaysEdges({
        roles: [{ id: 'solo', kind: 'custom' }],
        edges: [null, { from: 'solo', to: 'solo', when: 'reject', maxTimes: 0 }],
      }),
    ).toMatchObject({
      entryRoleId: 'solo',
      edges: [{ from: 'solo', to: 'solo', when: 'reject', maxTimes: 1 }],
    });
    expect(syncLinearAlwaysEdges({ roles: null })).toMatchObject({
      entryRoleId: null,
      roles: [],
      edges: [],
    });
  });

  it('validates role graph structure', () => {
    const defaultGraph = createDefaultRoleGraph();
    expect(validateRoleGraph(defaultGraph)).toEqual({
      valid: true,
      errors: [],
      graph: expect.any(Object),
    });

    const cyclicGraph = {
      entryRoleId: 'a',
      roles: [
        { id: 'a', kind: 'planner' },
        { id: 'b', kind: 'coder' },
      ],
      edges: [
        { from: 'a', to: 'b', when: 'always' },
        { from: 'b', to: 'a', when: 'always' },
      ],
    };
    expect(validateRoleGraph(cyclicGraph).valid).toBe(false);
    expect(validateRoleGraph(cyclicGraph).errors).toContain(
      'Workflow contains an unrestricted cycle.',
    );

    const disconnectedGraph = {
      entryRoleId: 'a',
      roles: [
        { id: 'a', kind: 'planner' },
        { id: 'b', kind: 'coder' },
        { id: 'c', kind: 'reviewer' },
      ],
      edges: [{ from: 'a', to: 'b', when: 'always' }],
    };
    expect(validateRoleGraph(disconnectedGraph).errors).toContain(
      'Every workflow role must be reachable from the entry role.',
    );

    const noTerminal = {
      entryRoleId: 'a',
      roles: [
        { id: 'a', kind: 'planner' },
        { id: 'b', kind: 'coder' },
      ],
      edges: [
        { from: 'a', to: 'b', when: 'always' },
        { from: 'b', to: 'a', when: 'always' },
      ],
    };
    expect(validateRoleGraph(noTerminal).errors.length).toBeGreaterThan(0);
    expect(findEdge(null, 'a', 'always')).toBeNull();
    expect(getRoleById(null, 'a')).toBeNull();
    expect(formatPlanContext({ goals: ['g'], files: [], steps: ['s'], raw: 'raw' })).toContain(
      'Plan goals',
    );
    expect(formatPlanContext({})).toContain('(none listed)');
    expect(resolveRoleConfig({ id: 'x', kind: 'coder', join: 'any', maxRetries: -1 }).join).toBe(
      'any',
    );
  });
});

describe('summary parsers', () => {
  it('handles empty, invalid, fenced, and free-form summaries', () => {
    expect(parsePlanSummary('')).toMatchObject({ goals: [], raw: '' });
    expect(parsePlanSummary('not json')).toMatchObject({ goals: [] });
    expect(parsePlanSummary('```json\n{"goals":["g"],"files":[],"steps":[]}\n```').goals).toEqual([
      'g',
    ]);
    expect(parsePlanSummary('null')).toMatchObject({ goals: [] });

    expect(parseReviewSummary('')).toMatchObject({ approved: true });
    expect(parseReviewSummary('null')).toMatchObject({ approved: true });
    expect(parseReviewSummary('```json\n{"approved":true,"notes":"ok"}\n```').notes).toBe('ok');
    expect(parseReviewSummary('{"approved":false,"fixes":null,"notes":1}')).toMatchObject({
      approved: false,
      fixes: [],
    });
    expect(parseReviewSummary('needs fixes on auth')).toMatchObject({ approved: false });
    expect(parseReviewSummary('Looks good')).toMatchObject({ approved: true });
  });
});
