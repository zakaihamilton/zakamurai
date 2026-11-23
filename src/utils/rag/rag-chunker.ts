import { MAX_EMBED_TOKENS, tokenCount } from './rag-embedder';

const CHUNK_OVERLAP_TOKENS = 20;
const MAX_CHUNK_SOURCE_CHARS = 1600;

const SYMBOL_BOUNDARY_RE =
  /\n(?=(?:export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|interface|type)\s+[A-Za-z0-9_$]+|(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(|class\s+[A-Za-z0-9_$]+\s*(?:extends|implements|\{)|\.(?:[A-Za-z_-][A-Za-z0-9_-]*)\s*\{|@media\b|@keyframes\b))/g;

export function longestPrefixWithinTokenLimit(text: string, limit: number): number {
  let low = 1;
  let high = text.length;
  let best = 0;

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const safeMidpoint =
      midpoint < text.length && /[\uDC00-\uDFFF]/.test(text[midpoint]) ? midpoint + 1 : midpoint;
    if (tokenCount(text.slice(0, safeMidpoint)) <= limit) {
      best = safeMidpoint;
      low = safeMidpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  return best || Math.min(1, text.length);
}

export function earliestSuffixWithinTokenLimit(text: string, limit: number): number {
  let low = 0;
  let high = text.length;
  let best = text.length;

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const safeMidpoint =
      midpoint > 0 && /[\uDC00-\uDFFF]/.test(text[midpoint]) ? midpoint + 1 : midpoint;
    if (tokenCount(text.slice(safeMidpoint)) <= limit) {
      best = safeMidpoint;
      high = midpoint - 1;
    } else {
      low = midpoint + 1;
    }
  }

  return best;
}

export function extractSymbolHeader(segment: string): string | null {
  for (const rawLine of segment.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;
    const codeMatch = line.match(
      /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|interface|type)\s+([A-Za-z0-9_$]+)/,
    );
    if (codeMatch?.[1]) return codeMatch[1];
    const cssMatch = line.match(/^(\.[A-Za-z_-][A-Za-z0-9_-]*)\s*\{/);
    if (cssMatch?.[1]) return cssMatch[1];
  }
  return null;
}

function splitSegmentByTokenWindow(segment: string, headerPrefix = ''): string[] {
  const chunks: string[] = [];
  let remaining = segment.trim();
  let overlap = '';

  while (remaining.length > 0) {
    const candidate = overlap + remaining.slice(0, MAX_CHUNK_SOURCE_CHARS);
    const effectiveLimit = Math.max(
      32,
      MAX_EMBED_TOKENS - (headerPrefix ? tokenCount(headerPrefix) : 0),
    );
    let cut = candidate.length;
    if (tokenCount(candidate) > effectiveLimit) {
      cut = longestPrefixWithinTokenLimit(candidate, effectiveLimit);
      const boundary = Math.max(candidate.lastIndexOf('\n', cut), candidate.lastIndexOf(' ', cut));
      if (boundary > overlap.length && boundary >= cut * 0.55) {
        cut = boundary + 1;
      }
    }
    if (cut <= overlap.length) {
      cut = longestPrefixWithinTokenLimit(candidate, effectiveLimit);
    }
    if (cut < candidate.length && /[\uDC00-\uDFFF]/.test(candidate[cut])) cut--;
    while (cut > overlap.length && tokenCount(candidate.slice(0, cut)) > effectiveLimit) {
      cut--;
      if (cut > 0 && /[\uDC00-\uDFFF]/.test(candidate[cut])) cut--;
    }

    const rawSlice = candidate.slice(0, cut).trim();
    if (rawSlice.length > 10) {
      chunks.push(headerPrefix ? `${headerPrefix}\n${rawSlice}` : rawSlice);
    }

    const consumed = Math.min(remaining.length, Math.max(1, cut - overlap.length));
    remaining = remaining.slice(consumed);
    overlap = rawSlice
      .slice(earliestSuffixWithinTokenLimit(rawSlice, CHUNK_OVERLAP_TOKENS))
      .trimStart();
  }

  return chunks;
}

export function splitIntoChunks(content: string, filePath?: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  const rawSegments = trimmed
    .split(SYMBOL_BOUNDARY_RE)
    .map((s) => s.trim())
    .filter(Boolean);
  if (rawSegments.length <= 1) {
    const symbol = extractSymbolHeader(trimmed);
    const prefix = filePath && symbol ? `// File: ${filePath} | Symbol: ${symbol}` : '';
    return splitSegmentByTokenWindow(trimmed, prefix);
  }

  const mergedSegments: string[] = [];
  for (const segment of rawSegments) {
    const prev = mergedSegments.at(-1);
    const prevIsImportsOnly = Boolean(
      prev && !extractSymbolHeader(prev) && /^import\b/m.test(prev),
    );
    if (
      prev &&
      tokenCount(`${prev}\n\n${segment}`) <= MAX_EMBED_TOKENS &&
      (!extractSymbolHeader(segment) || prevIsImportsOnly)
    ) {
      mergedSegments[mergedSegments.length - 1] = `${prev}\n\n${segment}`;
    } else {
      mergedSegments.push(segment);
    }
  }

  const allChunks: string[] = [];
  for (const segment of mergedSegments) {
    const symbol = extractSymbolHeader(segment);
    const prefix = filePath && symbol ? `// File: ${filePath} | Symbol: ${symbol}` : '';
    allChunks.push(...splitSegmentByTokenWindow(segment, prefix));
  }
  return allChunks;
}

function resolveRelativePath(importerPath: string, importPath: string): string | null {
  const cleanImportPath = importPath.replace(/[?#].*$/, '');
  if (cleanImportPath.startsWith('@/')) return `src/${cleanImportPath.slice(2)}`;
  if (cleanImportPath.startsWith('/')) return cleanImportPath.slice(1);
  if (!cleanImportPath.startsWith('.')) return null;

  const parts = importerPath.split('/').slice(0, -1);
  for (const part of cleanImportPath.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join('/');
}

export function findStylesheetLinks(
  filePath: string,
  content: string,
  knownStyles: Set<string>,
): string[] {
  const importPattern =
    /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*)['"]([^'"]+\.css(?:[?#][^'"]*)?)['"]/g;
  const cssImportPattern =
    /@import\s+(?:url\(\s*(?:['"]([^'"]+\.css(?:[?#][^'"]*)?)['"]|([^\s)]+\.css(?:[?#][^\s)]*)?))\s*\)|['"]([^'"]+\.css(?:[?#][^'"]*)?)['"])/g;
  const links = new Set<string>();
  const imports = [
    ...[...content.matchAll(importPattern)].map((match) => match[1]),
    ...[...content.matchAll(cssImportPattern)].map((match) => match[1] || match[2] || match[3]),
  ];
  for (const importPath of imports) {
    if (!importPath) continue;
    const resolved = resolveRelativePath(filePath, importPath);
    if (resolved && knownStyles.has(resolved)) links.add(resolved);
  }
  return [...links];
}

export function createCssContentMap(files: Record<string, string>): Map<string, string> {
  return new Map(
    Object.entries(files).filter(
      ([path, content]) => path.toLowerCase().endsWith('.css') && typeof content === 'string',
    ),
  );
}
