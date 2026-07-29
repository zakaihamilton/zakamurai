import { describe, expect, it } from 'vitest';
import { ZipWriter } from './zip';

if (typeof CompressionStream === 'undefined') {
  global.CompressionStream = class {
    readable: ReadableStream;
    writable: WritableStream;
    constructor() {
      this.readable = new ReadableStream();
      this.writable = new WritableStream();
    }
  } as unknown as typeof CompressionStream;
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
