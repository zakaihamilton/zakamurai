import { AGENT_ROLES, formatPlanContext, parsePlanSummary, parseReviewSummary } from './Roles';
import { runAgent } from './Runner';
import { AgentWorkspace } from './Workspace';

const withRoleEvent = (onEvent, agentRole) => (event) => {
  onEvent({ ...event, agentRole: event.agentRole || agentRole });
};

/**
 * Runs Planner → Coder → Reviewer on a shared workspace.
 * If the Reviewer rejects, the Coder gets one retry, then the Reviewer runs once more.
 */
export async function runCollaborativeAgent({
  request,
  scope = 'file',
  activeFile,
  selectedLines = [],
  files,
  model,
  validate,
  retrieveContext,
  signal,
  onEvent = () => {},
}) {
  const workspace = new AgentWorkspace(files);
  const shared = {
    request,
    scope,
    activeFile,
    selectedLines,
    files,
    model,
    validate,
    retrieveContext,
    signal,
    workspace,
  };

  onEvent({
    type: 'thinking',
    turn: 0,
    agentRole: 'planner',
    message: 'Starting Planner → Coder → Reviewer pipeline',
  });

  const planner = await runAgent({
    ...shared,
    systemPrompt: AGENT_ROLES.planner.systemPrompt,
    allowedActions: AGENT_ROLES.planner.allowedActions,
    maxTurns: AGENT_ROLES.planner.maxTurns,
    agentRole: 'planner',
    onEvent: withRoleEvent(onEvent, 'planner'),
  });
  const plan = parsePlanSummary(planner.summary);
  const planContext = formatPlanContext(plan);

  onEvent({
    type: 'observation',
    turn: 0,
    agentRole: 'planner',
    message: `Plan ready (${plan.steps.length || 0} steps, ${plan.files.length || 0} files).`,
  });

  let coder = await runAgent({
    ...shared,
    priorContext: planContext,
    systemPrompt: AGENT_ROLES.coder.systemPrompt,
    allowedActions: AGENT_ROLES.coder.allowedActions,
    maxTurns: AGENT_ROLES.coder.maxTurns,
    agentRole: 'coder',
    onEvent: withRoleEvent(onEvent, 'coder'),
  });

  let reviewer = await runAgent({
    ...shared,
    priorContext: `${planContext}\n\nCoder summary:\n${coder.summary || ''}`,
    systemPrompt: AGENT_ROLES.reviewer.systemPrompt,
    allowedActions: AGENT_ROLES.reviewer.allowedActions,
    maxTurns: AGENT_ROLES.reviewer.maxTurns,
    agentRole: 'reviewer',
    onEvent: withRoleEvent(onEvent, 'reviewer'),
  });

  let review = parseReviewSummary(reviewer.summary);
  if (!review.approved) {
    const fixContext = [
      planContext,
      `Coder summary:\n${coder.summary || ''}`,
      `Reviewer requested fixes:\n${(review.fixes.length ? review.fixes : [review.notes]).map((f) => `- ${f}`).join('\n')}`,
    ].join('\n\n');

    onEvent({
      type: 'observation',
      turn: 0,
      agentRole: 'reviewer',
      message: 'Reviewer requested fixes — Coder retrying once.',
    });

    coder = await runAgent({
      ...shared,
      priorContext: fixContext,
      systemPrompt: AGENT_ROLES.coder.systemPrompt,
      allowedActions: AGENT_ROLES.coder.allowedActions,
      maxTurns: AGENT_ROLES.coder.maxTurns,
      agentRole: 'coder',
      onEvent: withRoleEvent(onEvent, 'coder'),
    });

    reviewer = await runAgent({
      ...shared,
      priorContext: `${planContext}\n\nCoder summary after fixes:\n${coder.summary || ''}`,
      systemPrompt: AGENT_ROLES.reviewer.systemPrompt,
      allowedActions: AGENT_ROLES.reviewer.allowedActions,
      maxTurns: AGENT_ROLES.reviewer.maxTurns,
      agentRole: 'reviewer',
      onEvent: withRoleEvent(onEvent, 'reviewer'),
    });
    review = parseReviewSummary(reviewer.summary);
  }

  const changes = workspace.changes();
  const summaryParts = [
    plan.raw ? `Plan: ${plan.raw}` : null,
    coder.summary ? `Coder: ${coder.summary}` : null,
    review.notes ? `Reviewer: ${review.notes}` : null,
    review.approved ? 'Review approved.' : 'Review completed with unresolved notes.',
  ].filter(Boolean);

  const summary = summaryParts.join(' ');
  onEvent({
    type: 'finished',
    turn: 0,
    agentRole: 'reviewer',
    changes,
    message: summary,
  });

  return {
    changes,
    files: workspace.files,
    summary,
    plan,
    review,
    events: 'team',
  };
}
