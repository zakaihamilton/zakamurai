import editFixture from './fixtures/edit-title.json';
import listFixture from './fixtures/list-files.json';
import partialFixture from './fixtures/partial-validation-error.json';
import deleteFixture from './fixtures/delete-file.json';
import contextFixture from './fixtures/context-follow-up.json';
import mixedFixture from './fixtures/mixed-edit-validation.json';
import previewFixture from './fixtures/preview-inspection.json';
import projectCheckFixture from './fixtures/project-check.json';
import searchFixture from './fixtures/search-workspace.json';
import { replayManagerFixture, type ManagerReplayFixture } from '@/components/AI/Agent';

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
});
