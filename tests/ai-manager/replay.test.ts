import editFixture from './fixtures/edit-title.json';
import listFixture from './fixtures/list-files.json';
import partialFixture from './fixtures/partial-validation-error.json';
import { replayManagerFixture, type ManagerReplayFixture } from '@/components/AI/Agent';

const fixtures = [listFixture, editFixture, partialFixture] as ManagerReplayFixture[];

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
});
