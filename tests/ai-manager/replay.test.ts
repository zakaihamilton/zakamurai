import { type ManagerReplayFixture, replayManagerFixture } from '@/components/AI/Agent';
import contextFixture from './fixtures/context-follow-up.json';
import deleteFixture from './fixtures/delete-file.json';
import editFixture from './fixtures/edit-title.json';
import listFixture from './fixtures/list-files.json';
import mixedFixture from './fixtures/mixed-edit-validation.json';
import partialFixture from './fixtures/partial-validation-error.json';
import previewFixture from './fixtures/preview-inspection.json';
import projectCheckFixture from './fixtures/project-check.json';
import qwenFixture from './fixtures/qwen-1.5b-styled-component.json';
import searchFixture from './fixtures/search-workspace.json';

const fixtures = [
  listFixture,
  editFixture,
  deleteFixture,
  partialFixture,
  contextFixture,
  mixedFixture,
  previewFixture,
  projectCheckFixture,
  searchFixture,
  qwenFixture,
] as ManagerReplayFixture[];

describe('AI Manager replay fixtures', () => {
  it.each(fixtures)('replays $name through the real manager', async (fixture) => {
    const replay = await replayManagerFixture(fixture);
    expect(replay.trace.outcome).toBe(fixture.expected?.outcome);
    expect(replay.modelCalls).toHaveLength(fixture.expected?.modelCalls || 0);
    expect(replay.toolOrder).toEqual(fixture.expected?.toolOrder || []);
    expect(replay.trace.plan?.intent).toBe(fixture.expected?.intent);
    if (fixture.expected?.outcome === 'success') {
      expect(replay.result).not.toBeNull();
    } else {
      expect(replay.error).toMatchObject({ name: 'ManagerRunError' });
      expect(replay.error?.changes).toHaveLength(1);
    }
  });

  it('keeps every fixture bounded and deterministic', async () => {
    for (const fixture of fixtures) {
      const first = await replayManagerFixture(fixture);
      const second = await replayManagerFixture(fixture);
      expect(first.toolOrder, fixture.name).toEqual(second.toolOrder);
      expect(first.modelCalls.length, fixture.name).toBe(second.modelCalls.length);
      expect(first.trace.plan, fixture.name).toEqual(second.trace.plan);
      expect(first.trace.events.length, fixture.name).toBe(second.trace.events.length);
    }
  });

  it('replays the bounded Qwen 1.5B style contract and deterministic CSS output', async () => {
    const replay = await replayManagerFixture(qwenFixture as ManagerReplayFixture);
    const firstCall = replay.modelCalls[0];
    const prompt = firstCall.messages.map((message) => message.content).join('\n');
    expect(firstCall).toMatchObject({ temperature: 0.02, contextWindowSize: 4096 });
    expect(prompt).toContain('Project generation contract');
    expect(prompt).not.toContain('Make deliberate design decisions');
    expect(replay.result?.files['src/App.module.css']).toContain('--color-accent');
    expect(replay.result?.files['src/App.module.css']).toContain('.primaryAction:focus-visible');
  });
});
