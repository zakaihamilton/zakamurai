import { describe, expect, it } from 'vitest';
import { AppState } from './AppState';

describe('AppState', () => {
  it('is defined', () => {
    expect(AppState).toBeDefined();
  });

  it('has correct displayName', () => {
    expect(AppState.displayName).toBe('AppState');
  });

  it('has useState method', () => {
    expect(typeof AppState.useState).toBe('function');
  });
});
