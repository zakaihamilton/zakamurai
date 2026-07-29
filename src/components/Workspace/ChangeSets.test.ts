import { asChangeSetStore } from '@/test-utils/vitest-mocks';
import { describe, expect, it } from 'vitest';
import { addChangeSet, createChangeSet, updateChangeSetFile } from './ChangeSets';

describe('ChangeSets', () => {
  it('records pending file review and transitions reviewed files', () => {
    const changeSet = createChangeSet({
      request: 'rename value',
      changes: [{ path: 'src/a.js', before: 'const a = 1;', after: 'const b = 1;' }],
    });
    const store = asChangeSetStore();
    addChangeSet(store, changeSet);
    updateChangeSetFile(store, changeSet.id, 'src/a.js', 'accepted');
    expect(store.state.activeId).toBe(changeSet.id);
    expect(store.state.items[0]?.status).toBe('reviewed');
    expect(store.state.items[0]?.files[0]?.status).toBe('accepted');
  });
});
