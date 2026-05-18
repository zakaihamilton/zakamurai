const highlightCache = new Map();
const MAX_CACHE_SIZE = 50;

export const highlightCode = (
  code,
  filePath,
  state,
  styles,
  showFind,
  findQuery,
  matchIndex,
  suggestion,
  cursorPos,
) => {
  if (!code) return '';

  const cacheKey = JSON.stringify([
    code,
    filePath,
    !!state.pendingDiffs?.[filePath],
    state.selectedLines?.[filePath],
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos?.index,
  ]);

  if (highlightCache.has(cacheKey)) {
    return highlightCache.get(cacheKey);
  }

  const fileDiff = state.pendingDiffs?.[filePath];
  const diffs = fileDiff?.diffs || [];
  const selectedLines = state.selectedLines?.[filePath] || [];

  const sortedDiffs = [...diffs].sort((a, b) => b.start - a.start);
  const escapeHtml = (value) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let escaped = code;

  // Insert suggestion marker if present
  const hasSuggestion = suggestion && cursorPos && cursorPos.index !== undefined;
  if (hasSuggestion) {
    const idx = cursorPos.index;
    escaped = `${escaped.substring(0, idx)}\u0005${escaped.substring(idx)}`;
  }

  // Mark diffs with index for tracking original content
  for (let i = 0; i < sortedDiffs.length; i++) {
    const diff = sortedDiffs[i];
    // Adjust diff indices if they are after the suggestion insertion
    const start = hasSuggestion && diff.start >= cursorPos.index ? diff.start + 1 : diff.start;
    const end = hasSuggestion && diff.end >= cursorPos.index ? diff.end + 1 : diff.end;

    escaped = `${escaped.substring(0, start)}\u0003${i}\u0003${escaped.substring(
      start,
      end,
    )}\u0004${escaped.substring(end)}`;
  }

  escaped = escapeHtml(escaped);

  const tokens = [];
  const T_PRE = '\x01';
  const T_POST = '\x02';

  const pushToken = (val, type) => {
    const idx = tokens.length;
    tokens.push({ val, type });
    return `${T_PRE}${idx}${T_POST}`;
  };

  // 1. Strings (highest priority to avoid // in urls being parsed as comments)
  escaped = escaped.replace(
    /("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*?`)/g,
    (m) => pushToken(m, 'hlStr'),
  );

  // 2. Comments
  escaped = escaped.replace(/(\/\/.+)/g, (m) => pushToken(m, 'hlComment'));
  escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, (m) => pushToken(m, 'hlComment'));

  // 3. Language specific (CSS or JSX/HTML)
  if (filePath?.endsWith('.css')) {
    // Properties
    escaped = escaped.replace(/([a-zA-Z\-]+)(?=\s*:)/g, (m) => pushToken(m, 'hlProp'));
    // Selectors (basic)
    escaped = escaped.replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      /(^|(?<=\}))(\u0003\d+\u0003|\u0004|\u0005)*([.#a-zA-Z0-9_\-\[\]="':*]+)(?=\s*\{)/gm,
      (_m, p1, p2, p3) => p1 + (p2 || '') + pushToken(p3, 'hlTag'),
    );
    // Values (after colon, before semicolon)
    escaped = escaped.replace(/(?<=:\s*)([^;\}]+)(?=;|\})/g, (m) => {
      // Highlight hex colors within values
      let val = m.replace(/(#[a-fA-F0-9]{3,8})/g, (c) => pushToken(c, 'hlNum'));
      // Highlight units
      val = val.replace(
        /(\d+)(px|rem|em|%|vh|vw|ms|s|deg)/g,
        (_m2, p1, p2) => `${pushToken(p1, 'hlNum')}${pushToken(p2, 'hlKw')}`,
      );
      return val;
    });
    // Variables
    escaped = escaped.replace(/(var\(--[a-zA-Z0-9\-]+\))/g, (m) => pushToken(m, 'hlFunc'));
  } else {
    // JSX/HTML Tags
    escaped = escaped.replace(
      /(&lt;\/?)([a-zA-Z0-9]+)/g,
      (_m, p1, p2) => `${p1}${pushToken(p2, 'hlTag')}`,
    );
    // Functions
    escaped = escaped.replace(/\b([a-zA-Z0-9_]+)(?=\()/g, (m) => pushToken(m, 'hlFunc'));
    // Attributes
    escaped = escaped.replace(/\b([a-zA-Z\-]+)(?==)/g, (m) => pushToken(m, 'hlAttr'));
  }

  // 4. Keywords
  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005)|\b(export|default|function|return|import|from|const|let|var|if|else|for|while|class|extends|new|true|false|null|undefined|async|await|try|catch|finally|throw|break|continue|case|switch|type|interface|enum|public|private|protected|static|readonly)\b/g,
    (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlKw')),
  );

  // 5. Numbers
  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005)|\b(\d+)\b/g,
    (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlNum')),
  );

  // Search highlights
  let matchCounter = 0;
  const searchRegex =
    showFind && findQuery
      ? new RegExp(
          findQuery
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;'),
          'gi',
        )
      : null;

  const highlightText = (text) => {
    if (!searchRegex || !text) return text;
    return text.replace(searchRegex, (m) => {
      const cls = matchCounter === matchIndex ? 'hlMatchActive' : 'hlMatch';
      matchCounter++;
      return `<span class="${styles[cls]}">${m}</span>`;
    });
  };

  const resolveToken = (idx) => {
    const token = tokens[idx];
    if (!token) return '';

    // Split content to handle nested tokens
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    const parts = token.val.split(/(\x01\d+\x02)/);
    const resolvedContent = parts
      .map((part) => {
        // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
        const match = part.match(/^\x01(\d+)\x02$/);
        if (match) return resolveToken(Number.parseInt(match[1]));
        return highlightText(part);
      })
      .join('');

    return `<span class="${styles[token.type] || ''}">${resolvedContent}</span>`;
  };

  // Final Reconstruction
  // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
  const parts = escaped.split(/(\x01\d+\x02)/);
  escaped = parts
    .map((part) => {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      const match = part.match(/^\x01(\d+)\x02$/);
      if (match) return resolveToken(Number.parseInt(match[1]));
      return highlightText(part);
    })
    .join('');

  // Replace diff markers with spans including original content
  // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
  escaped = escaped.replace(/\u0003(\d+)\u0003/g, (_m, idx) => {
    const diff = sortedDiffs[Number(idx)];
    const original = (diff.original || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return `<span class="${styles.diffHighlight}" data-original="${original || 'Added'}">`;
  });
  // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
  escaped = escaped.replace(/\u0004/g, '</span>');

  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional
    /\u0005/g,
    `<span class="${styles.hlGhost}" aria-hidden="true">${escapeHtml(suggestion || '')}${
      suggestion ? `<span class="${styles.tabHint}">Press <kbd>Tab</kbd></span>` : ''
    }</span>`,
  );

  // Add line selection backgrounds
  const linesArr = escaped.split('\n');
  const finalLines = linesArr.map((line, i) => {
    const isSelected = selectedLines.includes(i + 1);
    if (isSelected) {
      return `<span class="${styles.selectedLineRow}">${line || ' '}</span>`;
    }
    return line;
  });

  const result = finalLines.join('\n');

  // Store in cache
  highlightCache.set(cacheKey, result);
  if (highlightCache.size > MAX_CACHE_SIZE) {
    const firstKey = highlightCache.keys().next().value;
    highlightCache.delete(firstKey);
  }

  return result;
};
