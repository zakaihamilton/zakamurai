import { useRagIndexer } from '@/components/AI/RagIndexer';
import { useKeyboardHandler } from '@/components/App/Manager/KeyboardHandler';
import { useTabRestorer } from '@/components/App/Panes/TabBar/TabRestorer';
import { usePreviewRestorer } from '@/components/App/Views/PreviewArea/PreviewRestorer';
import { useContentSaver } from '@/components/Storage/ContentSaver';

export function useAppBackgroundServices() {
  useTabRestorer();
  usePreviewRestorer();
  useContentSaver();
  useKeyboardHandler();
  useRagIndexer();
}
