/**
 * A minimal ZIP writer implementation (Store method only, no compression)
 * Reference: https://en.wikipedia.org/wiki/ZIP_(file_format)
 */
export class ZipWriter {
  constructor() {
    this.files = [];
  }

  addFile(name, content) {
    const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.files.push({ name, data });
  }

  async compress(data) {
    try {
      const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const reader = stream.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const compressed = new Uint8Array(await new Blob(chunks).arrayBuffer());
      return compressed;
    } catch (_e) {
      // Fallback to store if deflate-raw is not supported
      return data;
    }
  }

  async generateBlob() {
    const localFiles = [];
    const centralDirectories = [];
    let offset = 0;

    for (const file of this.files) {
      const compressedData = await this.compress(file.data);
      const isCompressed = compressedData.length < file.data.length;
      const finalData = isCompressed ? compressedData : file.data;
      const method = isCompressed ? 8 : 0; // 8 = Deflate, 0 = Store

      const nameBuf = new TextEncoder().encode(file.name);
      const date = new Date();
      const timeHex = this.dosTime(date);
      const dateHex = this.dosDate(date);
      const crc = this.crc32(file.data);

      // Local File Header
      const lfh = new Uint8Array(30 + nameBuf.length);
      const view = new DataView(lfh.buffer);

      view.setUint32(0, 0x04034b50, true); // Signature
      view.setUint16(4, 20, true); // Version (2.0 for deflate)
      view.setUint16(6, 0, true); // Flags
      view.setUint16(8, method, true); // Compression
      view.setUint16(10, timeHex, true);
      view.setUint16(12, dateHex, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, finalData.length, true); // Compressed size
      view.setUint32(22, file.data.length, true); // Uncompressed size
      view.setUint16(26, nameBuf.length, true);
      view.setUint16(28, 0, true); // Extra field length
      lfh.set(nameBuf, 30);

      localFiles.push(lfh);
      localFiles.push(finalData);

      // Central Directory Header
      const cdh = new Uint8Array(46 + nameBuf.length);
      const cview = new DataView(cdh.buffer);

      cview.setUint32(0, 0x02014b50, true); // Signature
      cview.setUint16(4, 20, true); // Version made by
      cview.setUint16(6, 20, true); // Version needed
      cview.setUint16(8, 0, true); // Flags
      cview.setUint16(10, method, true); // Compression
      cview.setUint16(12, timeHex, true);
      cview.setUint16(14, dateHex, true);
      cview.setUint32(16, crc, true);
      cview.setUint32(20, finalData.length, true);
      cview.setUint32(24, file.data.length, true);
      cview.setUint16(28, nameBuf.length, true);
      cview.setUint16(30, 0, true); // Extra
      cview.setUint16(32, 0, true); // Comment
      cview.setUint16(34, 0, true); // Disk start
      cview.setUint16(36, 0, true); // Internal attr
      cview.setUint32(38, 0, true); // External attr
      cview.setUint32(42, offset, true); // Offset of LFH
      cdh.set(nameBuf, 46);

      centralDirectories.push(cdh);
      offset += lfh.length + finalData.length;
    }

    const cdSize = centralDirectories.reduce((sum, buf) => sum + buf.length, 0);

    // End of Central Directory Record
    const eocd = new Uint8Array(22);
    const eview = new DataView(eocd.buffer);
    eview.setUint32(0, 0x06054b50, true);
    eview.setUint16(4, 0, true); // Disk num
    eview.setUint16(6, 0, true); // Disk start
    eview.setUint16(8, this.files.length, true); // Records on disk
    eview.setUint16(10, this.files.length, true); // Total records
    eview.setUint32(12, cdSize, true);
    eview.setUint32(16, offset, true);
    eview.setUint16(20, 0, true); // Comment length

    return new Blob([...localFiles, ...centralDirectories, eocd], { type: 'application/zip' });
  }

  dosTime(date) {
    return (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  }

  dosDate(date) {
    return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  }

  crc32(data) {
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

  makeCrcTable() {
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
