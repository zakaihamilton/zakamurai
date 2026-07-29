import type { RoleGraph } from '@/components/AI/types';
import type { CreateAgentSessionOptions } from '@/components/App/types';
import type {
  AgentSession,
  AgentSessionMessage,
  AgentSessionStateShape,
} from '@/components/state/domain-types';
import {
  expectAgentSession,
  requireActiveSession,
  requireSessionId,
  sessionRoleGraph,
} from '@/test-utils/agentSessionMocks';
import { describe, expect, it } from 'vitest';
import {
  MAX_AGENT_SESSIONS,
  addAgentSession,
  appendSessionMessage,
  capSessionMessages,
  createAgentBranch,
  createAgentSession,
  createDefaultAgentSessions,
  createSessionMessage,
  deleteAgentSession,
  formatSessionContext,
  getActiveAgentSession,
  getAgentSessionChildren,
  getAgentSessionSubtreeIds,
  listAgentSessionTree,
  listAgentSessions,
  normalizeAgentSessions,
  renameAgentSession,
  serializeAgentSessions,
  setActiveAgentSession,
  updateAgentSession,
} from './AgentSessions';

function active(state: AgentSessionStateShape): AgentSession {
  return expectAgentSession(state);
}

describe('AgentSessions', () => {
  it('creates a default session store', () => {
    const state = createDefaultAgentSessions('model-a');
    const sessions = listAgentSessions(state.sessions);
    expect(sessions).toHaveLength(1);
    expect(state.activeSessionId).toBe(sessions[0]?.id);
    expect(sessions[0]?.mode).toBe('single');
    expect(sessions[0]?.parentId).toBeNull();
    expect(active(state).modelId).toBe('model-a');
    expect(sessionRoleGraph(active(state)).roles).toHaveLength(3);
  });

  it('returns null for missing active sessions', () => {
    expect(getActiveAgentSession(null)).toBeNull();
    expect(getActiveAgentSession({ sessions: {}, activeSessionId: 'x' })).toBeNull();
  });

  it('adds, renames, switches, and deletes sessions', () => {
    let state: AgentSessionStateShape = createDefaultAgentSessions();
    const firstId = requireSessionId(state.activeSessionId);
    state = addAgentSession(state, { name: 'Research', mode: 'team' });
    expect(listAgentSessions(state.sessions)).toHaveLength(2);
    expect(state.activeSessionId).not.toBe(firstId);
    expect(getActiveAgentSession(state)?.mode).toBe('team');
    expect(sessionRoleGraph(requireActiveSession(getActiveAgentSession(state))).roles).toHaveLength(
      3,
    );

    state = renameAgentSession(state, requireSessionId(state.activeSessionId), '  Research Ops  ');
    expect(getActiveAgentSession(state)?.name).toBe('Research Ops');
    state = renameAgentSession(state, requireSessionId(state.activeSessionId), '   ');
    expect(getActiveAgentSession(state)?.name).toBe('Research Ops');

    state = setActiveAgentSession(state, firstId);
    expect(state.activeSessionId).toBe(firstId);

    const secondId = listAgentSessions(state.sessions).find((s) => s.id !== firstId)?.id;
    state = deleteAgentSession(state, firstId);
    expect(listAgentSessions(state.sessions)).toHaveLength(1);
    expect(getActiveAgentSession(state)?.id).toBe(secondId);

    state = addAgentSession(state, { name: 'Extra' });
    const activeId = requireSessionId(state.activeSessionId);
    const other = requireSessionId(
      listAgentSessions(state.sessions).find((s) => s.id !== activeId)?.id,
    );
    expect(state.activeSessionId).toBe(activeId);
  });

  it('recreates a default session when the last one is deleted', () => {
    let state = createDefaultAgentSessions('keep-model');
    const onlyId = requireSessionId(state.activeSessionId);
    state = deleteAgentSession(state, onlyId);
    expect(listAgentSessions(state.sessions)).toHaveLength(1);
    expect(getActiveAgentSession(state)?.modelId).toBe('keep-model');
    expect(getActiveAgentSession(state)?.id).not.toBe(onlyId);
  });

  it('branches a conversation with isolated copied history and configuration', () => {
    let state = createDefaultAgentSessions('model-a');
    const parentId = requireSessionId(state.activeSessionId);
    state = updateAgentSession(state, parentId, {
      mode: 'team',
      messages: [
        createSessionMessage({ role: 'user', text: 'Plan an onboarding flow.' }),
        createSessionMessage({ role: 'ai', text: 'I will inspect the app first.' }),
      ],
    });

    state = createAgentBranch(state, parentId);
    const child = requireActiveSession(getActiveAgentSession(state));
    expect(child.parentId).toBe(parentId);
    expect(child.name).toBe('Agent 1 branch');
    expect(child.mode).toBe('team');
    expect(child.messages).toEqual(state.sessions[parentId]?.messages);

    state = appendSessionMessage(
      state,
      child.id,
      createSessionMessage({ role: 'user', text: 'Instead, focus on accessibility.' }),
    );
    expect(state.sessions[parentId]?.messages).toHaveLength(2);
    expect(getAgentSessionSubtreeIds(state.sessions, parentId)).toEqual(
      new Set([parentId, child.id]),
    );
    expect(listAgentSessionTree(state.sessions).map(({ depth }) => depth)).toEqual([0, 1]);
  });

  it('deletes an entire branch and selects its surviving parent', () => {
    let state: AgentSessionStateShape = createDefaultAgentSessions();
    const rootId = requireSessionId(state.activeSessionId);
    state = createAgentBranch(state, rootId);
    const branchId = requireSessionId(state.activeSessionId);
    state = createAgentBranch(state, branchId);
    const leafId = requireSessionId(state.activeSessionId);

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
    expect(normalized.sessions.child?.parentId).toBe('root');
    expect(normalized.sessions.orphan?.parentId).toBeNull();
    expect(normalized.sessions.a?.parentId).toBeNull();
    expect(normalized.sessions.b?.parentId).toBeNull();
    expect(serializeAgentSessions(normalized).sessions.child?.parentId).toBe('root');
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
    let state: AgentSessionStateShape = createDefaultAgentSessions();
    const id = requireSessionId(state.activeSessionId);
    state = updateAgentSession(state, id, {
      mode: 'team',
      messages: [createSessionMessage({ role: 'user', text: 'hi', agentRole: 'planner' })],
      roleGraph: {
        roles: [{ id: 'only', kind: 'coder', label: 'Only', modelId: 'm' }],
        edges: [],
      },
    });
    const session = requireActiveSession(getActiveAgentSession(state));
    expect(session.mode).toBe('team');
    expect(session.messages).toHaveLength(1);
    expect(sessionRoleGraph(session).roles[0]?.modelId).toBe('m');
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
    let state: AgentSessionStateShape = createDefaultAgentSessions();
    const id = requireSessionId(state.activeSessionId);
    for (let i = 0; i < 45; i++) {
      state = appendSessionMessage(
        state,
        id,
        createSessionMessage({ role: 'user', text: `msg-${i}` }),
      );
    }
    expect(getActiveAgentSession(state)?.messages).toHaveLength(40);
    expect(getActiveAgentSession(state)?.messages[0]?.text).toBe('msg-5');

    for (let i = 1; i < MAX_AGENT_SESSIONS; i++) {
      state = addAgentSession(state, { name: `Agent ${i + 1}` });
    }
    expect(() => addAgentSession(state)).toThrow(/Maximum/);
  });

  it('covers create/list/branch/delete edge cases', () => {
    expect(
      createAgentSession({ parentId: 12 } as unknown as CreateAgentSessionOptions).parentId,
    ).toBeNull();
    expect(createAgentSession({ mode: 'other' } as unknown as CreateAgentSessionOptions).mode).toBe(
      'single',
    );
    expect(createAgentSession({ name: '' }).name).toBe('Agent 1');
    expect(capSessionMessages(null as unknown as AgentSessionMessage[])).toEqual([]);
    expect(listAgentSessions()).toEqual([]);
    expect(getAgentSessionSubtreeIds({}, 'missing').size).toBe(0);
    expect(
      formatSessionContext([{ role: 'user', text: 'x' }] as unknown as AgentSessionMessage[], 0),
    ).toBe('');
    expect(
      formatSessionContext(
        [{ role: 'system', text: 'sys', agentRole: 'planner' }] as unknown as AgentSessionMessage[],
        200,
      ),
    ).toContain('System (planner)');
    expect(
      formatSessionContext([createSessionMessage({ role: 'user', text: 'huge'.repeat(40) })], 120),
    ).toContain('[Message truncated]');

    let state: AgentSessionStateShape = createDefaultAgentSessions();
    const rootId = requireSessionId(state.activeSessionId);
    state = updateAgentSession(state, rootId, { status: 'running' });
    expect(() => createAgentBranch(state, rootId)).toThrow(/Stop the running agent/);
    expect(() => createAgentBranch(state, 'missing')).toThrow(/not found/);
    expect(() => deleteAgentSession(state, rootId)).toThrow(/Stop the running agent/);

    state = updateAgentSession(state, rootId, { status: 'idle' });
    state = createAgentBranch(state, rootId);
    const branchId = requireSessionId(state.activeSessionId);
    state = setActiveAgentSession(state, rootId);
    state = deleteAgentSession(state, branchId);
    expect(state.activeSessionId).toBe(rootId);
    expect(state.sessions[branchId]).toBeUndefined();
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
    expect(normalized.sessions.a?.status).toBe('idle');
    expect(normalized.sessions.a?.messages).toHaveLength(2);
    expect(sessionRoleGraph(requireActiveSession(normalized.sessions.a)).roles[0]?.modelId).toBe(
      'm1',
    );
    const serialized = serializeAgentSessions(normalized);
    expect(serialized.sessions.a?.messages).toHaveLength(2);
    expect(serialized.sessions.a).not.toHaveProperty('status');
    expect((serialized.sessions.a?.roleGraph as RoleGraph).roles[0]?.id).toBe('p');
  });

  it('creates sessions with defaults and optional parent links', () => {
    const session = createAgentSession({ parentId: 42 } as unknown as CreateAgentSessionOptions);
    expect(session.name).toBe('Agent 1');
    expect(session.parentId).toBeNull();
    expect(createAgentSession({ name: 'Custom', mode: 'team' }).mode).toBe('team');
    expect(createSessionMessage({ role: 'ai', text: 'hi', agentRole: 'coder' }).agentRole).toBe(
      'coder',
    );
    expect(capSessionMessages(null as unknown as AgentSessionMessage[])).toEqual([]);
  });

  it('skips cyclic branches when listing the session tree', () => {
    const sessions = {
      a: { id: 'a', name: 'A', parentId: 'b', createdAt: 1 },
      b: { id: 'b', name: 'B', parentId: 'a', createdAt: 2 },
      root: { id: 'root', name: 'Root', parentId: null, createdAt: 0 },
    } as unknown as Record<string, AgentSession>;
    const tree = listAgentSessionTree(sessions);
    expect(tree.map(({ session }) => session.id)).toContain('root');
    expect(getAgentSessionChildren(sessions, 'root')).toHaveLength(0);
  });

  it('rejects branching or deleting running sessions', () => {
    let state: AgentSessionStateShape = createDefaultAgentSessions();
    const id = requireSessionId(state.activeSessionId);
    state = updateAgentSession(state, id, { status: 'running' });
    expect(() => createAgentBranch(state, id)).toThrow(/running/);
    expect(() => deleteAgentSession(state, id)).toThrow(/running/);
  });

  it('selects the parent session when deleting the active branch', () => {
    let state: AgentSessionStateShape = createDefaultAgentSessions();
    const rootId = requireSessionId(state.activeSessionId);
    state = createAgentBranch(state, rootId);
    const branchId = requireSessionId(state.activeSessionId);
    state = deleteAgentSession(state, branchId);
    expect(state.activeSessionId).toBe(rootId);
  });

  it('formats context with agent roles and truncates oversized first messages', () => {
    const withRole = formatSessionContext([
      createSessionMessage({ role: 'ai', text: 'done', agentRole: 'coder' }),
    ]);
    expect(withRole).toContain('Agent (coder)');

    const truncated = formatSessionContext(
      [createSessionMessage({ role: 'user', text: 'x'.repeat(200) })],
      120,
    );
    expect(truncated).toContain('[Message truncated]');
    expect(truncated.length).toBeLessThanOrEqual(120);
    expect(formatSessionContext([], 0)).toBe('');
  });

  it('normalizes empty session stores and caps persisted session count', () => {
    const emptySessions = normalizeAgentSessions({ sessions: { bad: null }, activeSessionId: 'x' });
    expect(emptySessions.sessions).toBeTruthy();
    expect(
      normalizeAgentSessions({ sessions: null }, { modelId: 'm1' }).activeSessionId,
    ).toBeTruthy();
    expect(
      normalizeAgentSessions({
        sessions: {
          a: { id: 12, name: '  ', parentId: 3, createdAt: 'x', updatedAt: 'y', modelId: 9 },
        },
      }).sessions,
    ).toBeTruthy();

    const many: { sessions: Record<string, unknown>; activeSessionId: string | null } = {
      sessions: {},
      activeSessionId: null,
    };
    for (let i = 0; i < MAX_AGENT_SESSIONS + 5; i++) {
      many.sessions[`s${i}`] = {
        id: `s${i}`,
        name: `Agent ${i}`,
        createdAt: i,
        updatedAt: i,
      };
    }
    expect(Object.keys(normalizeAgentSessions(many).sessions)).toHaveLength(MAX_AGENT_SESSIONS);

    let state: AgentSessionStateShape = createDefaultAgentSessions();
    for (let i = 1; i < MAX_AGENT_SESSIONS; i++) {
      state = addAgentSession(state, { name: `Agent ${i + 1}` });
    }
    expect(() => createAgentBranch(state, requireSessionId(state.activeSessionId))).toThrow(
      /Maximum/,
    );
    const activeId = requireSessionId(state.activeSessionId);
    expect(updateAgentSession(state, activeId, {}).sessions[activeId]).toBeTruthy();
    expect(
      appendSessionMessage(
        state,
        activeId,
        createSessionMessage({ role: 'user', text: 'x' }),
      ).sessions[activeId]?.messages.at(-1)?.text,
    ).toBe('x');
    expect(
      formatSessionContext(
        [null, { role: 'ai', text: 'ok' }] as unknown as AgentSessionMessage[],
        'bad' as unknown as number,
      ),
    ).toBe('');
    expect(
      formatSessionContext(
        [{ role: 'system', text: 'note' }] as unknown as AgentSessionMessage[],
        200,
      ),
    ).toContain('System:');
  });
});
