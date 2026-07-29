import { EditorState } from '@/components/App/Views/EditorArea';

export function GoodViewer() {
  const editorState = EditorState.useState(['fileContents']);
  return <div>{editorState?.fileContents ? 'loaded' : 'empty'}</div>;
}
