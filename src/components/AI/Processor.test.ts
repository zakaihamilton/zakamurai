import { describe, expect, it, vi } from 'vitest';
import * as exports from './Processor';

vi.mock('./Processor/Main', () => ({
  processAIResponse: 'processAIResponseMock',
}));
vi.mock('./Processor/utils/Parser', () => ({
  parseAIResponse: 'parseAIResponseMock',
}));
vi.mock('./Processor/utils/Applier', () => ({
  applyFileUpdate: 'applyFileUpdateMock',
}));
vi.mock('./Processor/utils/PathResolver', () => ({
  resolveFilePath: 'resolveFilePathMock',
}));

describe('Processor re-exports', () => {
  it('correctly re-exports from sub-files', () => {
    expect(exports.processAIResponse).toBe('processAIResponseMock');
    expect(exports.parseAIResponse).toBe('parseAIResponseMock');
    expect(exports.applyFileUpdate).toBe('applyFileUpdateMock');
    expect(exports.resolveFilePath).toBe('resolveFilePathMock');
  });
});
