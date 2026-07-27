import { useState } from 'react';
import { EditorState } from '@/components/App/Views/EditorArea';

export function BadViewer() {
  const [editor, setEditor] = useState(EditorState);
  return <div>{editor}</div>;
}
