import { TabState } from '@/components/App/Panes/TabBar';
import { useFileSystem } from '@/components/Storage';
import { Node } from 'triactor';
import { createState } from 'triactor';
import EditorSurface from './EditorSurface';
import type { EditorAreaProps, ExtendedEditorState } from './types';
import useEditorAreaController from './useEditorAreaController';

export const EditorState = createState<ExtendedEditorState>('EditorState');

export default function EditorArea({ file, fsHandle }: EditorAreaProps) {
  return (
    <Node id={file?.path?.join('/') || file?.name || 'EditorArea'}>
      <EditorAreaInner file={file} fsHandle={fsHandle} />
    </Node>
  );
}

function EditorAreaInner({ file, fsHandle }: EditorAreaProps) {
  const tabState = TabState.useState(['activeTabId', 'openTabs']);
  const fs = useFileSystem();
  const state = EditorState.useState([
    'pendingDiffs',
    'pendingDeletions',
    'fileContents',
    'isReadOnly',
    'selectedLines',
    'cursorPos',
    'aiCompletionEnabled',
  ]);
  if (!state) return null;
  const filePath = file?.path?.join('/') || file?.name || '';
  const surfaceProps = useEditorAreaController({ file, fsHandle, filePath, fs, tabState, state });

  return <EditorSurface {...surfaceProps} />;
}
