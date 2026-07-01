import { describe, expect, it, vi } from 'vitest';
import App, { AppState } from './index';

vi.mock('./App', () => {
  return {
    default: () => 'mockApp',
  };
});

vi.mock('./AppState', () => {
  return {
    AppState: 'mockAppState',
  };
});

describe('App index', () => {
  it('exports App default and AppState', () => {
    expect(App()).toBe('mockApp');
    expect(AppState).toBe('mockAppState');
  });
});
