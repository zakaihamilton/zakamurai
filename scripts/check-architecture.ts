import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const COMPONENTS_DIR = path.join(ROOT, 'src/components');

const FORBIDDEN_IMPORTS = [
  { pattern: /from\s+['"]redux['"]/, reason: 'Redux is forbidden; use proxy state.' },
  { pattern: /from\s+['"]zustand['"]/, reason: 'Zustand is forbidden; use proxy state.' },
  { pattern: /from\s+['"]recoil['"]/, reason: 'Recoil is forbidden; use proxy state.' },
  { pattern: /from\s+['"]tailwindcss['"]/, reason: 'Tailwind is forbidden; use CSS Modules.' },
];

const COLOCATION_EXEMPT =
  /\/(icons|state)\/|(?:Handler|Bridge|Restorer|Sync|Diff|FindHandler|Node|InitialData|highlighter|highlightClient|Protocol)\.(?:js|ts|tsx)$/;

type ArchitectureViolation = { file: string; reason: string };

const LINE_BUDGETS: Record<string, number> = {
  'src/components/AI/Agent/ActionLoop.ts': 1600,
  'src/components/AI/WebLLMAPI.tsx': 1150,
  'src/components/Storage/Settings.ts': 850,
  'src/components/App/Views/EditorArea/highlighter.tsx': 800,
  'src/components/App/Panes/Prompt/useAgentRunner.tsx': 750,
  'src/components/AI/Agent/ManagerRunner.ts': 700,
};

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(entryPath);
      if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) return [];
      if (/\.(test|spec)\.(js|jsx|ts|tsx)$/.test(entry.name)) return [];
      return [entryPath];
    }),
  );
  return files.flat();
}

function relativePath(filePath: string): string {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function expectedModuleBase(filePath: string): string {
  const fileName = path.basename(filePath, path.extname(filePath));
  if (fileName === 'index') {
    return path.basename(path.dirname(filePath));
  }
  return fileName;
}

function checkCssModuleColocation(filePath: string, content: string): ArchitectureViolation[] {
  const rel = relativePath(filePath);
  if (COLOCATION_EXEMPT.test(rel)) return [];

  const expectedModulePath = path.join(
    path.dirname(filePath),
    `${expectedModuleBase(filePath)}.module.css`,
  );
  const violations: ArchitectureViolation[] = [];

  for (const match of content.matchAll(
    /import\s+(?:\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]/g,
  )) {
    const importPath = match[1];
    const importedModulePath = path.resolve(path.dirname(filePath), importPath);
    if (importedModulePath !== expectedModulePath) {
      violations.push({
        file: rel,
        reason: `CSS module must be co-located: expected ./${expectedModuleBase(filePath)}.module.css, found ${importPath}.`,
      });
    }
  }

  return violations;
}

function inlineStyleKeysAreCssVarsOnly(content: string): boolean {
  const styleBlocks = [...content.matchAll(/style=\{\{([\s\S]*?)\}\}/g)];
  for (const [, body] of styleBlocks) {
    // A spread can carry arbitrary style keys, so it cannot be proved CSS-variable-only.
    if (/\.\.\./.test(body)) return false;

    const keys = [...body.matchAll(/['"]?([-\w]+)['"]?\s*:/g)]
      .map((match) => match[1])
      .filter((key) => key !== 'style');
    for (const key of keys) {
      if (!key.startsWith('--')) {
        return false;
      }
    }
  }
  return true;
}

function checkGlobalClassNames(content: string): boolean {
  for (const match of content.matchAll(/className=\{(`[^`]*`)\}/g)) {
    const stripped = match[1].replace(/\$\{styles\.[^}]+\}/g, '').replace(/\$\{[^}]+\}/g, '');
    if (/\b[a-zA-Z][\w-]*\b/.test(stripped)) {
      return true;
    }
  }

  for (const match of content.matchAll(/className=['"]([^'"]+)['"]/g)) {
    if (match[1].trim()) {
      return true;
    }
  }

  // Catch ordinary JSX expressions such as:
  // className={isOpen ? 'open' : styles.closed}
  // className={isOpen && 'open'}
  for (const match of content.matchAll(/className=\{([^{}]*)\}/g)) {
    for (const stringLiteral of match[1].matchAll(/['"]([^'"]+)['"]/g)) {
      if (stringLiteral[1].trim()) return true;
    }
  }

  return false;
}

function checkFile(filePath: string, content: string): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = [];
  const rel = relativePath(filePath);

  for (const { pattern, reason } of FORBIDDEN_IMPORTS) {
    if (pattern.test(content)) violations.push({ file: rel, reason });
  }

  if (/className=['"].*(?:bg-|text-|p-|m-|flex|grid).*['"]/.test(content)) {
    violations.push({ file: rel, reason: 'Tailwind-style utility classes are forbidden.' });
  }

  const forbiddenDomainUseState =
    /const\s+\[[^\]]+\]\s*=\s*useState\s*\([^)]*(?:AppState|EditorState|TabState|SidebarState|LogState|PreviewState|PromptState|PromptUiState|AgentSessionState|ChangeSetState|RagState|WorkspaceHealthState)/.test(
      content,
    );
  if (forbiddenDomainUseState) {
    violations.push({
      file: rel,
      reason: 'React useState is forbidden for shared domain state; use XState.useState hooks.',
    });
  }

  violations.push(...checkCssModuleColocation(filePath, content));

  const importsCssModule = /from\s+['"].*\.module\.css['"]/.test(content);
  if (importsCssModule && /style=\{\{/.test(content) && !inlineStyleKeysAreCssVarsOnly(content)) {
    violations.push({
      file: rel,
      reason:
        'Inline styles are forbidden in components that use CSS Modules (CSS custom properties only).',
    });
  }

  if (importsCssModule && checkGlobalClassNames(content)) {
    violations.push({
      file: rel,
      reason: 'Global className strings are forbidden; use CSS module classes only.',
    });
  }

  const lineBudget = LINE_BUDGETS[rel];
  if (lineBudget && content.split('\n').length > lineBudget) {
    violations.push({
      file: rel,
      reason: `Module exceeds its maintainability budget of ${lineBudget} lines.`,
    });
  }

  return violations;
}

async function main(): Promise<void> {
  const files = await collectSourceFiles(COMPONENTS_DIR);
  const violations: ArchitectureViolation[] = [];

  for (const filePath of files) {
    const content = await readFile(filePath, 'utf8');
    violations.push(...checkFile(filePath, content));
  }

  if (violations.length > 0) {
    const details = violations.map((v) => `- ${v.file}: ${v.reason}`).join('\n');
    throw new Error(`Architecture check failed:\n${details}`);
  }

  console.log(`Architecture check passed (${files.length} component files).`);
}

main().catch((error) => {
  if (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  ) {
    throw new Error(`Components directory not found: ${COMPONENTS_DIR}`);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
