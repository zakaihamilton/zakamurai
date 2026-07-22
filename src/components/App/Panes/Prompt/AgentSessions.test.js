import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_AGENT_SESSIONS,
  addAgentSession,
  appendSessionMessage,
  createDefaultAgentSessions,
  createSessionMessage,
  deleteAgentSession,
  getActiveAgentSession,
  listAgentSessions,
  normalizeAgentSessions,
  renameAgentSession,
  serializeAgentSessions,
  setActiveAgentSession,
} from './AgentSessions';

describe('AgentSessions', () => {
  it('creates a default session store', () => {
    const state = createDefaultAgentSessions('model-a');
    const sessions = listAgentSessions(state.sessions);
    expect(sessions).toHaveLength(1);
    expect(state.activeSessionId).toBe(sessions[0].id);
    expect(sessions[0].mode).toBe('single');
    expect(getActiveAgentSession(state).modelId).toBe('model-a');
  });

  it('adds, renames, switches, and deletes sessions', () => {
    let state = createDefaultAgentSessions();
    const firstId = state.activeSessionId;
    state = addAgentSession(state, { name: 'Research', mode: 'team' });
    expect(listAgentSessions(state.sessions)).toHaveLength(2);
    expect(state.activeSessionId).not.toBe(firstId);
    expect(getActiveAgentSession(state).mode).toBe('team');
    expect(getActiveAgentSession(state).roleGraph.roles).toHaveLength(3);

    state = renameAgentSession(state, state.activeSessionId, '  Research Ops  ');
    expect(getActiveAgentSession(state).name).toBe('Research Ops');

    state = setActiveAgentSession(state, firstId);
    expect(state.activeSessionId).toBe(firstId);

    state = deleteAgentSession(state, firstId);
    expect(listAgentSessions(state.sessions)).toHaveLength(1);
    expect(getActiveAgentSession(state).name).toBe('Research Ops');
  });

  it('caps message history and enforces max sessions', () => {
    let state = createDefaultAgentSessions();
    const id = state.activeSessionId;
    for (let i = 0; i < 45; i++) {
      state = appendSessionMessage(
        state,
        id,
        createSessionMessage({ role: 'user', text: `msg-${i}` }),
      );
    }
    expect(getActiveAgentSession(state).messages).toHaveLength(40);
    expect(getActiveAgentSession(state).messages[0].text).toBe('msg-5');

    for (let i = 1; i < MAX_AGENT_SESSIONS; i++) {
      state = addAgentSession(state, { name: `Agent ${i + 1}` });
    }
    expect(() => addAgentSession(state)).toThrow(/Maximum/);
  });

  it('normalizes and serializes persisted payloads', () => {
    const raw = {
      activeSessionId: 'missing',
      sessions: {
        a: {
          id: 'a',
          name: 'A',
          createdAt: 1,
          updatedAt: 2,
          mode: 'team',
          messages: [{ id: 1, role: 'user', text: 'hi', timestamp: '12:00:00' }],
          reasoning: 'plan',
          status: 'running',
          roleGraph: {
            roles: [{ id: 'p', kind: 'planner', label: 'Plan', modelId: 'm1' }],
            edges: [],
          },
        },
      },
    };
    const normalized = normalizeAgentSessions(raw);
    expect(normalized.activeSessionId).toBe('a');
    expect(normalized.sessions.a.status).toBe('idle');
    expect(normalized.sessions.a.roleGraph.roles[0].modelId).toBe('m1');
    const serialized = serializeAgentSessions(normalized);
    expect(serialized.sessions.a.messages).toHaveLength(1);
    expect(serialized.sessions.a.status).toBeUndefined();
    expect(serialized.sessions.a.roleGraph.roles[0].id).toBe('p');
  });
});
