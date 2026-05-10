import React, { useEffect, useCallback } from 'react';
import FindReplaceBar from './FindReplaceBar';

export default function FindHandler({
  localContent,
  scrollContainerRef,
  showFind,
  setShowFind,
  findQuery,
  setFindQuery,
  replaceQuery,
  setReplaceQuery,
  matchIndex,
  setMatchIndex,
  matches,
  setMatches,
  handleChange,
}) {
  const handleFind = useCallback(() => {
    if (!findQuery) {
      setMatches([]);
      setMatchIndex(-1);
      return;
    }
    const escapedQuery = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'gi');
    const newMatches = [];
    let match;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex match loop
    while ((match = regex.exec(localContent)) !== null) {
      const before = localContent.substring(0, match.index);
      const line = before.split('\n').length;
      const lineStart = before.lastIndexOf('\n') + 1;
      newMatches.push({
        line,
        index: match.index - lineStart,
        absoluteIndex: match.index,
        length: match[0].length,
      });
    }

    setMatches(newMatches);
    setMatchIndex((prev) => {
      if (newMatches.length === 0) return -1;
      if (prev === -1) return 0;
      return prev % newMatches.length;
    });
  }, [findQuery, localContent, setMatches, setMatchIndex]);

  useEffect(() => {
    if (showFind) {
      handleFind();
    }
  }, [handleFind, showFind]);

  // Global shortcut for Find
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFind((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setShowFind]);

  // Scroll to match
  useEffect(() => {
    if (matchIndex !== -1 && matches[matchIndex] && scrollContainerRef.current) {
      const match = matches[matchIndex];
      const lineHeight = 1.6 * 14; // Approximate based on css
      const top = (match.line - 1) * lineHeight + 20; // 20 is padding
      scrollContainerRef.current.scrollTo({
        top: top - 100, // Center it a bit
        behavior: 'smooth',
      });
    }
  }, [matchIndex, matches, scrollContainerRef]);

  // Replacement logic
  const handleReplace = useCallback(() => {
    if (matchIndex === -1 || matches.length === 0) return;
    const match = matches[matchIndex];
    const newVal =
      localContent.substring(0, match.absoluteIndex) +
      replaceQuery +
      localContent.substring(match.absoluteIndex + match.length);

    handleChange({ target: { value: newVal } });
  }, [matchIndex, matches, localContent, replaceQuery, handleChange]);

  const handleReplaceAll = useCallback(() => {
    if (!findQuery) return;
    const escapedQuery = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'gi');
    const newVal = localContent.replace(regex, () => replaceQuery);
    handleChange({ target: { value: newVal } });
    setShowFind(false);
  }, [findQuery, localContent, replaceQuery, handleChange, setShowFind]);

  return (
    <FindReplaceBar
      showFind={showFind}
      setShowFind={setShowFind}
      findQuery={findQuery}
      setFindQuery={setFindQuery}
      replaceQuery={replaceQuery}
      setReplaceQuery={setReplaceQuery}
      matches={matches}
      matchIndex={matchIndex}
      setMatchIndex={setMatchIndex}
      handleFind={handleFind}
      handleReplace={handleReplace}
      handleReplaceAll={handleReplaceAll}
    />
  );
}
