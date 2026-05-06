import { describe, expect, it, vi } from 'vitest';
import { ZipWriter } from './zip';

// Mock CompressionStream if it doesn't exist
if (typeof CompressionStream === 'undefined') {
  global.CompressionStream = class {
    constructor() {
      this.writable = {};
      this.readable = {};
    }
  };
}

describe('ZipWriter', () => {
  it('adds files and generates a blob', async () => {
    const zip = new ZipWriter();
    zip.addFile('test.txt', 'hello world');

    const blob = await zip.generateBlob();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('correctly calculates CRC32', () => {
    const zip = new ZipWriter();
    const data = new TextEncoder().encode('hello world');
    const crc = zip.crc32(data);
    // CRC32 for "hello world" is 0x0d4a1185
    expect(crc).toBe(0x0d4a1185);
  });

  it('generates valid DOS date/time', () => {
    const zip = new ZipWriter();
    const date = new Date('2026-05-06T12:00:00');
    const dosTime = zip.dosTime(date);
    const dosDate = zip.dosDate(date);

    expect(typeof dosTime).toBe('number');
    expect(typeof dosDate).toBe('number');
  });
});
