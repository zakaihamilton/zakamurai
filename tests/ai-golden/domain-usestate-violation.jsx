import { EditorState } from '@/components/App/Views/EditorArea';
import { useState } from 'react';

export function BadViewer() {
  const [editor, _setEditor] = useState(EditorState);
  return <div>{editor}</div>;
}
