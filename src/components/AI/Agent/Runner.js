import { AGENT_SYSTEM_PROMPT, parseAgentAction } from './Protocol';
import { AgentWorkspace } from './Workspace';

const observation = (action, ok, data) =>
  JSON.stringify({ tool: action, ok, ...(ok ? { result: data } : { error: data }) });

const loadAskWebLLM = async () => {
  const { askWebLLM } = await import('../WebLLMAPI');
  return askWebLLM;
};

export async function runAgent({
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
  maxTurns = 20,
}) {
  const askWebLLM = await loadAskWebLLM();
  const workspace = new AgentWorkspace(files);
  const messages = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        scope === 'project'
          ? `Request: ${request}\nScope: whole project\nStart by inspecting the entire workspace. Do not assume any file is the primary target.`
          : `Request: ${request}\nScope: current file\nActive file: ${activeFile || 'none'}\nSelected lines: ${selectedLines.join(', ') || 'none'}\nStart by inspecting the workspace.`,
    },
  ];
  let protocolFailures = 0;
  let lastFingerprint = '';
  let repeatedActions = 0;

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (signal?.aborted) throw new DOMException('Agent stopped', 'AbortError');
    onEvent({ type: 'thinking', turn, message: `Planning step ${turn}` });
    const reply = await askWebLLM('', '', null, {
      model,
      messages,
      temperature: 0.15,
      top_p: 0.8,
      max_tokens: 1800,
    });
    messages.push({ role: 'assistant', content: reply });

    let action;
    try {
      action = parseAgentAction(reply);
      protocolFailures = 0;
    } catch (error) {
      protocolFailures++;
      if (protocolFailures >= 2)
        throw new Error(`Local model could not follow the agent protocol: ${error.message}`);
      messages.push({
        role: 'user',
        content: observation(
          'protocol',
          false,
          `${error.message}. Return exactly one valid JSON action.`,
        ),
      });
      continue;
    }

    const fingerprint = JSON.stringify(action);
    repeatedActions = fingerprint === lastFingerprint ? repeatedActions + 1 : 0;
    lastFingerprint = fingerprint;
    if (repeatedActions >= 2)
      throw new Error('Agent stopped after repeating the same action without progress.');
    onEvent({ type: 'tool', turn, action });

    try {
      let result;
      if (action.action === 'list_files') result = workspace.list(action.query).join('\n');
      if (action.action === 'search_workspace')
        result = workspace.search(action.query, action.glob);
      if (action.action === 'search_semantic')
        result = await workspace.semanticSearch(action.query, retrieveContext, action.k);
      if (action.action === 'read_file') result = workspace.read(action.path);
      if (action.action === 'write_file') {
        workspace.write(action.path, action.content);
        result = `Staged ${action.path} (${action.content.length} characters).`;
      }
      if (action.action === 'delete_file') {
        workspace.delete(action.path);
        result = `Staged deletion of ${action.path}.`;
      }
      if (action.action === 'validate') {
        result = validate
          ? await validate(workspace.files)
          : 'Validation is unavailable; inspect changes carefully.';
      }
      if (action.action === 'finish') {
        const changes = workspace.changes();
        onEvent({ type: 'finished', turn, changes, message: action.summary });
        return { changes, files: workspace.files, summary: action.summary, events: turn };
      }
      messages.push({ role: 'user', content: observation(action.action, true, result) });
      onEvent({
        type: 'observation',
        turn,
        action: action.action,
        message: String(result).slice(0, 500),
      });
    } catch (error) {
      messages.push({ role: 'user', content: observation(action.action, false, error.message) });
      onEvent({
        type: 'observation',
        turn,
        action: action.action,
        error: true,
        message: error.message,
      });
    }
  }
  throw new Error(`Agent reached its ${maxTurns}-step safety limit.`);
}
