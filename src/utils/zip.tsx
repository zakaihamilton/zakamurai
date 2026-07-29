type ZipFileEntry = {
  name: string;
  data: Uint8Array;
};

/**
 * A minimal ZIP writer implementation (Store method only, no compression)
 * Reference: https://en.wikipedia.org/wiki/ZIP_(file_format)
 */
export class ZipWriter {
  files: ZipFileEntry[];
  crcTable?: Uint32Array;

  constructor() {
    this.files = [];
  }

  addFile(name: string, content: string | Uint8Array): void {
    const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.files.push({ name, data });
  }

  async compress(data: Uint8Array): Promise<Uint8Array> {
    try {
      const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const compressed = new Uint8Array(await new Blob(chunks as BlobPart[]).arrayBuffer());
      return compressed;
    } catch (_e) {
      return data;
    }
  }

  async generateBlob(): Promise<Blob> {
    const localFiles: Uint8Array[] = [];
    const centralDirectories: Uint8Array[] = [];
    let offset = 0;

    for (const file of this.files) {
      const compressedData = await this.compress(file.data);
      const isCompressed = compressedData.length < file.data.length;
      const finalData = isCompressed ? compressedData : file.data;
      const method = isCompressed ? 8 : 0;

      const nameBuf = new TextEncoder().encode(file.name);
      const date = new Date();
      const timeHex = this.dosTime(date);
      const dateHex = this.dosDate(date);
      const crc = this.crc32(file.data);

      const lfh = new Uint8Array(30 + nameBuf.length);
      const view = new DataView(lfh.buffer);

      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0, true);
      view.setUint16(8, method, true);
      view.setUint16(10, timeHex, true);
      view.setUint16(12, dateHex, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, finalData.length, true);
      view.setUint32(22, file.data.length, true);
      view.setUint16(26, nameBuf.length, true);
      view.setUint16(28, 0, true);
      lfh.set(nameBuf, 30);

      localFiles.push(lfh);
      localFiles.push(finalData);

      const cdh = new Uint8Array(46 + nameBuf.length);
      const cview = new DataView(cdh.buffer);

      cview.setUint32(0, 0x02014b50, true);
      cview.setUint16(4, 20, true);
      cview.setUint16(6, 20, true);
      cview.setUint16(8, 0, true);
      cview.setUint16(10, method, true);
      cview.setUint16(12, timeHex, true);
      cview.setUint16(14, dateHex, true);
      cview.setUint32(16, crc, true);
      cview.setUint32(20, finalData.length, true);
      cview.setUint32(24, file.data.length, true);
      cview.setUint16(28, nameBuf.length, true);
      cview.setUint16(30, 0, true);
      cview.setUint16(32, 0, true);
      cview.setUint16(34, 0, true);
      cview.setUint16(36, 0, true);
      cview.setUint32(38, 0, true);
      cview.setUint32(42, offset, true);
      cdh.set(nameBuf, 46);

      centralDirectories.push(cdh);
      offset += lfh.length + finalData.length;
    }

    const cdSize = centralDirectories.reduce((sum, buf) => sum + buf.length, 0);

    const eocd = new Uint8Array(22);
    const eview = new DataView(eocd.buffer);
    eview.setUint32(0, 0x06054b50, true);
    eview.setUint16(4, 0, true);
    eview.setUint16(6, 0, true);
    eview.setUint16(8, this.files.length, true);
    eview.setUint16(10, this.files.length, true);
    eview.setUint32(12, cdSize, true);
    eview.setUint32(16, offset, true);
    eview.setUint16(20, 0, true);

    return new Blob([...localFiles, ...centralDirectories, eocd] as BlobPart[], {
      type: 'application/zip',
    });
  }

  dosTime(date: Date): number {
    return (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  }

  dosDate(date: Date): number {
    return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  }

  crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    if (!this.crcTable) {
      this.crcTable = this.makeCrcTable();
    }
    const table = this.crcTable;
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  makeCrcTable(): Uint32Array {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
    return table;
  }
}
