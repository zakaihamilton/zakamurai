import React from 'react';
import SideBySideEditorView from './SideBySideEditorView';
import SingleEditorView from './SingleEditorView';
import type { EditorContentProps } from './types';

/** Selects the review or standard editor view from controller-computed props. */
export default function EditorContent({
  showSideBySide,
  hasDiff,
  sideBySideProps,
  singleEditorProps,
}: EditorContentProps) {
  return showSideBySide && hasDiff ? (
    <SideBySideEditorView {...sideBySideProps} />
  ) : (
    <SingleEditorView {...singleEditorProps} />
  );
}
