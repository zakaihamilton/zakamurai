import { describe, expect, it } from 'vitest';
import {
  MAX_AGENT_SESSIONS,
  addAgentSession,
  appendSessionMessage,
  createAgentBranch,
  createDefaultAgentSessions,
  createSessionMessage,
  deleteAgentSession,
  formatSessionContext,
  getActiveAgentSession,
  getAgentSessionSubtreeIds,
  listAgentSessionTree,
  listAgentSessions,
  normalizeAgentSessions,
  renameAgentSession,
  serializeAgentSessions,
  setActiveAgentSession,
  updateAgentSession,
} from './AgentSessions';

describe('AgentSessions', () => {
  it('creates a default session store', () => {
    const state = createDefaultAgentSessions('model-a');
    const sessions = listAgentSessions(state.sessions);
    expect(sessions).toHaveLength(1);
    expect(state.activeSessionId).toBe(sessions[0].id);
    expect(sessions[0].mode).toBe('single');
    expect(sessions[0].parentId).toBeNull();
    expect(getActiveAgentSession(state).modelId).toBe('model-a');
    expect(getActiveAgentSession(state).roleGraph.roles).toHaveLength(3);
  });

  it('returns null for missing active sessions', () => {
    expect(getActiveAgentSession(null)).toBeNull();
    expect(getActiveAgentSession({ sessions: {}, activeSessionId: 'x' })).toBeNull();
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
    state = renameAgentSession(state, state.activeSessionId, '   ');
    expect(getActiveAgentSession(state).name).toBe('Research Ops');

    state = setActiveAgentSession(state, firstId);
    expect(state.activeSessionId).toBe(firstId);

    const secondId = listAgentSessions(state.sessions).find((s) => s.id !== firstId).id;
    state = deleteAgentSession(state, firstId);
    expect(listAgentSessions(state.sessions)).toHaveLength(1);
    expect(getActiveAgentSession(state).id).toBe(secondId);

    // Deleting a non-active session keeps the active id
    state = addAgentSession(state, { name: 'Extra' });
    const active = state.activeSessionId;
    const other = listAgentSessions(state.sessions).find((s) => s.id !== active).id;
    state = deleteAgentSession(state, other);
    expect(state.activeSessionId).toBe(active);
  });

  it('recreates a default session when the last one is deleted', () => {
    let state = createDefaultAgentSessions('keep-model');
    const onlyId = state.activeSessionId;
    state = deleteAgentSession(state, onlyId);
    expect(listAgentSessions(state.sessions)).toHaveLength(1);
    expect(getActiveAgentSession(state).modelId).toBe('keep-model');
    expect(getActiveAgentSession(state).id).not.toBe(onlyId);
  });

  it('branches a conversation with isolated copied history and configuration', () => {
    let state = createDefaultAgentSessions('model-a');
    const parentId = state.activeSessionId;
    state = updateAgentSession(state, parentId, {
      mode: 'team',
      messages: [
        createSessionMessage({ role: 'user', text: 'Plan an onboarding flow.' }),
        createSessionMessage({ role: 'ai', text: 'I will inspect the app first.' }),
      ],
    });

    state = createAgentBranch(state, parentId);
    const child = getActiveAgentSession(state);
    expect(child.parentId).toBe(parentId);
    expect(child.name).toBe('Agent 1 branch');
    expect(child.mode).toBe('team');
    expect(child.messages).toEqual(state.sessions[parentId].messages);

    state = appendSessionMessage(
      state,
      child.id,
      createSessionMessage({ role: 'user', text: 'Instead, focus on accessibility.' }),
    );
    expect(state.sessions[parentId].messages).toHaveLength(2);
    expect(getAgentSessionSubtreeIds(state.sessions, parentId)).toEqual(
      new Set([parentId, child.id]),
    );
    expect(listAgentSessionTree(state.sessions).map(({ depth }) => depth)).toEqual([0, 1]);
  });

  it('deletes an entire branch and selects its surviving parent', () => {
    let state = createDefaultAgentSessions();
    const rootId = state.activeSessionId;
    state = createAgentBranch(state, rootId);
    const branchId = state.activeSessionId;
    state = createAgentBranch(state, branchId);
    const leafId = state.activeSessionId;

    state = deleteAgentSession(state, branchId);
    expect(state.sessions[branchId]).toBeUndefined();
    expect(state.sessions[leafId]).toBeUndefined();
    expect(state.activeSessionId).toBe(rootId);
  });

  it('repairs legacy and invalid parent links while persisting valid branches', () => {
    const normalized = normalizeAgentSessions({
      activeSessionId: 'child',
      sessions: {
        root: { id: 'root', name: 'Root', createdAt: 1 },
        child: { id: 'child', name: 'Child', parentId: 'root', createdAt: 2 },
        orphan: { id: 'orphan', name: 'Orphan', parentId: 'missing', createdAt: 3 },
        a: { id: 'a', name: 'A', parentId: 'b', createdAt: 4 },
        b: { id: 'b', name: 'B', parentId: 'a', createdAt: 5 },
      },
    });
    expect(normalized.sessions.child.parentId).toBe('root');
    expect(normalized.sessions.orphan.parentId).toBeNull();
    expect(normalized.sessions.a.parentId).toBeNull();
    expect(normalized.sessions.b.parentId).toBeNull();
    expect(serializeAgentSessions(normalized).sessions.child.parentId).toBe('root');
  });

  it('formats only the newest transcript context within its character budget', () => {
    const context = formatSessionContext(
      [
        createSessionMessage({ role: 'user', text: 'old context'.repeat(20) }),
        createSessionMessage({ role: 'ai', text: 'keep this recent answer' }),
      ],
      80,
    );
    expect(context.length).toBeLessThanOrEqual(80);
    expect(context).toContain('keep this recent answer');
    expect(context).toContain('Earlier conversation omitted');
  });

  it('updates session patches including role graphs and messages', () => {
    let state = createDefaultAgentSessions();
    const id = state.activeSessionId;
    state = updateAgentSession(state, id, {
      mode: 'team',
      messages: [createSessionMessage({ role: 'user', text: 'hi', agentRole: 'planner' })],
      roleGraph: {
        roles: [{ id: 'only', kind: 'coder', label: 'Only', modelId: 'm' }],
        edges: [],
      },
    });
    const session = getActiveAgentSession(state);
    expect(session.mode).toBe('team');
    expect(session.messages).toHaveLength(1);
    expect(session.roleGraph.roles[0].modelId).toBe('m');
  });

  it('throws for missing sessions on mutate helpers', () => {
    const state = createDefaultAgentSessions();
    expect(() => renameAgentSession(state, 'missing', 'x')).toThrow(/not found/);
    expect(() => deleteAgentSession(state, 'missing')).toThrow(/not found/);
    expect(() => setActiveAgentSession(state, 'missing')).toThrow(/not found/);
    expect(() => updateAgentSession(state, 'missing', {})).toThrow(/not found/);
    expect(() =>
      appendSessionMessage(state, 'missing', createSessionMessage({ role: 'user', text: 'x' })),
    ).toThrow(/not found/);
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
    expect(normalizeAgentSessions(null).activeSessionId).toBeTruthy();
    expect(normalizeAgentSessions([]).activeSessionId).toBeTruthy();

    const raw = {
      activeSessionId: 'missing',
      sessions: {
        a: {
          id: 'a',
          name: 'A',
          createdAt: 1,
          updatedAt: 2,
          mode: 'team',
          messages: [
            { id: 1, role: 'user', text: 'hi', timestamp: '12:00:00' },
            { role: 'bad', text: 123 },
            { id: 2, role: 'ai', text: 'ok', agentRole: 'coder' },
          ],
          reasoning: 'plan',
          status: 'running',
          roleGraph: {
            roles: [{ id: 'p', kind: 'planner', label: 'Plan', modelId: 'm1' }],
            edges: [],
          },
        },
        bad: null,
      },
    };
    const normalized = normalizeAgentSessions(raw);
    expect(normalized.activeSessionId).toBe('a');
    expect(normalized.sessions.a.status).toBe('idle');
    expect(normalized.sessions.a.messages).toHaveLength(2);
    expect(normalized.sessions.a.roleGraph.roles[0].modelId).toBe('m1');
    const serialized = serializeAgentSessions(normalized);
    expect(serialized.sessions.a.messages).toHaveLength(2);
    expect(serialized.sessions.a.status).toBeUndefined();
    expect(serialized.sessions.a.roleGraph.roles[0].id).toBe('p');
  });
});
