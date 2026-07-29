import { describe, expect, it, vi } from 'vitest';
import * as exports from './Processor';

vi.mock('./Processor/Main', () => ({
  processAIResponse: 'processAIResponseMock',
}));
vi.mock('./Processor/utils/Parser', () => ({
  parseResponse: 'parseResponseMock',
}));
vi.mock('./Processor/utils/Applier', () => ({
  applyChanges: 'applyChangesMock',
}));
vi.mock('./Processor/utils/PathResolver', () => ({
  resolvePath: 'resolvePathMock',
}));

describe('Processor re-exports', () => {
  it('correctly re-exports from sub-files', () => {
    expect(exports.processAIResponse).toBe('processAIResponseMock');
    expect(exports.parseResponse).toBe('parseResponseMock');
    expect(exports.applyChanges).toBe('applyChangesMock');
    expect(exports.resolvePath).toBe('resolvePathMock');
  });
});
