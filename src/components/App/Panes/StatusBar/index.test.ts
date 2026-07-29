import { describe, expect, it } from 'vitest';
import StatusBar from './index';

describe('StatusBar index export', () => {
  it('exports default StatusBar component', () => {
    expect(StatusBar).toBeDefined();
  });
});
