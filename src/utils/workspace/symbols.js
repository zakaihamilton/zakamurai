const WEB_EXTENSIONS = /\.(?:[cm]?[jt]sx?|json|css|html?)$/i;

export function getLanguage(path = '') {
  const extension = path.split('.').pop()?.toLowerCase();
  if (['js', 'mjs', 'cjs', 'jsx'].includes(extension)) return 'javascript';
  if (['ts', 'mts', 'cts', 'tsx'].includes(extension)) return 'typescript';
  if (extension === 'css') return 'css';
  if (extension === 'json') return 'json';
  if (['html', 'htm'].includes(extension)) return 'html';
  return 'text';
}

export function isIndexablePath(path) {
  return WEB_EXTENSIONS.test(path);
}

export function extractSymbols(path, content = '') {
  const language = getLanguage(path);
  const symbols = [];
  const add = (name, kind, index) => {
    const before = content.slice(0, index);
    symbols.push({
      name,
      kind,
      line: before.split('\n').length,
      column: index - before.lastIndexOf('\n'),
    });
  };
  const patterns =
    language === 'css'
      ? [[/\.([A-Za-z_-][\w-]*)/g, 'class']]
      : language === 'html'
        ? [[/<([A-Za-z][\w-]*)/g, 'element']]
        : [
            [/\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, 'function'],
            [
              /\b(?:export\s+)?(?:const|let|var|class|interface|type)\s+([A-Za-z_$][\w$]*)/g,
              'symbol',
            ],
          ];
  for (const [pattern, kind] of patterns) {
    let match = pattern.exec(content);
    while (match) {
      add(match[1], kind, match.index);
      match = pattern.exec(content);
    }
  }
  return symbols;
}

export function extractImports(content = '') {
  const imports = [];
  const pattern = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match = pattern.exec(content);
  while (match) {
    imports.push(match[1]);
    match = pattern.exec(content);
  }
  return imports;
}
