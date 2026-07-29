import { compilerErrorMessage } from './compiler';

describe('compilerErrorMessage', () => {
  it('preserves Error messages and provides safe fallbacks', () => {
    expect(compilerErrorMessage(new Error('compile failed'))).toBe('compile failed');
    expect(compilerErrorMessage('compile failed')).toBe('compile failed');
    expect(compilerErrorMessage(null)).toBe('Unknown compilation error');
  });
});
