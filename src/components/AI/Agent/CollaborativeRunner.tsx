import type {
  AgentEvent,
  AgentEventHandler,
  RunCollaborativeAgentOptions,
  RunCollaborativeAgentResult,
} from '@/components/AI/types';
import {
  createDefaultRoleGraph,
  describeRoleGraph,
  findEdge,
  formatPlanContext,
  getRoleById,
  isVisualRequest,
  normalizeRoleGraph,
  parsePlanSummary,
  parseReviewSummary,
  resolveRoleConfig,
  validateRoleGraph,
} from './Roles';
import { runAgent } from './Runner';
import { AgentWorkspace } from './Workspace';

const withRoleEvent =
  (onEvent: AgentEventHandler, agentRole: string): AgentEventHandler =>
  (event: AgentEvent) => {
    onEvent({ ...event, agentRole: event.agentRole || agentRole });
  };

const MAX_GRAPH_STEPS = 24;

/**
 * Runs a role graph on a shared workspace.
 * Supports custom role order/kinds, reject→retry edges, and per-role models.
 */
export async function runCollaborativeAgent({
  request,
  scope = 'file',
  activeFile,
  selectedLines = [],
  files,
  model,
  roleGraph = null,
  validate,
  runProjectCheck,
  inspectPreview,
  retrieveContext,
  workspaceIndex = null,
  signal,
  onEvent = () => {},
  priorContext = '',
}: RunCollaborativeAgentOptions): Promise<RunCollaborativeAgentResult> {
  const graph = normalizeRoleGraph(roleGraph || createDefaultRoleGraph());
  const graphValidation = validateRoleGraph(graph);
  if (!graphValidation.valid)
    throw new Error(`Invalid workflow graph: ${graphValidation.errors.join(' ')}`);
  const workspace = new AgentWorkspace(files, workspaceIndex);
  const visualMode = isVisualRequest(request);
  const shared = {
    request,
    scope,
    activeFile,
    selectedLines,
    files,
    validate,
    runProjectCheck,
    inspectPreview,
    retrieveContext,
    workspaceIndex,
    signal,
    workspace,
  };

  onEvent({
    type: 'thinking',
    turn: 0,
    agentRole: graph.entryRoleId,
    message: `Starting team pipeline: ${describeRoleGraph(graph)}`,
  });

  const priorParts = priorContext ? [priorContext] : [];
  if (visualMode) {
    priorParts.push(
      'Visual UI mode: First produce and then follow a compact visual brief covering hierarchy, components, palette, typography, design tokens, responsive behavior, interaction states, and accessibility. Use preview evidence for deterministic review; this text-only model must not claim screenshot-based aesthetic judgment.',
    );
  }
  const roleSummaries: Record<string, string> = {};
  const rejectCounts: Record<string, number> = {};
  let currentRoleId = graph.entryRoleId;
  let plan = null;
  let review = null;
  let lastRoleId = currentRoleId || '';
  let steps = 0;

  while (currentRoleId && steps < MAX_GRAPH_STEPS) {
    steps += 1;
    if (signal?.aborted) throw new DOMException('Agent stopped', 'AbortError');

    const roleNode = getRoleById(graph, currentRoleId);
    if (!roleNode) break;
    const config = resolveRoleConfig(roleNode);
    const roleModel = config.modelId || model;
    lastRoleId = currentRoleId;

    const result = await runAgent({
      ...shared,
      model: roleModel,
      priorContext: priorParts.join('\n\n'),
      systemPrompt: config.systemPrompt,
      allowedActions: config.allowedActions,
      maxTurns: config.maxTurns,
      agentRole: config.id,
      visualMode,
      requirePreviewInspection: visualMode && config.kind === 'reviewer',
      onEvent: withRoleEvent(onEvent, config.id),
    });

    roleSummaries[config.id] = result.summary || '';

    let nextRoleId: string | null = null;

    if (config.kind === 'planner') {
      plan = parsePlanSummary(result.summary);
      priorParts.push(formatPlanContext(plan));
      onEvent({
        type: 'observation',
        turn: 0,
        agentRole: config.id,
        message: `Plan ready (${plan.steps.length || 0} steps, ${plan.files.length || 0} files).`,
      });
      nextRoleId = findEdge(graph, config.id, 'always')?.to || null;
    } else if (config.kind === 'reviewer') {
      review = parseReviewSummary(result.summary);
      if (!review.approved) {
        const rejectEdge = findEdge(graph, config.id, 'reject');
        const key = rejectEdge ? `${rejectEdge.from}->${rejectEdge.to}` : '';
        const used = rejectCounts[key] || 0;
        const maxTimes = rejectEdge?.maxTimes || 1;
        if (rejectEdge && used < maxTimes) {
          rejectCounts[key] = used + 1;
          priorParts.push(
            `Reviewer (${config.label}) requested fixes:\n${(review.fixes.length
              ? review.fixes
              : [review.notes]
            )
              .map((fix: string) => `- ${fix}`)
              .join('\n')}`,
          );
          onEvent({
            type: 'observation',
            turn: 0,
            agentRole: config.id,
            message: `${config.label} requested fixes — retrying ${rejectEdge.to} (${used + 1}/${maxTimes}).`,
          });
          nextRoleId = rejectEdge.to;
        } else {
          priorParts.push(`${config.label} notes: ${review.notes || result.summary || ''}`);
          nextRoleId =
            findEdge(graph, config.id, 'approve')?.to ||
            findEdge(graph, config.id, 'always')?.to ||
            null;
        }
      } else {
        priorParts.push(`${config.label} approved: ${review.notes || 'ok'}`);
        nextRoleId =
          findEdge(graph, config.id, 'approve')?.to ||
          findEdge(graph, config.id, 'always')?.to ||
          null;
      }
    } else {
      priorParts.push(`${config.label} summary:\n${result.summary || ''}`);
      nextRoleId = findEdge(graph, config.id, 'always')?.to || null;
    }

    currentRoleId = nextRoleId;
  }

  if (steps >= MAX_GRAPH_STEPS) {
    throw new Error('Role graph exceeded its step safety limit.');
  }

  const changes = workspace.changes();
  const summaryParts = [
    plan?.raw ? `Plan: ${plan.raw}` : null,
    ...Object.entries(roleSummaries)
      .filter(([id]) => id !== graph.roles.find((r) => r.kind === 'planner')?.id)
      .map(([id, text]) => {
        const role = getRoleById(graph, id);
        return text ? `${role?.label || id}: ${text}` : null;
      }),
    review
      ? review.approved
        ? 'Review approved.'
        : 'Review completed with unresolved notes.'
      : null,
  ].filter(Boolean);

  const summary = summaryParts.join(' ');
  onEvent({
    type: 'finished',
    turn: 0,
    agentRole: lastRoleId,
    changes,
    message: summary,
  });

  return {
    changes,
    files: workspace.files,
    summary,
    plan,
    review,
    roleSummaries,
    roleGraph: graph,
    events: 'team',
  };
}
