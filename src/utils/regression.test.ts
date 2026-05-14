import { describe, expect, it } from 'vitest';

/**
 * Sample AI-generated data parser to demonstrate property-based testing concepts.
 * This parser expects a string in the format "key:value,key:value"
 */
function parseMetadata(input: string): Record<string, string> {
  if (!input || typeof input !== 'string') return {};
  const pairs = input.split(',');
  const result: Record<string, string> = {};

  for (const pair of pairs) {
    if (!pair.includes(':')) continue;
    const [key, value] = pair.split(':');
    if (key) {
      result[key.trim()] = (value || '').trim();
    }
  }

  return result;
}

describe('parseMetadata Logic Tests (Edge Case Verification)', () => {
  it('should return an empty object for empty or non-string input', () => {
    expect(parseMetadata('')).toEqual({});
    // @ts-ignore
    expect(parseMetadata(null)).toEqual({});
    // @ts-ignore
    expect(parseMetadata(undefined)).toEqual({});
  });

  it('should correctly parse standard key-value pairs', () => {
    const input = 'name:zakamurai,version:0.1.0';
    const expected = { name: 'zakamurai', version: '0.1.0' };
    expect(parseMetadata(input)).toEqual(expected);
  });

  it('should handle extra whitespace around keys and values', () => {
    const input = '  name  :  zakamurai  ,  version  :  0.1.0  ';
    const expected = { name: 'zakamurai', version: '0.1.0' };
    expect(parseMetadata(input)).toEqual(expected);
  });

  it('should handle malformed pairs gracefully', () => {
    const input = 'key1:value1,key2,key3:,:value4';
    const expected = { key1: 'value1', key3: '' };
    expect(parseMetadata(input)).toEqual(expected);
  });

  /* 
  NOTE: Property-based testing with fast-check is the recommended way to catch AI regressions.
  Example (requires fast-check):
  
  it('should always return an object, regardless of input string', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = parseMetadata(input);
        expect(typeof result).toBe('object');
      })
    );
  });
  */
});
