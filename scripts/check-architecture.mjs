import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const COMPONENTS_DIR = path.join(ROOT, 'src/components');

const FORBIDDEN_IMPORTS = [
  { pattern: /from\s+['"]redux['"]/, reason: 'Redux is forbidden; use proxy state.' },
  { pattern: /from\s+['"]zustand['"]/, reason: 'Zustand is forbidden; use proxy state.' },
  { pattern: /from\s+['"]recoil['"]/, reason: 'Recoil is forbidden; use proxy state.' },
  { pattern: /from\s+['"]tailwindcss['"]/, reason: 'Tailwind is forbidden; use CSS Modules.' },
];

const INLINE_STYLE_ALLOWLIST = new Set([
  'src/components/App/PreviewHost/PreviewHost.js',
  'src/components/App/Panes/Sidebar/VirtualList.js',
  'src/components/App/Views/EditorArea/NavigationPopup.js',
  'src/components/ui/icons/ZLogo.js',
  'src/components/App/Panes/Sidebar/TreeItem.js',
  'src/components/ui/ContextMenu/ContextMenu.js',
  'src/components/App/Panes/Sidebar/CreateRowInput.js',
  'src/components/ui/Tooltip/Tooltip.js',
  'src/components/App/Views/ImageViewer/ImageViewer.js',
  'src/components/App/Views/PreviewArea/IframeContainer/IframeContainer.js',
]);

async function collectSourceFiles(directory) {
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

function relativePath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function checkFile(filePath, content) {
  const violations = [];
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

  const importsCssModule = /from\s+['"].*\.module\.css['"]/.test(content);
  if (importsCssModule && /style=\{\{/.test(content) && !INLINE_STYLE_ALLOWLIST.has(rel)) {
    violations.push({
      file: rel,
      reason: 'Inline styles are forbidden in components that use CSS Modules.',
    });
  }

  return violations;
}

try {
  const files = await collectSourceFiles(COMPONENTS_DIR);
  const violations = [];

  for (const filePath of files) {
    const content = await readFile(filePath, 'utf8');
    violations.push(...checkFile(filePath, content));
  }

  if (violations.length > 0) {
    const details = violations.map((v) => `- ${v.file}: ${v.reason}`).join('\n');
    throw new Error(`Architecture check failed:\n${details}`);
  }

  console.log(`Architecture check passed (${files.length} component files).`);
} catch (error) {
  if (error.code === 'ENOENT') {
    throw new Error(`Components directory not found: ${COMPONENTS_DIR}`);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
