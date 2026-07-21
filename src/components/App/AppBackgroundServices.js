import { useRagIndexer } from '@/components/AI/RagIndexer';
import { useTabRestorer } from '@/components/App/Panes/TabBar/TabRestorer';
import { usePreviewRestorer } from '@/components/App/Views/PreviewArea/PreviewRestorer';
import { usePreviewErrorBridge } from '@/components/App/Views/PreviewArea/usePreviewErrorBridge';
import { useKeyboardHandler } from '@/components/App/keyboard/KeyboardHandler';
import { useContentSaver } from '@/components/Storage/ContentSaver';
import { useOfflineSupport } from './OfflineSupport';

export function useAppBackgroundServices() {
  useOfflineSupport();
  useTabRestorer();
  usePreviewRestorer();
  usePreviewErrorBridge();
  useContentSaver();
  useKeyboardHandler();
  useRagIndexer();
}
