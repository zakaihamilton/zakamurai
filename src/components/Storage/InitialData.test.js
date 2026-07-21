import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENTS, DEFAULT_FILES, SCRATCH_CONTENTS, SCRATCH_FILES } from './InitialData';

describe('InitialData', () => {
  it('provides a default project tree with matching file contents', () => {
    expect(DEFAULT_FILES.some((entry) => entry.name === 'src')).toBe(true);
    expect(DEFAULT_FILES.some((entry) => entry.name === 'package.json')).toBe(true);

    for (const path of Object.keys(DEFAULT_CONTENTS)) {
      expect(DEFAULT_CONTENTS[path].length).toBeGreaterThan(0);
    }

    expect(DEFAULT_CONTENTS['src/App.jsx']).toContain('AnimatedCard');
    expect(DEFAULT_CONTENTS['package.json']).toContain('animated-vite-app');
  });

  it('provides a scratch project tree with matching file contents', () => {
    expect(SCRATCH_FILES.some((entry) => entry.name === 'src')).toBe(true);
    expect(SCRATCH_CONTENTS['src/App.jsx']).toContain('New Project');
    expect(SCRATCH_CONTENTS['package.json']).toContain('new-project');
  });
});
