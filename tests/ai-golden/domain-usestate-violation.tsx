import { EditorState } from '@/components/App/Views/EditorArea';
import { useState } from 'react';

export function BadViewer() {
  const [editor, _setEditor] = useState<string | null>(null);
  void EditorState;
  return <div>{editor}</div>;
}
