import type { CursorPosition } from '@/types/domain-types';
import { findNavigationTargets } from '@/utils/navigation';
import type { NavigationTarget } from '@/utils/navigation/types';
import { countLines, decodeIdx, encodeIdx, escapeHtml, getLineColumn } from './highlightUtils';
import type { HighlightDebug, HighlightEditorState, HighlightStyles } from './types';

export const END_OF_SOURCE = '\u0008';

export type TokenRecord = { val: string; type: string };

export function insertSourceMarkers({
  code,
  filePath,
  state,
  suggestion,
  cursorPos,
  navigationLinksEnabled,
  isOriginal,
}: {
  code: string;
  filePath: string;
  state: HighlightEditorState;
  suggestion?: string;
  cursorPos?: CursorPosition;
  navigationLinksEnabled: boolean;
  isOriginal: boolean;
}): { escaped: string; navigationTargets: HighlightDebug['navigationTargets'] } {
  const fileDiff = state.pendingDiffs?.[filePath];
  const diffs = fileDiff?.diffs || [];
  const sortedDiffs = [...diffs].sort((a, b) => {
    const startA = isOriginal ? (a.origStart ?? a.start ?? 0) : (a.start ?? 0);
    const startB = isOriginal ? (b.origStart ?? b.start ?? 0) : (b.start ?? 0);
    return startB - startA;
  });

  let escaped = `${code}${END_OF_SOURCE}`;

  // Track index mapping
  const mapIndex = new Int32Array(code.length + 1);
  for (let i = 0; i <= code.length; i++) {
    mapIndex[i] = i;
  }
  const shiftIndices = (fromIdx: number, amount: number) => {
    for (let i = fromIdx; i <= code.length; i++) {
      mapIndex[i] += amount;
    }
  };

  // Insert diff markers before navigation markers. Diff offsets are source offsets;
  // inserting navigation markers first made the mapping drift in JSX with many links.
  for (let i = 0; i < sortedDiffs.length; i++) {
    const diff = sortedDiffs[i];
    // Pure insertions have no removed text on the original side.
    if (isOriginal && !diff.original) continue;
    const finalStart = isOriginal ? (diff.origStart ?? diff.start ?? 0) : (diff.start ?? 0);
    const finalEnd = isOriginal ? (diff.origEnd ?? diff.end ?? 0) : (diff.end ?? 0);
    const endMapped = mapIndex[finalEnd];
    escaped = `${escaped.substring(0, endMapped)}\u0004${escaped.substring(endMapped)}`;
    shiftIndices(finalEnd, 1);

    const startMarker = `\u0003${i}\u0003`;
    const startMapped = mapIndex[finalStart];
    escaped = `${escaped.substring(0, startMapped)}${startMarker}${escaped.substring(startMapped)}`;
    shiftIndices(finalStart, startMarker.length);
  }

  // Insert target markers when navigation links are enabled
  let targets: NavigationTarget[] = [];
  if (navigationLinksEnabled) {
    targets = findNavigationTargets(
      code,
      filePath?.endsWith('.css'),
      state?.fileContents || {},
      filePath,
    );
  }
  const navigationTargets = targets.map((target) => ({
    ...target,
    position: getLineColumn(code, target.start),
  }));

  // Sort targets in descending order of start index to insert without interference
  const sortedTargets = [...targets].sort((a, b) => b.start - a.start);
  for (let idx = 0; idx < sortedTargets.length; idx++) {
    const target = sortedTargets[idx];
    const targetIdx = targets.indexOf(target);

    const endPos = mapIndex[target.end];
    escaped = `${escaped.substring(0, endPos)}\u0007${escaped.substring(endPos)}`;
    shiftIndices(target.end, 1);

    const startMarker = `\u0006${encodeIdx(targetIdx)}\u0006`;
    const startPos = mapIndex[target.start];
    escaped = `${escaped.substring(0, startPos)}${startMarker}${escaped.substring(startPos)}`;
    shiftIndices(target.start, startMarker.length);
  }

  // Insert suggestion marker
  const hasSuggestion = suggestion && cursorPos && cursorPos.index !== undefined;
  if (hasSuggestion) {
    const idx = cursorPos.index ?? 0;
    const mappedIdx = mapIndex[idx];
    escaped = `${escaped.substring(0, mappedIdx)}\u0005${escaped.substring(mappedIdx)}`;
  }

  return { escaped: escapeHtml(escaped), navigationTargets };
}

export function resolveTokensAndSearch({
  escaped,
  tokens,
  styles,
  showFind,
  findQuery,
  matchIndex,
}: {
  escaped: string;
  tokens: TokenRecord[];
  styles: HighlightStyles;
  showFind: boolean;
  findQuery: string;
  matchIndex: number;
}): { html: string; matchCount: number } {
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

  const highlightText = (text: string): string => {
    if (!searchRegex || !text) return text;
    return text.replace(searchRegex, (m) => {
      const cls = matchCounter === matchIndex ? 'hlMatchActive' : 'hlMatch';
      matchCounter++;
      return `<span class="${styles[cls]}">${m}</span>`;
    });
  };

  const resolveToken = (idx: number): string => {
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

  // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
  const parts = escaped.split(/(\x01\d+\x02)/);
  const html = parts
    .map((part) => {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      const match = part.match(/^\x01(\d+)\x02$/);
      if (match) return resolveToken(Number.parseInt(match[1]));
      return highlightText(part);
    })
    .join('');

  return { html, matchCount: matchCounter };
}

export function finalizeHighlightLines({
  escaped,
  code,
  styles,
  suggestion,
  selectedLines,
  isOriginal,
}: {
  escaped: string;
  code: string;
  styles: HighlightStyles;
  suggestion?: string;
  selectedLines: number[];
  isOriginal: boolean;
}): string {
  const openDiffSpan = (idx: number): string => {
    void idx;
    if (isOriginal) {
      return `<span class="${styles.diffDeleteHighlight || 'diffDeleteHighlight'}">`;
    }
    return `<span class="${styles.diffHighlight}">`;
  };

  let output = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional
    /\u0005/g,
    `<span class="${styles.hlGhost}" aria-hidden="true">${escapeHtml(suggestion || '')}${
      suggestion ? `<span class="${styles.tabHint}">Press <kbd>Tab</kbd></span>` : ''
    }</span>`,
  );

  const endOfSourceIndex = output.indexOf(END_OF_SOURCE);
  if (endOfSourceIndex !== -1) output = output.slice(0, endOfSourceIndex);

  // Replace navigation target markers with styled links
  // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
  output = output.replace(/\u0006([a-j]+)\u0006/g, (_m, idxStr) => {
    const targetIdx = decodeIdx(idxStr);
    return `<span class="${styles.navLink}" data-nav-target="true" data-nav-idx="${targetIdx}">`;
  });
  // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
  output = output.replace(/\u0007/g, '</span>');

  // Add line selection backgrounds
  const linesArr = output.split('\n').slice(0, countLines(code));
  let activeDiff: number | null = null;
  const finalLines = linesArr.map((rawLine, i) => {
    let line = activeDiff === null ? rawLine : `${openDiffSpan(activeDiff)}${rawLine}`;
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
    line = line.replace(/\u0003(\d+)\u0003/g, (_marker, idx) => {
      activeDiff = Number(idx);
      return openDiffSpan(activeDiff);
    });
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
    line = line.replace(/\u0004/g, () => {
      activeDiff = null;
      return '</span>';
    });
    if (activeDiff !== null) line += '</span>';
    const isSelected = selectedLines.includes(i + 1);
    const lineClass = isSelected ? styles.selectedLineRow : '';
    return `<span class="${styles.lineRow || 'lineRow'} ${lineClass}" data-line="${i + 1}" style="display: block;">${line || ' '}</span>`;
  });

  return finalLines.join('');
}
