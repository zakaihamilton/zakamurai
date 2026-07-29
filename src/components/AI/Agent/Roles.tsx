import type {
  PlanSummary,
  ResolvedRoleConfig,
  ReviewSummary,
  RoleEdge,
  RoleGraph,
  RoleGraphValidation,
  RoleKind,
  RoleNode,
  RoleNodeInput,
} from '@/components/AI/types';
import {
  ALL_AGENT_ACTIONS,
  CODER_SYSTEM_PROMPT,
  CUSTOM_SYSTEM_PROMPT,
  PLANNER_SYSTEM_PROMPT,
  REVIEWER_SYSTEM_PROMPT,
} from './Protocol';

export const PLANNER_ACTIONS = [
  'list_files',
  'search_workspace',
  'search_semantic',
  'read_file',
  'finish',
];

export const CODER_ACTIONS = [
  'list_files',
  'search_workspace',
  'search_semantic',
  'read_file',
  'write_file',
  'delete_file',
  'validate',
  'list_project_checks',
  'run_project_check',
  'inspect_preview',
  'finish',
];

export const REVIEWER_ACTIONS = [
  'list_files',
  'search_workspace',
  'search_semantic',
  'read_file',
  'validate',
  'list_project_checks',
  'run_project_check',
  'inspect_preview',
  'finish',
];

export const ROLE_KINDS: RoleKind[] = ['planner', 'coder', 'reviewer', 'custom'];
export const ROLE_GRAPH_VERSION = 2;
export const EDGE_CONDITIONS = ['always', 'approve', 'reject', 'success', 'failure'] as const;

type RoleKindDefaults = Record<
  RoleKind,
  {
    label: string;
    systemPrompt: string;
    allowedActions: string[];
    maxTurns: number;
  }
>;

export const ROLE_KIND_DEFAULTS: RoleKindDefaults = {
  planner: {
    label: 'Planner',
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    allowedActions: PLANNER_ACTIONS,
    maxTurns: 12,
  },
  coder: {
    label: 'Coder',
    systemPrompt: CODER_SYSTEM_PROMPT,
    allowedActions: CODER_ACTIONS,
    maxTurns: 35,
  },
  reviewer: {
    label: 'Reviewer',
    systemPrompt: REVIEWER_SYSTEM_PROMPT,
    allowedActions: REVIEWER_ACTIONS,
    maxTurns: 12,
  },
  custom: {
    label: 'Custom',
    systemPrompt: CUSTOM_SYSTEM_PROMPT,
    allowedActions: ALL_AGENT_ACTIONS,
    maxTurns: 16,
  },
};

/** @deprecated Prefer ROLE_KIND_DEFAULTS / resolveRoleConfig */
export const AGENT_ROLES = {
  planner: { id: 'planner', ...ROLE_KIND_DEFAULTS.planner },
  coder: { id: 'coder', ...ROLE_KIND_DEFAULTS.coder },
  reviewer: { id: 'reviewer', ...ROLE_KIND_DEFAULTS.reviewer },
};

const newRoleId = (kind: string): string =>
  `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function createRoleNode({
  kind = 'custom',
  id = null,
  label = null,
  modelId = null,
  systemPrompt = null,
  allowedActions = null,
  maxTurns = null,
  join = 'all',
  maxRetries = 0,
}: RoleNodeInput = {}): RoleNode {
  const safeKind = ROLE_KINDS.includes(kind as RoleKind) ? (kind as RoleKind) : 'custom';
  const defaults = ROLE_KIND_DEFAULTS[safeKind];
  return {
    id: id || newRoleId(safeKind),
    kind: safeKind,
    label: (label && String(label).trim()) || defaults.label,
    modelId: typeof modelId === 'string' && modelId ? modelId : null,
    systemPrompt: typeof systemPrompt === 'string' && systemPrompt.trim() ? systemPrompt : null,
    allowedActions: Array.isArray(allowedActions) && allowedActions.length ? allowedActions : null,
    maxTurns: Number.isFinite(maxTurns) && (maxTurns as number) > 0 ? (maxTurns as number) : null,
    join: join === 'any' ? 'any' : 'all',
    maxRetries: Number.isFinite(maxRetries) && maxRetries > 0 ? Math.min(maxRetries, 3) : 0,
  };
}

export function createDefaultRoleGraph(): RoleGraph {
  const planner = createRoleNode({ id: 'planner', kind: 'planner' });
  const coder = createRoleNode({ id: 'coder', kind: 'coder' });
  const reviewer = createRoleNode({ id: 'reviewer', kind: 'reviewer' });
  return {
    version: ROLE_GRAPH_VERSION,
    entryRoleId: planner.id,
    roles: [planner, coder, reviewer],
    edges: [
      { from: planner.id, to: coder.id, when: 'always' },
      { from: coder.id, to: reviewer.id, when: 'always' },
      { from: reviewer.id, to: coder.id, when: 'reject', maxTimes: 1 },
    ],
  };
}

export function syncLinearAlwaysEdges(graph: RoleGraph): RoleGraph {
  const roles = Array.isArray(graph?.roles) ? graph.roles : [];
  const rejectEdges = (graph?.edges || []).filter(
    (edge) => edge && edge.when === 'reject' && roles.some((r) => r.id === edge.from),
  );
  const always: RoleEdge[] = [];
  for (let i = 0; i < roles.length - 1; i++) {
    always.push({ from: roles[i].id, to: roles[i + 1].id, when: 'always' });
  }
  const validReject = rejectEdges
    .filter((edge) => roles.some((r) => r.id === edge.to))
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      when: 'reject' as const,
      maxTimes: Number.isFinite(edge.maxTimes) && (edge.maxTimes as number) > 0 ? edge.maxTimes : 1,
    }));
  return {
    version: ROLE_GRAPH_VERSION,
    entryRoleId: roles[0]?.id || null,
    roles,
    edges: [...always, ...validReject],
  };
}

type RawRoleGraph = {
  version?: number;
  entryRoleId?: string;
  roles?: Array<Partial<RoleNode> | null>;
  edges?: Array<Partial<RoleEdge> | null>;
};

export function normalizeRoleGraph(raw: RawRoleGraph | RoleGraph | null | unknown): RoleGraph {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createDefaultRoleGraph();
  }

  const graph = raw as RawRoleGraph;
  const rolesIn = Array.isArray(graph.roles) ? graph.roles : [];
  const roles = rolesIn
    .filter((role): role is Partial<RoleNode> => Boolean(role) && typeof role === 'object')
    .map((role, index) =>
      createRoleNode({
        id: typeof role.id === 'string' && role.id ? role.id : `role-${index}`,
        kind: role.kind,
        label: role.label,
        modelId: role.modelId,
        systemPrompt: role.systemPrompt,
        allowedActions: role.allowedActions,
        maxTurns: role.maxTurns,
        join: role.join,
        maxRetries: role.maxRetries,
      }),
    );

  if (roles.length === 0) return createDefaultRoleGraph();

  const seen = new Set<string>();
  for (const role of roles) {
    if (seen.has(role.id)) role.id = newRoleId(role.kind);
    seen.add(role.id);
  }

  const roleIds = new Set(roles.map((role) => role.id));
  const edgesIn = Array.isArray(graph.edges) ? graph.edges : [];
  const edges = edgesIn
    .filter((edge): edge is RoleEdge => {
      if (!edge || typeof edge !== 'object') return false;
      return (
        roleIds.has(edge.from || '') &&
        roleIds.has(edge.to || '') &&
        EDGE_CONDITIONS.includes(edge.when as (typeof EDGE_CONDITIONS)[number])
      );
    })
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      when: edge.when,
      ...(edge.when === 'reject'
        ? {
            maxTimes:
              Number.isFinite(edge.maxTimes) && (edge.maxTimes as number) > 0 ? edge.maxTimes : 1,
          }
        : {}),
    }));

  const hasAlwaysPath = edges.some((edge) => edge.when === 'always');
  const normalized: RoleGraph = {
    version: ROLE_GRAPH_VERSION,
    entryRoleId:
      typeof graph.entryRoleId === 'string' && roleIds.has(graph.entryRoleId)
        ? graph.entryRoleId
        : roles[0].id,
    roles,
    edges,
  };

  if (!hasAlwaysPath && roles.length > 1) {
    return syncLinearAlwaysEdges(normalized);
  }
  return normalized;
}

/** Returns user-facing structural errors without rejecting legacy retry edges. */
export function validateRoleGraph(
  graph: RoleGraph | RawRoleGraph | null | unknown,
): RoleGraphValidation {
  const normalized = normalizeRoleGraph(graph);
  const errors: string[] = [];
  const ids = new Set(normalized.roles.map((role) => role.id));
  if (!ids.has(normalized.entryRoleId || '')) errors.push('The workflow entry role is missing.');
  for (const edge of normalized.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) errors.push('Workflow contains an invalid edge.');
  }
  const outgoing = new Map<string, string[]>(normalized.roles.map((role) => [role.id, []]));
  for (const edge of normalized.edges) {
    if (edge.when !== 'reject') outgoing.get(edge.from)?.push(edge.to);
  }
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      errors.push('Workflow contains an unrestricted cycle.');
      return;
    }
    if (seen.has(id)) return;
    seen.add(id);
    visiting.add(id);
    (outgoing.get(id) || []).forEach(visit);
    visiting.delete(id);
  };
  if (normalized.entryRoleId) visit(normalized.entryRoleId);
  if (seen.size !== normalized.roles.length)
    errors.push('Every workflow role must be reachable from the entry role.');
  if (![...outgoing.values()].some((targets) => targets.length === 0))
    errors.push('Workflow needs a terminal role.');
  return { valid: errors.length === 0, errors, graph: normalized };
}

export function resolveRoleConfig(role: RoleNode | Partial<RoleNode>): ResolvedRoleConfig {
  const kind = ROLE_KINDS.includes(role?.kind as RoleKind) ? (role.kind as RoleKind) : 'custom';
  const defaults = ROLE_KIND_DEFAULTS[kind];
  return {
    id: role.id || '',
    kind,
    label: role.label || defaults.label,
    modelId: role.modelId || null,
    systemPrompt: role.systemPrompt || defaults.systemPrompt,
    allowedActions: role.allowedActions || defaults.allowedActions,
    maxTurns: role.maxTurns || defaults.maxTurns,
    join: role.join === 'any' ? 'any' : 'all',
    maxRetries: Number.isFinite(role.maxRetries)
      ? Math.min(Math.max(role.maxRetries as number, 0), 3)
      : 0,
  };
}

export function getRoleById(graph: RoleGraph | null | undefined, roleId: string): RoleNode | null {
  return graph?.roles?.find((role) => role.id === roleId) || null;
}

export function findEdge(
  graph: RoleGraph | null | undefined,
  fromId: string,
  when: RoleEdge['when'],
): RoleEdge | null {
  return (graph?.edges || []).find((edge) => edge.from === fromId && edge.when === when) || null;
}

export function parsePlanSummary(summary: string | null | undefined): PlanSummary {
  if (typeof summary !== 'string' || !summary.trim()) {
    return { goals: [], files: [], steps: [], raw: summary || '' };
  }
  try {
    const fenced = summary.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] || summary).trim();
    const value = JSON.parse(candidate) as {
      goals?: unknown[];
      files?: unknown[];
      steps?: unknown[];
    };
    if (!value || typeof value !== 'object') {
      return { goals: [], files: [], steps: [], raw: summary };
    }
    return {
      goals: Array.isArray(value.goals) ? value.goals.map(String) : [],
      files: Array.isArray(value.files) ? value.files.map(String) : [],
      steps: Array.isArray(value.steps) ? value.steps.map(String) : [],
      raw: summary,
    };
  } catch {
    return { goals: [], files: [], steps: [], raw: summary };
  }
}

export function parseReviewSummary(summary: string | null | undefined): ReviewSummary {
  if (typeof summary !== 'string' || !summary.trim()) {
    return { approved: true, fixes: [], notes: summary || '', raw: summary || '' };
  }
  try {
    const fenced = summary.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] || summary).trim();
    const value = JSON.parse(candidate) as {
      approved?: boolean;
      fixes?: unknown[];
      notes?: string;
    };
    if (!value || typeof value !== 'object') {
      return { approved: true, fixes: [], notes: summary, raw: summary };
    }
    return {
      approved: value.approved !== false,
      fixes: Array.isArray(value.fixes) ? value.fixes.map(String) : [],
      notes: typeof value.notes === 'string' ? value.notes : summary,
      raw: summary,
    };
  } catch {
    const lower = summary.toLowerCase();
    const rejected =
      /\b(not approved|needs? fixes?|reject|monolithic|missing css module|lacks css module|split into sub-components)\b/.test(
        lower,
      );
    return {
      approved: !rejected,
      fixes: rejected ? [summary] : [],
      notes: summary,
      raw: summary,
    };
  }
}

export function formatPlanContext(plan: PlanSummary): string {
  const goals = plan.goals?.length ? plan.goals.map((g) => `- ${g}`).join('\n') : '- (none listed)';
  const files = plan.files?.length ? plan.files.map((f) => `- ${f}`).join('\n') : '- (none listed)';
  const steps = plan.steps?.length ? plan.steps.map((s) => `- ${s}`).join('\n') : '- (none listed)';
  return `Plan goals:\n${goals}\n\nTarget files:\n${files}\n\nSteps:\n${steps}\n\nRaw plan:\n${plan.raw || ''}`;
}

export function describeRoleGraph(graph: RoleGraph): string {
  const normalized = normalizeRoleGraph(graph);
  return normalized.roles.map((role) => role.label || role.kind).join(' → ');
}
