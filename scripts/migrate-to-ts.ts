#!/usr/bin/env node
/**
 * Bulk-renames project JS/JSX sources to TS/TSX and updates import specifiers.
 * Skips public/, node_modules/, and scratch/.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'public',
  'coverage',
  'playwright-report',
  'test-results',
  '.git',
]);

const JSX_RE = /<\s*[A-Za-z/!]|import\s+type\s+.*from\s+['"]react['"]|from\s+['"]react['"]/;

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function targetExt(filePath: string, content: string): string | null {
  const base = path.basename(filePath);
  if (base.endsWith('.jsx')) return '.tsx';
  if (base.endsWith('.mjs')) return '.ts';
  if (base.endsWith('.test.js')) {
    return JSX_RE.test(content) ? '.test.tsx' : '.test.ts';
  }
  if (base.endsWith('.spec.js')) {
    return JSX_RE.test(content) ? '.spec.tsx' : '.spec.ts';
  }
  if (base.endsWith('.js')) {
    if (JSX_RE.test(content)) return '.tsx';
    return '.ts';
  }
  return null;
}

function renamePath(filePath: string, content: string): string | null {
  const ext = targetExt(filePath, content);
  if (!ext) return null;
  const without = filePath.replace(/\.(js|jsx|mjs)$/, '');
  return `${without}${ext}`;
}

function updateImports(content: string): string {
  return content.replace(
    /(from\s+['"])(\.{1,2}\/[^'"]+?)(\.(?:js|jsx|mjs))?(?=['"])/g,
    (match, prefix: string, importPath: string, oldExt?: string) => {
      if (!oldExt) return match;
      return `${prefix}${importPath.replace(/\.(js|jsx|mjs)$/, '')}`;
    },
  );
}

const files = [
  ...walk(path.join(ROOT, 'src')),
  ...walk(path.join(ROOT, 'tests')),
  ...walk(path.join(ROOT, 'scripts')),
].filter((f) => !f.includes('/public/'));

const renames: Array<{ from: string; to: string; content: string }> = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const next = renamePath(file, content);
  if (!next || next === file) continue;
  renames.push({ from: file, to: next, content });
}

// Longest paths first to avoid nested rename conflicts.
renames.sort((a, b) => b.from.length - a.from.length);

for (const { from, to, content } of renames) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const updated = updateImports(content);
  fs.writeFileSync(to, updated);
  fs.unlinkSync(from);
  console.log(`${path.relative(ROOT, from)} -> ${path.relative(ROOT, to)}`);
}

// Update import paths in all ts/tsx files after renames.
const allSources = walk(ROOT).filter((f) => /\.(ts|tsx)$/.test(f));
for (const file of allSources) {
  let content = fs.readFileSync(file, 'utf8');
  const next = updateImports(content);
  if (next !== content) fs.writeFileSync(file, next);
}

console.log(`Renamed ${renames.length} files.`);
