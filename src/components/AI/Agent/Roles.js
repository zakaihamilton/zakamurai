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
  'finish',
];

export const REVIEWER_ACTIONS = [
  'list_files',
  'search_workspace',
  'search_semantic',
  'read_file',
  'validate',
  'finish',
];

export const ROLE_KINDS = ['planner', 'coder', 'reviewer', 'custom'];

export const ROLE_KIND_DEFAULTS = {
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
    maxTurns: 20,
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

const newRoleId = (kind) =>
  `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function createRoleNode({
  kind = 'custom',
  id = null,
  label = null,
  modelId = null,
  systemPrompt = null,
  allowedActions = null,
  maxTurns = null,
} = {}) {
  const safeKind = ROLE_KINDS.includes(kind) ? kind : 'custom';
  const defaults = ROLE_KIND_DEFAULTS[safeKind];
  return {
    id: id || newRoleId(safeKind),
    kind: safeKind,
    label: (label && String(label).trim()) || defaults.label,
    modelId: typeof modelId === 'string' && modelId ? modelId : null,
    systemPrompt: typeof systemPrompt === 'string' && systemPrompt.trim() ? systemPrompt : null,
    allowedActions: Array.isArray(allowedActions) && allowedActions.length ? allowedActions : null,
    maxTurns: Number.isFinite(maxTurns) && maxTurns > 0 ? maxTurns : null,
  };
}

export function createDefaultRoleGraph() {
  const planner = createRoleNode({ id: 'planner', kind: 'planner' });
  const coder = createRoleNode({ id: 'coder', kind: 'coder' });
  const reviewer = createRoleNode({ id: 'reviewer', kind: 'reviewer' });
  return {
    entryRoleId: planner.id,
    roles: [planner, coder, reviewer],
    edges: [
      { from: planner.id, to: coder.id, when: 'always' },
      { from: coder.id, to: reviewer.id, when: 'always' },
      { from: reviewer.id, to: coder.id, when: 'reject', maxTimes: 1 },
    ],
  };
}

export function syncLinearAlwaysEdges(graph) {
  const roles = Array.isArray(graph?.roles) ? graph.roles : [];
  const rejectEdges = (graph?.edges || []).filter(
    (edge) => edge && edge.when === 'reject' && roles.some((r) => r.id === edge.from),
  );
  const always = [];
  for (let i = 0; i < roles.length - 1; i++) {
    always.push({ from: roles[i].id, to: roles[i + 1].id, when: 'always' });
  }
  const validReject = rejectEdges
    .filter((edge) => roles.some((r) => r.id === edge.to))
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      when: 'reject',
      maxTimes: Number.isFinite(edge.maxTimes) && edge.maxTimes > 0 ? edge.maxTimes : 1,
    }));
  return {
    entryRoleId: roles[0]?.id || null,
    roles,
    edges: [...always, ...validReject],
  };
}

export function normalizeRoleGraph(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createDefaultRoleGraph();
  }

  const rolesIn = Array.isArray(raw.roles) ? raw.roles : [];
  const roles = rolesIn
    .filter((role) => role && typeof role === 'object')
    .map((role, index) =>
      createRoleNode({
        id: typeof role.id === 'string' && role.id ? role.id : `role-${index}`,
        kind: role.kind,
        label: role.label,
        modelId: role.modelId,
        systemPrompt: role.systemPrompt,
        allowedActions: role.allowedActions,
        maxTurns: role.maxTurns,
      }),
    );

  if (roles.length === 0) return createDefaultRoleGraph();

  // Deduplicate ids
  const seen = new Set();
  for (const role of roles) {
    if (seen.has(role.id)) role.id = newRoleId(role.kind);
    seen.add(role.id);
  }

  const roleIds = new Set(roles.map((role) => role.id));
  const edgesIn = Array.isArray(raw.edges) ? raw.edges : [];
  const edges = edgesIn
    .filter(
      (edge) =>
        edge &&
        typeof edge === 'object' &&
        roleIds.has(edge.from) &&
        roleIds.has(edge.to) &&
        ['always', 'approve', 'reject'].includes(edge.when),
    )
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      when: edge.when,
      ...(edge.when === 'reject'
        ? { maxTimes: Number.isFinite(edge.maxTimes) && edge.maxTimes > 0 ? edge.maxTimes : 1 }
        : {}),
    }));

  const hasAlwaysPath = edges.some((edge) => edge.when === 'always');
  const graph = {
    entryRoleId:
      typeof raw.entryRoleId === 'string' && roleIds.has(raw.entryRoleId)
        ? raw.entryRoleId
        : roles[0].id,
    roles,
    edges,
  };

  // If persisted graph lost always edges, rebuild from role order.
  if (!hasAlwaysPath && roles.length > 1) {
    return syncLinearAlwaysEdges(graph);
  }
  return graph;
}

export function resolveRoleConfig(role) {
  const kind = ROLE_KINDS.includes(role?.kind) ? role.kind : 'custom';
  const defaults = ROLE_KIND_DEFAULTS[kind];
  return {
    id: role.id,
    kind,
    label: role.label || defaults.label,
    modelId: role.modelId || null,
    systemPrompt: role.systemPrompt || defaults.systemPrompt,
    allowedActions: role.allowedActions || defaults.allowedActions,
    maxTurns: role.maxTurns || defaults.maxTurns,
  };
}

export function getRoleById(graph, roleId) {
  return graph?.roles?.find((role) => role.id === roleId) || null;
}

export function findEdge(graph, fromId, when) {
  return (graph?.edges || []).find((edge) => edge.from === fromId && edge.when === when) || null;
}

export function parsePlanSummary(summary) {
  if (typeof summary !== 'string' || !summary.trim()) {
    return { goals: [], files: [], steps: [], raw: summary || '' };
  }
  try {
    const fenced = summary.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] || summary).trim();
    const value = JSON.parse(candidate);
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

export function parseReviewSummary(summary) {
  if (typeof summary !== 'string' || !summary.trim()) {
    return { approved: true, fixes: [], notes: summary || '', raw: summary || '' };
  }
  try {
    const fenced = summary.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] || summary).trim();
    const value = JSON.parse(candidate);
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
    const rejected = /\b(not approved|needs? fixes?|reject)\b/.test(lower);
    return {
      approved: !rejected,
      fixes: rejected ? [summary] : [],
      notes: summary,
      raw: summary,
    };
  }
}

export function formatPlanContext(plan) {
  const goals = plan.goals?.length ? plan.goals.map((g) => `- ${g}`).join('\n') : '- (none listed)';
  const files = plan.files?.length ? plan.files.map((f) => `- ${f}`).join('\n') : '- (none listed)';
  const steps = plan.steps?.length ? plan.steps.map((s) => `- ${s}`).join('\n') : '- (none listed)';
  return `Plan goals:\n${goals}\n\nTarget files:\n${files}\n\nSteps:\n${steps}\n\nRaw plan:\n${plan.raw || ''}`;
}

export function describeRoleGraph(graph) {
  const normalized = normalizeRoleGraph(graph);
  return normalized.roles.map((role) => role.label || role.kind).join(' → ');
}
