import { CODER_SYSTEM_PROMPT, PLANNER_SYSTEM_PROMPT, REVIEWER_SYSTEM_PROMPT } from './Protocol';
import { runAgent } from './Runner';
import { AgentWorkspace } from './Workspace';

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

export const AGENT_ROLES = {
  planner: {
    id: 'planner',
    label: 'Planner',
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    allowedActions: PLANNER_ACTIONS,
    maxTurns: 12,
  },
  coder: {
    id: 'coder',
    label: 'Coder',
    systemPrompt: CODER_SYSTEM_PROMPT,
    allowedActions: CODER_ACTIONS,
    maxTurns: 20,
  },
  reviewer: {
    id: 'reviewer',
    label: 'Reviewer',
    systemPrompt: REVIEWER_SYSTEM_PROMPT,
    allowedActions: REVIEWER_ACTIONS,
    maxTurns: 12,
  },
};

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
    // Soft-approve on free-form summaries so weak models still complete the pipeline.
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
