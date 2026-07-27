import { EditorState } from '@/components/App/Views/EditorArea';

export function CodeViewer() {
  const editorState = EditorState.useState(['fileContents']);
  return <div>{editorState.fileContents['/app.js']}</div>;
}
