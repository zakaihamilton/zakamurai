type CssModuleResult = {
  js: string;
  classMap: Record<string, string>;
  scopedCss: string;
  fileHash: string;
};

export const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).substring(0, 6);
};

/** Builds a CSS Module JS entry that applies its scoped styles in a browser preview. */
export function buildCssModuleJavaScript(filePath: string, css: string): CssModuleResult {
  const fileHash = simpleHash(filePath + css);

  const globalMatches: string[] = [];
  const globalBlockMatches: string[] = [];

  let processedCss = css.replace(/:global\s*\(([^)]+)\)/g, (_match, selector: string) => {
    const placeholder = `__CSS_GLOBAL_${globalMatches.length}__`;
    globalMatches.push(selector);
    return placeholder;
  });

  const globalBlockRegex = /:global\s*\{/g;
  while (true) {
    const blockMatch = globalBlockRegex.exec(processedCss);
    if (blockMatch === null) break;

    let braceCount = 1;
    let i = blockMatch.index + blockMatch[0].length;
    while (i < processedCss.length && braceCount > 0) {
      if (processedCss[i] === '{') braceCount++;
      else if (processedCss[i] === '}') braceCount--;
      i++;
    }
    if (braceCount === 0) {
      const blockContent = processedCss.substring(blockMatch.index + blockMatch[0].length, i - 1);
      const placeholder = `__CSS_GLOBAL_BLOCK_${globalBlockMatches.length}__`;
      globalBlockMatches.push(blockContent);
      processedCss =
        processedCss.substring(0, blockMatch.index) + placeholder + processedCss.substring(i);
      globalBlockRegex.lastIndex = 0;
    } else {
      break;
    }
  }

  const classMap: Record<string, string> = {};
  const classRegex = /\.([a-zA-Z][a-zA-Z0-9_-]*)(?=[\s,{.[:#]|$)/g;

  let match: RegExpExecArray | null;
  while (true) {
    match = classRegex.exec(processedCss);
    if (match === null) break;
    const className = match[1];
    if (!classMap[className]) classMap[className] = `${className}_${fileHash}`;
  }

  let scopedCss = processedCss;
  for (const [name, hashed] of Object.entries(classMap)) {
    const replaceRegex = new RegExp(`\\.(${name})(?=[\\s,{.\\[:#]|$)`, 'g');
    scopedCss = scopedCss.replace(replaceRegex, `.${hashed}`);
  }

  globalMatches.forEach((selector, i) => {
    scopedCss = scopedCss.replace(`__CSS_GLOBAL_${i}__`, selector);
  });
  globalBlockMatches.forEach((content, i) => {
    scopedCss = scopedCss.replace(`__CSS_GLOBAL_BLOCK_${i}__`, content);
  });

  const js = `
// CSS Module: ${filePath}
const classMap = ${JSON.stringify(classMap)};
const css = ${JSON.stringify(scopedCss)};

if (typeof document !== 'undefined') {
  const id = 'cssmod-' + ${JSON.stringify(fileHash)};
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.setAttribute('data-vite-dev-id', ${JSON.stringify(filePath)});
    style.textContent = css;
    document.head.appendChild(style);
  }
}

export default classMap;
`;

  return { js, classMap, scopedCss, fileHash };
}
